"""Sorare's projection against Sofix's xScore: the record is settled a day after the week, and only starts with both numbers count."""

from __future__ import annotations

from datetime import UTC, datetime

from app.sorare import versus

GAME = "Game:00000000-0000-0000-0000-000000000001"


def record(players: dict[str, dict], kickoff: str = "2026-10-10T19:00:00Z") -> dict:
    return {
        "gameweek": {"slug": "football-9-13-oct-2026", "number": 21, "lock": "2026-10-09T14:00:00Z"},
        "players": {
            slug: {
                "pos": p["pos"],
                "games": [{"id": GAME, "kickoff": kickoff, "sorare": p["sorare"], "sofix": p["sofix"]}],
            }
            for slug, p in players.items()
        },
    }


def test_a_week_is_settled_a_day_after_its_last_game_and_only_once():
    week = record({"a": {"pos": "MID", "sorare": 50.0, "sofix": 45.0}})
    assert not versus.due(week, datetime(2026, 10, 11, 12, tzinfo=UTC))
    assert versus.due(week, datetime(2026, 10, 11, 23, tzinfo=UTC))
    done = versus.settled(
        week,
        {GAME: {"a": {"score": 60.0, "played": True, "started": True, "mins": 90}}},
        datetime(2026, 10, 12, tzinfo=UTC),
    )
    assert done["settledAt"] and done["players"]["a"]["games"][0]["actual"]["score"] == 60.0
    assert not versus.due(done, datetime(2026, 10, 20, tzinfo=UTC))


def test_a_game_sorare_did_not_answer_for_keeps_the_week_open():
    week = record({"a": {"pos": "MID", "sorare": 50.0, "sofix": 45.0}})
    assert "settledAt" not in versus.settled(week, {}, datetime(2026, 10, 12, tzinfo=UTC))


def test_only_starts_with_both_numbers_are_compared():
    week = record(
        {
            "starter": {"pos": "MID", "sorare": 50.0, "sofix": 58.0},
            "sub": {"pos": "MID", "sorare": 40.0, "sofix": 42.0},
            "unknown": {"pos": "MID", "sorare": None, "sofix": 55.0},
        }
    )
    found = {
        GAME: {
            "starter": {"score": 60.0, "played": True, "started": True, "mins": 90},
            "sub": {"score": 30.0, "played": True, "started": False, "mins": 20},
            "unknown": {"score": 70.0, "played": True, "started": True, "mins": 90},
        }
    }
    rows = versus.starts_of(versus.settled(week, found, datetime(2026, 10, 12, tzinfo=UTC)))
    assert [row["player"] for row in rows] == ["starter"]


def test_the_comparison_says_who_was_closer_how_far_and_which_way():
    rows = [
        {
            "player": "a",
            "week": 21,
            "pos": "MID",
            "sorare": 50.0,
            "sofix": 58.0,
            "actual": 60.0,
        },  # Sofix 2 off, Sorare 10 off
        {
            "player": "b",
            "week": 21,
            "pos": "MID",
            "sorare": 40.0,
            "sofix": 30.0,
            "actual": 41.0,
        },  # Sorare 1 off, Sofix 11 off
        {
            "player": "c",
            "week": 21,
            "pos": "MID",
            "sorare": 45.0,
            "sofix": 46.0,
            "actual": 50.0,
        },  # Sofix 4 off, Sorare 5 off
    ]
    out = versus.compare(rows)
    assert out["starts"] == 3
    assert out["sofixCloser"] == round(2 / 3, 4)
    assert out["sofix"]["miss"] == round((2 + 11 + 4) / 3, 2) and out["sorare"]["miss"] == round((10 + 1 + 5) / 3, 2)
    assert out["sofix"]["within"] == round(2 / 3, 4) and out["sorare"]["within"] == round(2 / 3, 4)
    assert out["sorare"]["lean"] < 0  # Sorare's numbers were low on average here
    # Pairs: a>c>b in what happened; Sofix rates a>c>b (3 of 3), Sorare rates a>c>b too.
    assert out["sofix"]["pair"] == 1.0 and out["sofix"]["pairs"] == 3


def test_figures_split_by_position_and_week_and_count_the_weeks():
    week = record({"a": {"pos": "GK", "sorare": 50.0, "sofix": 45.0}})
    done = versus.settled(
        week,
        {GAME: {"a": {"score": 47.0, "played": True, "started": True, "mins": 90}}},
        datetime(2026, 10, 12, tzinfo=UTC),
    )
    out = versus.figures([done, record({"b": {"pos": "DEF", "sorare": 40.0, "sofix": 41.0}})])
    assert out["recorded"] == 2 and out["settled"] == 1
    assert out["positions"]["GK"]["starts"] == 1 and out["positions"]["DEF"]["starts"] == 0
    assert out["weeks"] == [{"week": 21, **versus.compare(versus.starts_of(done))}]
