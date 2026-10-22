"""Evaluation gates must reject leakage, incomplete identity and optimistic claims."""

from datetime import UTC, datetime

import numpy as np
import pandas as pd
import pytest

from app.research import league_xscore_validation as v


def test_actual_window_cutoff_is_used_and_uncovered_games_fail():
    rows = [
        {
            "slug": "w",
            "startDate": "2025-08-01T14:00:00Z",
            "endDate": "2025-08-05T14:00:00Z",
            "cutOffDate": "2025-08-01T13:00:00Z",
        }
    ]
    key, cutoff = v.window_for("2025-08-02T12:00:00Z", rows)
    assert key == "w" and cutoff.hour == 13
    with pytest.raises(ValueError):
        v.window_for("2025-08-06T12:00:00Z", rows)


def test_fdr_training_excludes_results_on_or_after_the_lock(monkeypatch):
    history = pd.DataFrame(
        {"date": pd.to_datetime(["2025-07-31", "2025-08-01", "2025-08-02"]), "home": ["A"] * 3, "away": ["B"] * 3}
    )
    seen = []
    monkeypatch.setattr(v, "fit_dixon_coles", lambda frame, *args, **kwargs: seen.append(frame.copy()) or "fit")
    got = v.fit_before(history, datetime(2025, 8, 1, 13, tzinfo=UTC), ["A", "B"])
    assert got == "fit" and len(seen[0]) == 1


def test_own_form_cannot_see_an_earlier_game_in_the_same_locked_week():
    history = [(datetime(2025, 7, 29, tzinfo=UTC), 40.0, False), (datetime(2025, 8, 2, tzinfo=UTC), 100.0, True)]
    form = v.form_before(history, datetime(2025, 8, 1, 13, tzinfo=UTC))
    assert form[2] == pytest.approx((40 + 2 * 51) / 3)
    assert form[1] < 50


def test_bootstrap_keeps_whole_weeks_and_a_tie_cannot_pass():
    y = np.array([10.0, 20.0, 30.0, 40.0])
    groups = ["w1", "w1", "w2", "w2"]
    tied = v.compare(y, y + 2, y + 2, groups, draws=100)
    assert tied["lo"] == 0 and tied["hi"] == 0
    good = v.compare(y, y, y + 2, groups, draws=100)
    assert good["hi"] < 0


def test_release_rejects_partial_cohort_and_each_failed_metric():
    result = {
        "coverageComplete": True,
        "positions": {p: {"cases": 200, "rmse": 10.0, "formRmse": 11.0} for p in ["GK", "DEF", "MID", "FWD"]},
        "versusForm": {"hi": -0.1},
        "versusAblation": {"hi": -0.01},
        "model": {"within7": 0.5, "pairs": 0.6},
        "form": {"within7": 0.49, "pairs": 0.59},
    }
    assert v.release_reasons(result) == []
    result["coverageComplete"] = False
    assert "coverage" in " ".join(v.release_reasons(result))
    result["coverageComplete"] = True
    result["versusAblation"]["hi"] = 0.01
    assert "FDR" in " ".join(v.release_reasons(result))
    result["versusAblation"]["hi"] = float("nan")
    assert v.release_reasons(result)


def test_ambiguous_or_unknown_team_mapping_never_fuzzy_matches():
    assert v.club_name({"name": "Manchester United"}, {"Man United"}) == "Man United"
    with pytest.raises(ValueError):
        v.club_name({"name": "United"}, {"Man United", "Newcastle"})


def sample_game():
    raw = {
        "id": "g",
        "statusTyped": "played",
        "date": "2025-08-02T12:00:00Z",
        "homeTeam": {"slug": "a", "name": "A"},
        "awayTeam": {"slug": "b", "name": "B"},
        "homeGoals": 0,
        "awayGoals": 1,
    }
    players = []
    for side in ["a", "b"]:
        xi = []
        for i in range(11):
            slug = f"{side}{i}"
            xi.append({"slug": slug})
            players.append(
                {
                    "slug": slug,
                    "pos": "GK" if i == 0 else "DEF",
                    "team": side,
                    "score": 0.0 if i == 0 else 40.0,
                    "level": 35.0,
                    "ver": 7,
                    "status": "FINAL",
                    "played": True,
                    "started": True,
                    "cleanSheet60": 0 if side == "a" else 1,
                    "goalsConceded": 1 if side == "a" else 0,
                    "mins": 90,
                }
            )
        raw["homeFormation" if side == "a" else "awayFormation"] = {
            "startingLineupAvailable": True,
            "startingLineup": [xi],
        }
    history = pd.DataFrame(
        {
            "season_start": [2025],
            "date": pd.to_datetime(["2025-08-02"]),
            "home": ["A"],
            "away": ["B"],
            "hg": [0],
            "ag": [1],
        }
    )
    windows = [
        {
            "slug": "w",
            "startDate": "2025-08-01T14:00:00Z",
            "endDate": "2025-08-05T14:00:00Z",
            "cutOffDate": "2025-08-01T14:00:00Z",
        }
    ]
    return {"raw": raw, "players": players}, history, windows


def test_complete_elevens_keep_a_real_zero_but_reject_a_null_or_wrong_side(monkeypatch):
    from types import SimpleNamespace

    model = SimpleNamespace(
        predict=lambda *args: pd.DataFrame([{"cs_h": 0.4, "cs_a": 0.3, "lam_h": 1.2, "lam_a": 1.0}])
    )
    monkeypatch.setattr(v, "fit_before", lambda *args: model)
    game, history, windows = sample_game()
    rows, coverage = v.prepare("PL", [game], windows, history)
    assert coverage["complete"] and len(rows) == 22 and rows[0]["score"] == 0
    game["players"][0]["score"] = None
    rows, coverage = v.prepare("PL", [game], windows, history)
    assert not coverage["complete"] and not rows
    game["players"][0]["score"] = 0
    game["players"][0]["team"] = "unrelated"
    rows, coverage = v.prepare("PL", [game], windows, history)
    assert not coverage["complete"] and not rows


def test_missing_starter_or_unknown_score_version_fails_the_cohort(monkeypatch):
    game, history, windows = sample_game()
    game["players"][0]["ver"] = None
    rows, coverage = v.prepare("PL", [game], windows, history)
    assert not rows and not coverage["complete"]
    game["players"][0]["ver"] = 7
    game["players"].pop()
    rows, coverage = v.prepare("PL", [game], windows, history)
    assert not rows and "elevens" in coverage["issues"][0]["reason"]


def test_keeper_clean_sheet_uses_his_playing_period_not_the_final_team_score(monkeypatch):
    from types import SimpleNamespace

    model = SimpleNamespace(
        predict=lambda *args: pd.DataFrame([{"cs_h": 0.4, "cs_a": 0.3, "lam_h": 1.2, "lam_a": 1.0}])
    )
    monkeypatch.setattr(v, "fit_before", lambda *args: model)
    game, history, windows = sample_game()
    game["players"][0].update(mins=65, cleanSheet60=1, goalsConceded=0, score=65.0, level=60.0)
    rows, coverage = v.prepare("PL", [game], windows, history)
    assert coverage["complete"] and rows[0]["clean"] is True
    assert v.clean_label({"mins": 44, "cleanSheet60": None, "goalsConceded": 0}) is False
    assert v.clean_label({"mins": 90, "cleanSheet60": None, "goalsConceded": None}) is None


def test_evidence_fingerprints_change_with_source_history_and_identity(tmp_path):
    source = tmp_path / "PL"
    source.mkdir()
    (source / "game.json").write_text('{"score": 0}')
    csv = tmp_path / "history.csv"
    csv.write_text("Home,Away\nA,B\n")
    first = v.fingerprints(source, [csv])
    assert len(first["sourceSha256"]) == 64 and len(first["identitySha256"]) == 64
    (source / "game.json").write_text('{"score": null}')
    assert v.fingerprints(source, [csv])["sourceSha256"] != first["sourceSha256"]
    csv.write_text("Home,Away\nB,A\n")
    assert v.fingerprints(source, [csv])["historySha256"] != first["historySha256"]


def test_only_the_documented_training_gap_with_complete_source_receipts_is_allowed():
    from copy import deepcopy

    audit = {
        "missingAfter": 1,
        "errors": [],
        "missingFixtures": [{"date": "2024-03-13 00:00:00", "home": "Bournemouth", "away": "Luton"}],
        "clubChecks": [
            {
                "variables": {
                    "club": "afc-bournemouth-bournemouth-dorset",
                    "from": "2024-03-12T12:00:00Z",
                    "to": "2024-03-14T12:00:00Z",
                },
                "games": [],
                "pageInfo": {"hasNextPage": False},
            }
        ],
        "playerChecks": [
            {
                "variables": {"player": p, "from": "2024-03-12T12:00:00Z", "to": "2024-03-14T12:00:00Z"},
                "games": [],
                "pageInfo": {"hasNextPage": False},
            }
            for p in ("norberto-murara-neto", "thomas-kaminski")
        ],
    }
    assert v.documented_training_gap(audit)
    changed = deepcopy(audit)
    changed["missingFixtures"][0]["date"] = "2025-08-01"
    assert not v.documented_training_gap(changed)
    changed = deepcopy(audit)
    changed["playerChecks"].pop()
    assert not v.documented_training_gap(changed)
    changed = deepcopy(audit)
    changed["playerChecks"][0]["games"] = [{"id": "found"}]
    assert not v.documented_training_gap(changed)


def test_ligue_1_protocol_freezes_its_training_exclusion_without_changing_existing_models():
    assert v.protocol_for("PL") == v.EVALUATION_PROTOCOL
    assert v.protocol_for("BL1") == v.EVALUATION_PROTOCOL
    protocol = v.protocol_for("FL1")
    assert protocol["version"] == 3 and protocol["competition"] == "FL1"
    assert protocol["administrativeExclusions"] == [
        ["2025-03-16", "Montpellier", "St Etienne"],
        ["2026-05-17", "Nantes", "Toulouse"],
    ]
    assert protocol["holdoutSeason"] == 2025 and protocol["bootstrapDraws"] == 2000


def test_ligue_1_administrative_training_result_does_not_enter_outcome_or_fdr_fitting():
    game, history, windows = sample_game()
    game["raw"].update(
        date="2025-03-16T12:00:00Z",
        homeTeam={"slug": "a", "name": "Montpellier"},
        awayTeam={"slug": "b", "name": "St Etienne"},
    )
    history.loc[0, ["season_start", "date", "home", "away"]] = [
        2024,
        pd.Timestamp("2025-03-16"),
        "Montpellier",
        "St Etienne",
    ]
    rows, coverage = v.prepare("FL1", [game], windows, history)
    assert rows == [] and coverage["rawCalendarGames"] == 1 and coverage["expectedGames"] == 0
    assert coverage["excludedAdministrative"] == ["g"]


def test_owner_approved_abandoned_holdout_is_excluded_before_status_validation():
    game, history, windows = sample_game()
    game["raw"].update(
        date="2026-05-17T19:00:00Z",
        statusTyped="suspended",
        homeTeam={"slug": "a", "name": "Nantes"},
        awayTeam={"slug": "b", "name": "Toulouse"},
    )
    history.loc[0, ["season_start", "date", "home", "away"]] = [2025, pd.Timestamp("2026-05-17"), "Nantes", "Toulouse"]
    rows, coverage = v.prepare("FL1", [game], windows, history)
    assert rows == [] and coverage["expectedGames"] == 0 and coverage["issues"] == []
    assert coverage["excludedAdministrative"] == ["g"]


def test_spurious_disabled_score_outside_official_elevens_is_not_a_23rd_starter(monkeypatch):
    from copy import deepcopy

    game, history, windows = sample_game()
    from types import SimpleNamespace

    model = SimpleNamespace(
        predict=lambda *args: pd.DataFrame([{"cs_h": 0.4, "cs_a": 0.3, "lam_h": 1.2, "lam_a": 1.0}])
    )
    monkeypatch.setattr(v, "fit_before", lambda *args: model)
    extra = deepcopy(game["players"][0])
    extra["slug"] = "ali-almusrat-disabled"
    game["players"].append(extra)
    rows, coverage = v.prepare("FL1", [game], windows, history)
    assert coverage["complete"] and len(rows) == 22
    assert "ali-almusrat-disabled" not in {r["player"] for r in rows}


def test_ligue_1_replay_exception_requires_both_keeper_receipts():
    audit = {
        "missingAfter": 1,
        "errors": [],
        "missingFixtures": [{"date": "2023-11-29", "home": "Montpellier", "away": "Clermont"}],
        "clubChecks": [
            {"variables": {"club": "montpellier-montpellier"}, "games": [], "pageInfo": {"hasNextPage": False}}
        ],
        "playerChecks": [
            {"variables": {"player": p}, "games": [], "pageInfo": {"hasNextPage": False}}
            for p in ("benjamin-lecomte", "mory-diaw")
        ],
    }
    assert v.documented_fl1_gap(audit)
    audit["playerChecks"].pop()
    assert not v.documented_fl1_gap(audit)


@pytest.mark.parametrize("day,home,away", v.FL1_TRAINING_GAPS)
def test_ligue_1_only_approved_training_gaps_leave_the_cohort(day, home, away):
    game, history, windows = sample_game()
    game["raw"].update(
        date=day + "T12:00:00Z", homeTeam={"slug": "a", "name": home}, awayTeam={"slug": "b", "name": away}
    )
    history.loc[0, ["season_start", "date", "home", "away"]] = [2023, pd.Timestamp(day), home, away]
    rows, coverage = v.prepare("FL1", [game], windows, history)
    assert rows == [] and coverage["expectedGames"] == 0 and coverage["issues"] == []
    assert coverage["excludedSourceGames"] == ["g"]
