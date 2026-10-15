"""A club's decisive actions per goal, and the board's xD built from it."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from app.sorare import team_decisives as td


def game(
    home_goals: int, away_goals: int, home_stats: dict[str, list[float]], away_stats: dict[str, list[float]]
) -> dict[str, Any]:
    return {
        "date": "2026-09-20T19:00:00Z",
        "home": {"slug": "barcelona-barcelona", "name": "FC Barcelona"},
        "away": {"slug": "getafe-getafe-madrid", "name": "Getafe CF"},
        "homeGoals": home_goals,
        "awayGoals": away_goals,
        "players": {
            "a": {"team": "barcelona-barcelona", "stats": home_stats},
            "b": {"team": "getafe-getafe-madrid", "stats": away_stats},
        },
    }


def test_rate_counts_only_positive_decisive_actions_and_pulls_toward_the_league() -> None:
    games = [
        game(
            2,
            1,
            {"goals": [2, 0], "goal_assist": [1, 0], "goals_conceded": [1, 0]},
            {"goals": [1, 0], "penalty_save": [1, 0]},
        ),
    ]
    result = td.build(games)
    assert {k: result["teams"]["FCB"][k] for k in ("decisives", "goals", "games")} == {
        "decisives": 3,
        "goals": 2,
        "games": 1,
    }
    assert result["teams"]["GET"]["decisives"] == 2  # a goal and a penalty saved; conceded goals do not count
    assert result["league"] == round(5 / 3, 3)
    # Barcelona's own 1.5 per goal, pulled a little toward the league's 1.667 by the prior.
    assert result["teams"]["FCB"]["rate"] == round((3 + 10 * (5 / 3)) / (2 + 10), 3)


def test_xd_is_xg_times_the_rate_with_the_league_for_an_unknown_club(tmp_path: Path) -> None:
    path = tmp_path / "rates.json"
    path.write_text(json.dumps({"league": 1.9, "teams": {"FCB": {"rate": 2.0}}}))
    rates = td.load(str(path))
    assert td.expected_decisives(1.5, "FCB", rates) == 3.0
    assert td.expected_decisives(1.5, "XYZ", rates) == 2.85
    assert td.expected_decisives(None, "FCB", rates) is None
    assert td.expected_decisives(1.5, "FCB", td.load(str(tmp_path / "missing.json"))) is None


def test_decisives_per_game_split_into_attack_defence_and_keeper(tmp_path: Path) -> None:
    home = {"goals": [1, 0], "assist_penalty_won": [1, 0], "last_man_tackle": [1, 0]}
    first = game(1, 0, home, {})
    first["players"]["k"] = {
        "team": "barcelona-barcelona",
        "pos": "GK",
        "stats": {"clean_sheet_60": [1, 0], "penalty_save": [1, 0]},
    }
    first["players"]["d"] = {
        "team": "barcelona-barcelona",
        "pos": "DEF",
        "stats": {"clean_sheet_60": [1, 0]},
    }  # not decisive
    result = td.build([first, game(0, 0, {}, {})])
    row = result["teams"]["FCB"]
    assert (row["attack"], row["defence"], row["keeper"], row["games"]) == (2, 1, 2, 2)
    assert row["decisives"] == 4  # the xD rate still leaves clean sheets out
    path = tmp_path / "decisives.json"
    path.write_text(json.dumps(result))
    assert td.load_groups(str(path))["FCB"] == {"games": 2, "attack": 1.0, "defence": 0.5, "keeper": 1.0}
    assert td.load_groups(str(tmp_path / "missing.json")) == {}
