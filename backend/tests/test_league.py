"""Today's xScore against Sorare's own projection on every LaLiga player (plans/xscore.md P9 X2 and P6; roadmap 10.2)."""

from __future__ import annotations

import dataclasses
from datetime import UTC, datetime, timedelta
from typing import Any

import pytest

from app.sorare import backtest, league

DAY = datetime(2026, 9, 12, 14, 0, tzinfo=UTC)


def row(
    player: str,
    week: int,
    score: float,
    start: float,
    *,
    pos: str = "MID",
    started: bool = True,
    before: int = 5,
) -> backtest.Row:
    """A game as today's model predicted it: `start` is its "if he starts", `score` what he made."""
    return backtest.Row(
        model="today",
        player=player,
        pos=pos,
        date=DAY + timedelta(days=7 * week),
        week=f"w{week}",
        competition="laliga-es",
        klass="club",
        before=before,
        score=score if started else 0.0,
        played=started,
        started=started,
        expected=start * 0.9,
        start=start,
    )


def projections(rows: list[backtest.Row], values: list[float]) -> dict[tuple[str, datetime], float]:
    return {(r.player, r.date): v for r, v in zip(rows, values, strict=True)}


def test_each_numbers_miss_is_scored_on_the_games_a_player_started_and_the_closer_one_is_counted() -> None:
    rows = [row("a", 0, 60, 50), row("b", 0, 40, 50), row("a", 1, 30, 50), row("b", 1, 70, 50)]
    sorare = projections(rows, [58.0, 41.0, 45.0, 60.0])

    found = league.versus_sorare(rows, sorare)

    assert found["games"] == 4 and found["weeks"] == 2
    assert found["today"]["mae"] == pytest.approx((10 + 10 + 20 + 20) / 4)  # 50 against 60, 40, 30, 70
    assert found["sorare"]["mae"] == pytest.approx((2 + 1 + 15 + 10) / 4)
    assert found["today"]["bias"] == pytest.approx(0.0)  # 50 on average against an average of 50
    assert found["closer"] == 0.0  # Sorare's number was nearer in all four games
    assert found["sorare"]["within"] == {"3": 0.5, "7": 0.5, "10": 0.75, "15": 1.0}  # misses 2, 1, 15, 10
    assert found["today"]["within"] == {"3": 0.0, "7": 0.0, "10": 0.5, "15": 0.5}  # misses 10, 10, 20, 20


def test_a_game_he_did_not_start_or_with_too_little_form_or_without_a_projection_is_left_out() -> None:
    rows = [
        row("a", 0, 60, 50),
        row("a", 1, 60, 50, started=False),
        row("b", 0, 60, 50, before=2),
        row("c", 0, 60, 50),
    ]
    sorare = projections(rows[:3], [55.0, 55.0, 55.0])  # nothing for the fourth

    found = league.versus_sorare(rows, sorare)

    assert found["games"] == 1  # only a's first game: a start, enough form, and a projection


def test_a_tie_in_how_near_they_were_counts_half_and_each_position_is_told_apart() -> None:
    rows = [
        row("a", 0, 60, 50, pos="GK"),
        row("b", 0, 60, 50, pos="GK"),
        row("c", 0, 60, 50, pos="FWD"),
        row("d", 0, 60, 50, pos="FWD"),
    ]
    sorare = projections(
        rows, [50.0, 70.0, 55.0, 55.0]
    )  # GK: a tie, then a tie in size the other way; FWD: both nearer

    found = league.versus_sorare(rows, sorare)

    assert found["closer"] == pytest.approx(0.25)  # a ties (0.5), b ties (0.5), c and d are Sorare's: (0.5+0.5)/4
    assert set(found["byPosition"]) == {"GK", "FWD"}
    assert found["byPosition"]["GK"]["games"] == 2 and found["byPosition"]["FWD"]["closer"] == 0.0


def test_the_difference_in_miss_has_an_interval_from_whole_weeks_and_an_empty_input_says_so() -> None:
    rows = [row(p, w, 50 + 5 * (-1) ** w, 50) for p in "abc" for w in range(6)]
    found = league.versus_sorare(rows, projections(rows, [50.0 + 5 * (-1) ** (i % 6) for i in range(len(rows))]))

    for metric in ("absolute", "squared"):
        assert found["diff"][metric]["weeks"] == 6 and found["diff"][metric]["lo"] <= found["diff"][metric]["hi"]
    assert league.versus_sorare([], {})["games"] == 0


def test_projections_are_found_by_player_and_the_time_of_his_game() -> None:
    games: list[dict[str, Any]] = [
        {"id": "g1", "date": "2026-09-12T14:00:00Z", "players": {"a": {"proj": 46.0}, "b": {"proj": None}}},
        {"id": "g2", "date": "2026-09-19T14:00:00Z", "players": {"a": {"proj": 52.0}}},
    ]

    found = league.projections(games)

    assert found == {
        ("a", datetime(2026, 9, 12, 14, 0, tzinfo=UTC)): 46.0,
        ("a", datetime(2026, 9, 19, 14, 0, tzinfo=UTC)): 52.0,
    }


def test_the_xscore_is_scored_as_the_number_the_tile_shows_and_as_the_expectation_with_the_chance_of_not_playing_in_it() -> (
    None
):
    started = row("a", 0, 60, 50)  # shows 50 if he starts, scored 60; expected 45 (the chance of not playing is in it)
    came_on = dataclasses.replace(row("b", 0, 40, 50), started=False, played=True, score=40.0, expected=30.0, on=44.0)
    unused = dataclasses.replace(row("c", 0, 0, 50, started=False), expected=5.0)

    found = league.xscore_misses([started, came_on, unused])

    expected = found["expected"]
    assert expected["all"]["games"] == 3 and expected["played"]["games"] == 2 and expected["started"]["games"] == 1
    assert expected["started"]["mae"] == pytest.approx(15.0)  # 45 against 60
    assert expected["played"]["mae"] == pytest.approx((15 + 10) / 2)
    assert expected["all"]["within"]["7"] == pytest.approx(1 / 3)  # only the game he did not play: 5 against 0
    # What the tile showed, on the games it was about: his score if he starts on the games he started, if he comes on on his appearances off the bench.
    shown = found["shown"]
    assert shown["started"]["games"] == 1 and shown["started"]["mae"] == pytest.approx(10.0)  # 50 against 60
    assert shown["cameOn"]["games"] == 1 and shown["cameOn"]["mae"] == pytest.approx(4.0)  # 44 against 40
    assert shown["cameOn"]["within"]["7"] == 1.0
    assert league.xscore_misses([])["expected"]["all"] is None and league.xscore_misses([])["shown"]["cameOn"] is None


def test_the_league_replay_scores_the_history_and_names_nobody() -> None:
    games: list[dict[str, Any]] = []
    for week in range(10):
        when = (DAY + timedelta(days=7 * week)).isoformat().replace("+00:00", "Z")
        players = {
            f"secret-player-{i}": {
                "pos": "MID" if i < 3 else "GK",
                "team": "t",
                "score": 40.0 + 6 * i + 3 * (week % 3),
                "played": True,
                "started": True,
                "mins": 90,
                "proj": 45.0 + i,
            }
            for i in range(5)
        }
        games.append({"id": f"g{week}", "date": when, "players": players})

    found = league.replay(games, [], datetime(2026, 12, 1, tzinfo=UTC))

    assert found["games"] == 10 and found["players"] == 5
    assert found["xscore"]["shown"]["started"]["games"] > 0 and set(found["pairs"]) >= {"today", "last5", "flat"}
    assert found["vsSorare"]["games"] > 0 and "2026/27" in found["bySeason"]
    assert "secret-player" not in str(found)  # numbers only: it can be committed
