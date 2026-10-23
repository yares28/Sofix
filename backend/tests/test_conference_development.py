"""Conference recovery must never select on the exposed release holdout."""

from copy import deepcopy

import numpy as np
import pytest

from app.research import conference_development as development
from app.research.conference_development import development_population, mixture, select_candidate
from app.research.european_cases import digest


def packet(rows):
    result = {"football": rows}
    return {**result, "caseSha256": digest(result)}


def row(year, ident):
    return {"competition": "CONF", "season": year, "id": ident, "date": f"{year}-10-01T18:00:00Z"}


def test_development_excludes_exposed_and_current_seasons_before_model_input():
    old = [row(2021, "warmup"), row(2022, "target")]
    future = [row(y, str(y)) for y in (2023, 2024, 2025, 2026)]
    history, targets = development_population(packet(old + future), expected_games=1)
    assert history == old
    assert targets == [old[1]]
    changed = deepcopy(future)
    for r in changed:
        r.update(hg=9999, ag=9999, lock="1900-01-01T00:00:00Z")
    assert development_population(packet(old + changed), expected_games=1) == (history, targets)


def test_changed_packet_missing_target_or_season_date_conflict_is_rejected():
    saved = packet([row(2021, "warmup"), row(2022, "target")])
    saved["football"][0]["id"] = "changed"
    with pytest.raises(ValueError, match="checksum"):
        development_population(saved, expected_games=1)
    with pytest.raises(ValueError, match="coverage"):
        development_population(packet([row(2021, "warmup")]), expected_games=1)
    bad = row(2022, "target")
    bad["date"] = "2025-10-01T18:00:00Z"
    with pytest.raises(ValueError, match="season"):
        development_population(packet([bad]), expected_games=1)


def test_duplicate_games_are_not_counted_as_complete_coverage():
    with pytest.raises(ValueError, match="Repeated"):
        development_population(packet([row(2022, "same")] * 2), expected_games=2)


def test_score_mixture_preserves_probability_mass_and_goal_cs_consistency():
    club = {"p_h": 0.8, "p_d": 0.1, "p_a": 0.1, "lam_h": 3.0, "lam_a": 0.5, "cs_h": 0.6, "cs_a": 0.05}
    average = {"p_h": 0.4, "p_d": 0.3, "p_a": 0.3, "lam_h": 1.5, "lam_a": 1.2, "cs_h": 0.3, "cs_a": 0.2}
    combined = mixture(club, average, 0.25)
    assert sum(combined[k] for k in ("p_h", "p_d", "p_a")) == pytest.approx(1)
    assert combined["p_h"] == pytest.approx(0.5)
    assert combined["lam_h"] == pytest.approx(1.875)
    assert combined["cs_h"] == pytest.approx(0.375)
    for weight in (-1, 2, np.nan):
        with pytest.raises(ValueError):
            mixture(club, average, weight)


def test_selection_is_deterministic_never_validates_and_rejects_other_metric_loss():
    base = {"rps": 0.24, "brier": 0.65, "logLoss": 1.1}
    good = {"rps": 0.23, "brier": 0.64, "logLoss": 1.09}
    candidates = [{"weight": w, "model": good} for w in (0.75, 0.25, 0.5, 1.0)]
    result = select_candidate(candidates, base)
    assert result["weight"] == 0.25
    assert result["recommendedForProspectiveCapture"] is True
    assert result["validated"] is result["modelEligible"] is False
    for candidate in candidates:
        candidate["model"] = {**good, "brier": 0.66}
    assert select_candidate(candidates, base)["recommendedForProspectiveCapture"] is False


def test_mixture_rejects_nonfinite_goals_or_impossible_clean_sheets():
    valid = {"p_h": 0.5, "p_d": 0.2, "p_a": 0.3, "lam_h": 1.5, "lam_a": 1.0, "cs_h": 0.3, "cs_a": 0.2}
    for changed in ({"lam_h": np.inf}, {"lam_a": -1}, {"cs_h": 2}, {"p_d": 1}):
        with pytest.raises(ValueError):
            mixture({**valid, **changed}, {**valid, **changed}, 0.75)


def test_whole_replay_never_passes_future_outcomes_into_fit(monkeypatch):
    import pandas as pd

    warmup = {
        **row(2021, "warmup"),
        "home": "A",
        "away": "B",
        "hg": 1,
        "ag": 1,
        "availableAt": "2021-10-03T18:00:00Z",
        "neutral": False,
    }
    targets = [
        {**warmup, **row(2022, str(i)), "availableAt": "2022-10-03T18:00:00Z"}
        for i in range(development.EXPECTED_GAMES)
    ]
    future = {**warmup, **row(2025, "exposed"), "hg": 9999}
    calls = []

    class Model:
        def predict(self, home, away, *, neutral):
            assert len(home) == len(away) == len(neutral) == 141
            return pd.DataFrame(
                [
                    {
                        "p_h": 0.4,
                        "p_d": 0.3,
                        "p_a": 0.3,
                        "lam_h": 1.0,
                        "lam_a": 1.0,
                        "cs_h": 0.36,
                        "cs_a": 0.36,
                        "p_00": 0.13,
                    }
                ]
                * len(home)
            )

    def fake_fit(frame, cutoff, *, teams):
        assert set(frame["season"]) == {2021, 2022}
        assert "exposed" not in set(frame["id"])
        assert set(teams) == {"A", "B"}
        calls.append(cutoff)
        return Model()

    monkeypatch.setattr(development, "fit", fake_fit)
    result = development.replay(packet([warmup, *targets, future]))
    assert len(calls) == 1
    assert result["games"] == 141
    assert result["validated"] is result["modelEligible"] is False
