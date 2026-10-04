"""A player's stat sheet from the games export (plans/xscore.md P9 X5b)."""

from __future__ import annotations

from typing import Any

import pytest

from app.sorare import sheets


def game(
    date: str, saves: float, level: float = 35.0, conceded: float = 1.0, opp: str = "Real Betis"
) -> dict[str, Any]:
    stats: dict[str, list[float]] = {"saves": [saves, saves * 2.0], "goals_conceded": [conceded, -5.0 * conceded]}
    if conceded == 0:
        stats["clean_sheet_60"] = [1.0, 20.0]
    return {
        "date": f"{date}T19:00:00Z",
        "home": {"slug": "getafe", "name": "Getafe CF"},
        "away": {"slug": "betis", "name": opp},
        "players": {
            "soria": {
                "pos": "GK",
                "team": "getafe",
                "played": True,
                "started": True,
                "score": 40.0 + saves,
                "level": level,
                "stats": stats,
            },
            "sub": {
                "pos": "FWD",
                "team": "getafe",
                "played": True,
                "started": False,
                "score": 30.0,
                "level": 35.0,
                "stats": {},
            },
        },
    }


def season(count: int = 12) -> list[dict[str, Any]]:
    return [
        game(
            f"2026-09-{i + 1:02d}",
            saves=2.0 + (i % 3),
            conceded=0.0 if i % 4 == 0 else 1.0,
            level=70.0 if i % 4 == 0 else 35.0,
        )
        for i in range(count)
    ]


def test_a_player_has_a_sheet_over_his_starts_only_and_a_substitute_has_none() -> None:
    made = sheets.sheets_from_games(season())
    assert set(made["players"]) == {"soria"}
    assert made["asOf"] == "2026-09-12"
    soria = made["players"]["soria"]
    assert soria["pos"] == "GK" and soria["starts"] == 12 and soria["team"] == "getafe"


def test_each_action_is_its_mean_count_and_mean_points_per_start() -> None:
    soria = sheets.sheets_from_games(season())["players"]["soria"]
    saves = [2.0 + (i % 3) for i in range(12)]
    assert soria["season"]["saves"] == [
        pytest.approx(sum(saves) / 12, abs=0.01),
        pytest.approx(2 * sum(saves) / 12, abs=0.02),
    ]
    assert soria["season"]["goals_conceded"][0] == pytest.approx(0.75)  # three of twelve with a clean sheet
    assert soria["cs"] == 3 and soria["pens"] == 0


def test_the_last_ten_are_the_newest_starts_with_the_opponent_and_whether_it_was_decisive() -> None:
    soria = sheets.sheets_from_games(season())["players"]["soria"]
    assert len(soria["last"]) == 10 and soria["last"][-1][1] == "BET" and soria["last"][-1][3] == "H"
    assert [row[2] for row in soria["last"]] == [1 if i % 4 == 0 else 0 for i in range(2, 12)]


def test_an_action_he_hardly_ever_does_is_left_out_and_too_few_starts_gives_no_sheet() -> None:
    games = season(12)
    games[0]["players"]["soria"]["stats"]["red_card"] = [
        1.0,
        -3.0,
    ]  # once in twelve is 0.08, kept; once in 100 would not be
    assert "red_card" in sheets.sheets_from_games(games)["players"]["soria"]["season"]
    assert sheets.sheets_from_games(season(2))["players"] == {}


def test_an_opponent_the_registry_does_not_know_still_gets_a_code() -> None:
    games = [game(f"2026-09-{i + 1:02d}", 2.0, opp="D. Alavés") for i in range(3)] + [
        game("2026-09-20", 2.0, opp="Real Club Deportivo de La Coruña")
    ]
    assert [row[1] for row in sheets.sheets_from_games(games)["players"]["soria"]["last"]] == [
        "ALA",
        "ALA",
        "ALA",
        "DEP",
    ]


def test_the_last_ten_carry_the_actions_the_missions_count_and_he_has_a_decisive_rate() -> None:
    games = season(12)
    games[-1]["players"]["soria"]["stats"]["interception_won"] = [3.0, 4.5]
    games[-1]["players"]["soria"]["stats"]["goal_assist"] = [1.0, 6.0]
    soria = sheets.sheets_from_games(games)["players"]["soria"]
    assert soria["last"][-1][4:] == [3, 1, 0] and soria["last"][0][4:] == [0, 0, 0]
    assert soria["decAll"] == 0.25  # three of twelve
