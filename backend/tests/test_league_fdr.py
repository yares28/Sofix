"""Full-league workflow: no production database or source calls."""

from copy import deepcopy
from datetime import UTC, datetime

import pandas as pd
import pytest

from app.services.league_fdr import build_league_grid

NOW = datetime(2026, 10, 21, tzinfo=UTC)


def sample(code="PL", size=20):
    refs = [
        {
            "id": 1000 + i,
            "name": f"Club {i}",
            "tla": f"C{i:02}",
            "shortName": f"Club {i}",
            "crest": f"https://crests.football-data.org/{1000 + i}.svg",
        }
        for i in range(size)
    ]
    matches = []
    rotation = list(range(size))
    for round_number in range(2 * (size - 1)):
        for j in range(size // 2):
            i, k = rotation[j], rotation[size - 1 - j]
            if round_number >= size - 1:
                i, k = k, i
            home, away = refs[i], refs[k]
            matches.append(
                {
                    "id": 10000 + i * size + k,
                    "utcDate": "2026-11-01T15:00:00Z",
                    "status": "TIMED",
                    "matchday": round_number + 1,
                    "homeTeam": home,
                    "awayTeam": away,
                    "score": {"duration": "REGULAR", "fullTime": {"home": None, "away": None}},
                    "season": {"startDate": "2026-08-01"},
                }
            )
        rotation.insert(1, rotation.pop())
    history = pd.DataFrame(
        [
            {
                "season_start": 2025,
                "date": pd.Timestamp("2026-03-01"),
                "home": h["shortName"],
                "away": a["shortName"],
                "hg": 1,
                "ag": 0,
                "hst": 4,
                "ast": 2,
                "odds_h": 2.0,
                "odds_d": 3.0,
                "odds_a": 4.0,
            }
            for h in refs
            for a in refs
            if h != a
        ]
    )
    return {"competition": {"code": code}, "matches": matches}, history


@pytest.mark.parametrize(("code", "size"), [("PL", 20), ("BL1", 18)])
def test_cold_start_entire_league_has_two_sided_fdr(code, size):
    payload, history = sample(code, size)
    body = build_league_grid(code, payload, history, NOW)
    grid = body.data
    assert grid and len(grid.teams) == size
    cells = [c for t in grid.teams for column in t.cells for c in column]
    assert len(cells) == size * (size - 1) * 2
    assert all(c.prediction and c.market is None and c.prediction.xd_for is None for c in cells)
    assert all(t.decisives is None and t.opening is None for t in grid.teams)
    assert all(t.code.startswith("C") and len(t.code) == 3 and t.source_id is not None for t in grid.teams)
    assert all(t.history_name == t.name for t in grid.teams)
    assert body.meta and body.meta.last_predicted_at == NOW


def test_finished_zero_is_real_but_no_hindsight_forecast():
    payload, history = sample()
    row = payload["matches"][0]
    row.update(status="FINISHED", utcDate="2026-10-20T15:00:00Z")
    row["score"]["fullTime"] = {"home": 0, "away": 0}
    grid = build_league_grid("PL", payload, history, NOW).data
    cells = [c for t in grid.teams for col in t.cells for c in col if c.fixture_id == row["id"]]
    assert all(c.result and c.result.goals_for == 0 and c.prediction is None for c in cells)
    row["score"]["fullTime"] = {"home": None, "away": None}
    assert all(
        c.result is None
        for t in build_league_grid("PL", payload, history, NOW).data.teams
        for col in t.cells
        for c in col
        if c.fixture_id == row["id"]
    )


def test_refresh_preserves_only_pre_kickoff_forecast():
    payload, history = sample()
    first = build_league_grid("PL", payload, history, NOW)
    row = payload["matches"][0]
    row.update(status="FINISHED", utcDate="2026-10-22T15:00:00Z")
    row["score"]["fullTime"] = {"home": 1, "away": 0}
    later = datetime(2026, 10, 23, tzinfo=UTC)
    after = build_league_grid("PL", payload, history, later, previous=first)
    assert next(c for t in after.data.teams for col in t.cells for c in col if c.fixture_id == row["id"]).prediction
    bad = first.model_copy(deep=True)
    bad.meta.last_predicted_at = later
    for t in bad.data.teams:
        for col in t.cells:
            for c in col:
                c.forecast_at = later
    after = build_league_grid("PL", payload, history, later, previous=bad)
    assert all(
        c.prediction is None for t in after.data.teams for col in t.cells for c in col if c.fixture_id == row["id"]
    )


def test_wrong_league_duplicate_and_partial_schedule_fail():
    payload, history = sample()
    with pytest.raises(ValueError):
        build_league_grid("BL1", payload, history, NOW)
    duplicate = deepcopy(payload)
    duplicate["matches"].append(duplicate["matches"][0])
    with pytest.raises(ValueError):
        build_league_grid("PL", duplicate, history, NOW)
    with pytest.raises(ValueError):
        build_league_grid("PL", {**payload, "matches": payload["matches"][:3]}, history, NOW)
    bad_rounds = deepcopy(payload)
    for match in bad_rounds["matches"]:
        match["matchday"] = 1
    with pytest.raises(ValueError):
        build_league_grid("PL", bad_rounds, history, NOW)


def test_literal_current_promoted_names_map_without_guessing_source_ids():
    from app.services.league_fdr import history_name
    from app.sources.football_data_org import TeamRef

    known = {"Coventry", "Hull", "Paderborn", "Elversberg", "Brighton"}
    for label, expected in [
        ("Coventry City", "Coventry"),
        ("Hull City", "Hull"),
        ("SC Paderborn 07", "Paderborn"),
        ("SV Elversberg", "Elversberg"),
    ]:
        assert history_name(TeamRef(id=99999, name=label), known) == expected
    with pytest.raises(ValueError):
        history_name(TeamRef(id=99999, name="Hull-ish"), known)
    assert history_name(TeamRef(id=99999, name="Coventry City FC"), known) == "Coventry"
    with pytest.raises(ValueError):
        history_name(TeamRef(id=99999, name="Coventry City FC", shortName="Hull"), known)
    assert (
        history_name(TeamRef(id=397, name="Brighton & Hove Albion FC", shortName="Brighton Hove"), known) == "Brighton"
    )


def test_failed_source_never_opens_database_or_overwrites_a_published_league(monkeypatch):
    from app.jobs import league_fdr

    class FailingSource:
        async def matches(self, **kwargs):
            raise RuntimeError("source unavailable")

    monkeypatch.setattr(league_fdr, "FootballDataOrg", FailingSource)

    def forbidden():
        pytest.fail("failed source must leave all published blocks untouched")

    monkeypatch.setattr(league_fdr, "SessionLocal", forbidden)
    with pytest.raises(RuntimeError, match="source unavailable"):
        league_fdr.run("PL")


def test_training_never_receives_future_rows(monkeypatch):
    from app.services import league_fdr

    payload, history = sample()
    future = history.iloc[:1].copy()
    future["date"] = pd.Timestamp("2026-12-01")
    future["hg"] = 99
    original = league_fdr.fit_dixon_coles
    seen = []

    def fit(frame, *args, **kwargs):
        seen.append(frame.copy())
        return original(frame, *args, **kwargs)

    monkeypatch.setattr(league_fdr, "fit_dixon_coles", fit)
    build_league_grid("PL", payload, pd.concat([history, future]), NOW)
    assert len(seen) == 1 and seen[0]["date"].max() < pd.Timestamp(NOW.date())
