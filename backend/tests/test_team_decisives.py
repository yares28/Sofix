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
    assert result["teams"]["FCB"] | {"rate": 0} == {"decisives": 3, "goals": 2, "games": 1, "rate": 0}
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
