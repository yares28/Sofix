"""The Stats page's chart model: windows, missing versus zero, who is who, and when Sorare is asked again."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import Any

import pytest
from sqlalchemy.orm import Session

from app.models import ReadModel
from app.sorare import stat_charts
from tests.test_pipeline import db  # noqa: F401  (fixture)

NOW = datetime(2026, 10, 26, 12, tzinfo=UTC)
PEOPLE = {
    "fwd": {
        "name": "Forward",
        "club": "Getafe",
        "crest": None,
        "league": "laliga-es",
        "card": "https://assets.sorare.com/card/f.png",
    },
    "mid": {"name": "Midfielder", "club": "Arsenal", "crest": None, "league": "premier-league-gb-eng", "card": None},
}


def start(slug: str, day: str, pos: str, score: float, stats: dict[str, float]) -> dict[str, Any]:
    return {
        "date": f"{day}T19:00:00Z",
        "home": {"slug": "getafe", "name": "Getafe CF"},
        "away": {"slug": "", "name": "Real Betis"},
        "players": {
            slug: {
                "pos": pos,
                "team": "getafe",
                "played": True,
                "started": True,
                "score": score,
                "level": 30.0,
                "stats": {k: [v, 1.0] for k, v in stats.items()},
            }
        },
    }


def history() -> list[dict[str, Any]]:
    """A forward with 45 starts (5 this season, scoring 1 goal each), a midfielder with 6, a defender with 4."""
    games = []
    first = datetime(2025, 8, 1)
    for i in range(40):  # last season: no goals, 2 dribbles a start
        games.append(
            start("fwd", (first + timedelta(days=7 * i)).date().isoformat(), "FWD", 40.0, {"won_contest": 2.0})
        )
    for i in range(5):  # this season: a goal a start
        day = (datetime(2026, 8, 20) + timedelta(days=7 * i)).date().isoformat()
        games.append(start("fwd", day, "FWD", 60.0, {"goals": 1.0, "won_contest": 2.0}))
    for i in range(6):
        day = (datetime(2026, 8, 20) + timedelta(days=7 * i)).date().isoformat()
        games.append(start("mid", day, "MID", 50.0, {"poss_won": 4.0, "accurate_pass": 40.0}))
    for i in range(4):
        games.append(start("def", f"2026-09-0{i + 1}", "DEF", 45.0, {"won_tackle": 3.0}))
    return games


def test_windows_hold_this_season_and_the_last_5_10_40_starts() -> None:
    model = stat_charts.build(history(), PEOPLE, NOW)
    fwd = next(p for p in model["players"] if p["slug"] == "fwd")
    goals = model["keys"].index("goals")
    w = fwd["windows"]
    assert (w["cur"]["starts"], w["cur"]["avg"], w["cur"]["values"][goals]) == (5, 60.0, 1.0)
    assert (w["l5"]["starts"], w["l5"]["values"][goals]) == (5, 1.0)
    assert (w["l10"]["starts"], w["l10"]["avg"], w["l10"]["values"][goals]) == (10, 50.0, 0.5)
    assert (w["l40"]["starts"], w["l40"]["values"][goals]) == (40, 0.12)


def test_an_action_off_a_positions_sheet_is_missing_not_zero() -> None:
    model = stat_charts.build(history(), PEOPLE, NOW)
    fwd = next(p for p in model["players"] if p["slug"] == "fwd")
    mid = next(p for p in model["players"] if p["slug"] == "mid")
    keys = model["keys"]
    assert fwd["windows"]["l10"]["values"][keys.index("poss_won")] is None  # no forward has it
    assert mid["windows"]["l10"]["values"][keys.index("poss_won")] == 4.0
    assert mid["windows"]["l10"]["values"][keys.index("goals")] is None  # no midfielder scored here
    assert "poss_won" in model["onSheet"]["MID"] and "poss_won" not in model["onSheet"]["FWD"]


def test_too_few_starts_or_unknown_people_are_left_out() -> None:
    model = stat_charts.build(history(), PEOPLE, NOW)
    assert {p["slug"] for p in model["players"]} == {"fwd", "mid"}  # def has 4 starts
    assert stat_charts.wanted(history()) == ["fwd", "mid"]
    no_league = stat_charts.build(history(), {"fwd": {**PEOPLE["fwd"], "league": "saudi-pro-league"}}, NOW)
    assert no_league["players"] == []


def test_season_window_needs_three_starts_this_season() -> None:
    games = [g for g in history() if not (g["date"] >= "2026-07" and "fwd" in g["players"])]
    games += [start("fwd", "2026-09-01", "FWD", 70.0, {"goals": 2.0}), start("fwd", "2026-09-08", "FWD", 70.0, {})]
    fwd = next(p for p in stat_charts.build(games, PEOPLE, NOW)["players"] if p["slug"] == "fwd")
    assert fwd["windows"]["cur"] is None
    assert fwd["windows"]["l5"]["starts"] == 5


def test_people_query_checks_slugs_and_reads_the_answer() -> None:
    query = stat_charts.people_query(["bukayo-saka"], 2026)
    assert 'anyPlayer(slug: "bukayo-saka")' in query and "seasonStartYears: [2026]" in query
    with pytest.raises(ValueError):
        stat_charts.people_query(['x") { id } evil: anyPlayer(slug: "y'], 2026)
    answer = {
        "p0": {
            "displayName": "Bukayo Saka",
            "activeClub": {
                "name": "Arsenal FC",
                "shortName": "Arsenal",
                "pictureUrl": "https://assets.sorare.com/team/a.png",
                "domesticLeague": {"slug": "premier-league-gb-eng"},
            },
        },
        "p1": None,
        "football": {"c0": {"nodes": [{"pictureUrl": "https://evil.example/x.png"}]}, "c1": {"nodes": []}},
    }
    people = stat_charts.read_people(answer, ["bukayo-saka", "nobody"])
    assert people == {
        "bukayo-saka": {
            "name": "Bukayo Saka",
            "club": "Arsenal",
            "crest": "https://assets.sorare.com/team/a.png",
            "league": "premier-league-gb-eng",
            "card": None,
        }
    }


class FakeClient:
    def __init__(self) -> None:
        self.asked: list[str] = []

    def query(self, query: str, variables: dict[str, Any] | None = None) -> dict[str, Any]:
        self.asked.append(query)
        card = [] if "[2026]" in query else [{"pictureUrl": "https://assets.sorare.com/card/old.png"}]
        n = query.count("anyPlayer(")
        who = {"displayName": "Someone", "activeClub": {"shortName": "Getafe", "domesticLeague": {"slug": "laliga-es"}}}
        return {**{f"p{i}": who for i in range(n)}, "football": {f"c{i}": {"nodes": card} for i in range(n)}}


def test_people_are_asked_once_a_week_and_fall_back_to_last_seasons_card(db: Session) -> None:  # noqa: F811
    client = FakeClient()
    people = stat_charts.refresh_people(db, client, NOW, ["fwd"])  # type: ignore[arg-type]
    assert people["fwd"]["card"] == "https://assets.sorare.com/card/old.png"
    assert len(client.asked) == 2  # this season's card, then last season's
    stat_charts.refresh_people(db, client, NOW + timedelta(days=6), ["fwd"])  # type: ignore[arg-type]
    assert len(client.asked) == 2
    stat_charts.refresh_people(db, client, NOW + timedelta(days=8), ["fwd"])  # type: ignore[arg-type]
    assert len(client.asked) == 4


def test_publish_writes_the_chart_model(db: Session) -> None:  # noqa: F811
    model = stat_charts.publish(db, FakeClient(), history(), NOW)  # type: ignore[arg-type]
    db.commit()
    row = db.get(ReadModel, stat_charts.KEY)
    assert row is not None and row.payload == model
    assert [p["slug"] for p in model["players"]] == ["fwd", "mid"]
