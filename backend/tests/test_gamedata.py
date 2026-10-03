"""The games export joined to what the football model and the bookmakers said before kick-off (plans/xscore.md P9 X1; roadmap 10.1)."""

from __future__ import annotations

from typing import Any

import pandas as pd
import pytest

from app.sorare import gamedata


def game(
    n: int,
    home: str = "Athletic Club",
    away: str = "D. Alavés",
    day: str = "2026-09-19",
    *,
    players: int = 3,
    xi: bool = True,
) -> dict[str, Any]:
    return {
        "id": f"Game:{n}",
        "date": f"{day}T14:15:00Z",
        "home": {"slug": "h", "name": home},
        "away": {"slug": "a", "name": away},
        "homeGoals": 0,
        "awayGoals": 0,
        "xi": {
            "home": {"available": xi, "start": [], "bench": []},
            "away": {"available": xi, "start": [], "bench": []},
        },
        "players": {
            f"p{i}": {
                "pos": "GK",
                "team": "h",
                "score": 50.0 if i == 0 else 0.0,
                "mins": 90 if i == 0 else 0,
                "played": i == 0,
                "started": i == 0,
                "stats": {"saves": [3, 6.0]} if i == 0 else {},
                "proj": 46.0 if i else None,
            }
            for i in range(players)
        },
    }


def forecast_row(day: str = "2026-09-19", home: str = "Ath Bilbao", away: str = "Alaves") -> dict[str, Any]:
    return {
        "date": pd.Timestamp(day),
        "home": home,
        "away": away,
        "p_h": 0.5,
        "p_d": 0.3,
        "p_a": 0.2,
        "cs_h": 0.35,
        "cs_a": 0.2,
        "lam_h": 1.4,
        "lam_a": 0.8,
    }


RAW = {
    "Date": ["19/09/2026"],
    "HomeTeam": ["Ath Bilbao"],
    "AwayTeam": ["Alaves"],
    "HS": [14],
    "AS": [9],
    "HST": [5],
    "AST": [2],
    "HY": [1],
    "AY": [3],
    "HR": [0],
    "AR": [1],
    "Avg>2.5": [1.90],
    "Avg<2.5": [1.90],
    "AvgC>2.5": [1.60],
    "AvgC<2.5": [2.40],
}


# ------------------------------------------------------------------------------------------------ names


def test_sorare_club_names_become_football_data_names_and_a_name_it_does_not_know_is_none() -> None:
    assert gamedata.club("Athletic Club") == "Ath Bilbao"
    assert gamedata.club("D. Alavés") == "Alaves"
    assert gamedata.club("Real Club Deportivo de La Coruña") == "La Coruna"
    assert gamedata.club("Unknown FC") is None


# ------------------------------------------------------------------------------------------------ the match statistics


def test_the_match_statistics_and_the_over_under_prices_are_read_and_the_margin_taken_out_of_the_chance_of_over() -> (
    None
):
    extras = gamedata.extras_from_raw(pd.DataFrame(RAW))

    row = extras.iloc[0]
    assert (row["home"], row["away"], row["date"]) == ("Ath Bilbao", "Alaves", pd.Timestamp("2026-09-19"))
    assert (row["hs"], row["as_"], row["hst"], row["ast"], row["hy"], row["ay"], row["hr"], row["ar"]) == (
        14,
        9,
        5,
        2,
        1,
        3,
        0,
        1,
    )
    assert row["p_over"] == pytest.approx(0.5)  # 1.90 and 1.90: a fair coin once the margin is out
    assert row["p_over_close"] == pytest.approx(0.6)  # 1.60 over, 2.40 under: (1/1.6) / (1/1.6 + 1/2.4)


def test_a_missing_market_average_falls_back_to_bet365_and_no_prices_at_all_leave_the_chance_empty() -> None:
    raw = {**RAW, "Avg>2.5": [None], "Avg<2.5": [None], "B365>2.5": [2.0], "B365<2.5": [2.0]}
    assert gamedata.extras_from_raw(pd.DataFrame(raw)).iloc[0]["p_over"] == pytest.approx(0.5)

    bare = {k: v for k, v in RAW.items() if "2.5" not in k}
    assert pd.isna(gamedata.extras_from_raw(pd.DataFrame(bare)).iloc[0]["p_over"])


# ------------------------------------------------------------------------------------------------ the join


def test_a_game_gets_the_forecast_the_shots_and_the_prices_of_its_match() -> None:
    joined, _ = gamedata.join([game(1)], pd.DataFrame([forecast_row()]), gamedata.extras_from_raw(pd.DataFrame(RAW)))

    ctx = joined[0]["ctx"]
    assert ctx["fd"] == {"home": "Ath Bilbao", "away": "Alaves"}
    assert ctx["forecast"]["cs_h"] == 0.35 and ctx["forecast"]["lam_a"] == 0.8 and ctx["forecast"]["p_h"] == 0.5
    assert ctx["shots"] == {"hs": 14, "as": 9, "hst": 5, "ast": 2, "hy": 1, "ay": 3, "hr": 0, "ar": 1}
    assert ctx["ou"]["p_over"] == pytest.approx(0.5) and ctx["ou"]["p_over_close"] == pytest.approx(0.6)


def test_the_match_is_found_a_day_either_side_of_the_date_and_not_a_week_away() -> None:
    forecasts = pd.DataFrame([forecast_row(day="2026-09-20")])  # the football-data date is local, Sorare's is UTC

    near, _ = gamedata.join([game(1)], forecasts, pd.DataFrame())
    far, _ = gamedata.join([game(1, day="2026-09-28")], forecasts, pd.DataFrame())

    assert near[0]["ctx"]["forecast"] is not None
    assert far[0]["ctx"]["forecast"] is None


def test_a_club_the_names_do_not_cover_is_reported_and_its_game_joins_to_nothing() -> None:
    joined, unmatched = gamedata.join([game(1, home="Unknown FC")], pd.DataFrame([forecast_row()]), pd.DataFrame())

    assert unmatched == {"Unknown FC"}
    assert joined[0]["ctx"] == {"fd": None, "forecast": None, "shots": None, "ou": None}


def test_the_same_two_clubs_in_both_directions_are_two_matches() -> None:
    forecasts = pd.DataFrame([forecast_row(), forecast_row(day="2027-02-06", home="Alaves", away="Ath Bilbao")])

    joined, _ = gamedata.join(
        [game(1), game(2, home="D. Alavés", away="Athletic Club", day="2027-02-06")], forecasts, pd.DataFrame()
    )

    assert joined[0]["ctx"]["fd"] == {"home": "Ath Bilbao", "away": "Alaves"}
    assert joined[1]["ctx"]["fd"] == {"home": "Alaves", "away": "Ath Bilbao"}


# ------------------------------------------------------------------------------------------------ the counts


def test_the_counts_say_how_much_of_the_season_has_each_part_and_per_season() -> None:
    extras = gamedata.extras_from_raw(pd.DataFrame(RAW))
    joined, unmatched = gamedata.join(
        [game(1), game(2, day="2025-10-04", xi=False), game(3, home="Unknown FC")],
        pd.DataFrame([forecast_row()]),
        extras,
    )

    counts = gamedata.coverage(joined, unmatched)

    assert counts["games"] == 3 and counts["seasons"] == {"2025/26": 1, "2026/27": 2}
    assert counts["with_forecast"] == 1 and counts["with_shots"] == 1 and counts["with_prices"] == 1
    assert counts["with_xi"] == 2  # game 2's elevens were not out
    assert (
        counts["player_rows"] == 9
        and counts["played"] == 3
        and counts["started"] == 3
        and counts["with_projection"] == 6
    )
    assert counts["with_stats"] == 3  # a game whose played players have stats
    assert counts["unmatched_clubs"] == ["Unknown FC"]


# ------------------------------------------------------------------------------------------------ the games as a player history


def test_the_games_become_a_history_by_player_with_every_game_he_is_listed_in_oldest_first() -> None:
    first = game(1, day="2026-09-12")
    second = game(2, day="2026-09-19")
    first["players"] = {"p1": {**first["players"]["p0"], "pos": "GK", "team": "a", "score": 61.5, "mins": 90}}
    second["players"] = {
        "p1": {
            **second["players"]["p0"],
            "pos": "GK",
            "team": "b",
            "score": 0.0,
            "played": False,
            "started": False,
            "mins": 0,
        }
    }

    players = gamedata.players_of([second, first])  # in the wrong order on purpose

    entry = players["p1"]
    assert entry["pos"] == "GK" and entry["club"] == "b"  # his club is the latest he was listed for
    assert [g["gameId"] for g in entry["games"]] == ["Game:1", "Game:2"]
    assert entry["games"][0] == {
        "date": "2026-09-12T14:15:00Z",
        "competition": "laliga-es",
        "gameId": "Game:1",
        "score": 61.5,
        "played": True,
        "started": True,
        "mins": 90,
        "status": "FINAL",
    }
    assert entry["games"][1]["played"] is False and entry["games"][1]["status"] == "DID_NOT_PLAY"


def test_the_history_file_carries_the_gameweeks_the_backtest_counts_by() -> None:
    fixtures = [{"slug": "football-2-6-oct-2026", "start": "2026-10-02T14:00:00Z", "end": "2026-10-06T14:00:00Z"}]

    raw = gamedata.history_file([game(1)], fixtures)

    assert raw["fixtures"] == fixtures and set(raw["players"]) == {"p0", "p1", "p2"}
