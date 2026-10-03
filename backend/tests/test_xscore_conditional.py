"""The two scores of a player, "if he starts" and "if he comes on" (plans/xscore.md, P7).

A substitute who comes on starts at 35 points like a starter, so what he scores *if he comes on* is about 40, whatever his chance of
coming on. The page used to show the chance of coming on multiplied by that score as his "benched" number (0.8 for a goalkeeper),
which is an expectation and not a score. These tests fix what the two numbers are, and that the backtest scores each on its own
games with nothing from the game itself or later."""

from __future__ import annotations

import dataclasses
from datetime import UTC, datetime, timedelta
from typing import Any

import pytest

from app.sorare import backtest
from app.sorare.forecast import PRIOR_SUB_SCORE, PlayerWeek, forecast

MONDAY = datetime(2026, 1, 5, tzinfo=UTC)


def game(
    day: float, *, score: float = 50.0, played: bool = True, started: bool = True, mins: int | None = None
) -> dict[str, Any]:
    when = MONDAY + timedelta(days=day)
    minutes = mins if mins is not None else (90 if started else 20)
    return {
        "date": when.isoformat().replace("+00:00", "Z"),
        "competition": "laliga-es",
        "gameId": f"g{day}",
        "score": score if played else 0.0,
        "played": played,
        "started": started and played,
        "mins": minutes if played else None,
        "status": "FINAL" if played else "DID_NOT_PLAY",
    }


def player(games: list[dict[str, Any]], pos: str = "FWD") -> dict[str, Any]:
    return {"pos": pos, "name": "Test Player", "games": games}


# ---------------------------------------------------------------------------------------------------- the forecast
def week_of(scores: list[tuple[float, bool]], pos: str = "FWD") -> PlayerWeek:
    """A one-game week after games given newest first as (score, started)."""
    history = [(f"2026-09-{28 - 7 * i:02d}", score, True) for i, (score, _) in enumerate(scores)]
    starts = {date: started for (date, _, _), (_, started) in zip(history, scores, strict=True)}
    return PlayerWeek(games=1, history=history, starts=starts, pos=pos)


def test_the_score_if_he_comes_on_is_a_score_from_his_substitute_appearances_and_not_an_expectation() -> None:
    made = forecast(week_of([(40.0, False), (50.0, False), (55.0, True), (52.0, True), (48.0, True)]))

    assert made.on == pytest.approx((40 + 50 + 2 * PRIOR_SUB_SCORE) / 4)  # 43.5: two appearances, pulled towards 42
    assert made.start is not None and made.on != made.start
    # The old "benched" number is still published, as the chance he comes on if he is benched times that score.
    assert made.benched_on is not None
    assert made.bench == pytest.approx(made.on * made.benched_on, abs=0.1)


def test_a_player_who_never_came_on_gets_the_substitute_norm_and_a_keeper_is_no_different() -> None:
    for pos in ("FWD", "GK"):
        made = forecast(week_of([(55.0, True), (52.0, True), (48.0, True)], pos))
        assert made.on == pytest.approx(PRIOR_SUB_SCORE), pos  # the score of a substitute, not 0.8
        assert made.bench is not None and made.bench < 15


def test_a_week_with_no_game_has_no_score_if_he_comes_on() -> None:
    assert forecast(PlayerWeek(games=0)).on is None


# ---------------------------------------------------------------------------------------------------- the backtest
def test_each_model_is_scored_on_the_games_of_its_own_role_and_a_game_he_did_not_play_on_neither() -> None:
    games = [game(7 * i, started=i % 2 == 0, score=50.0 + i) for i in range(8)] + [game(60, played=False)]
    found = backtest.walk_conditional({"p": player(games)})

    assert {r.model for r in found} == set(backtest.CONDITIONAL_MODELS)
    starts = [r for r in found if r.model.startswith("start:")]
    comes_on = [r for r in found if r.model.startswith("on:")]
    assert starts and comes_on
    assert all(r.started for r in starts)
    assert all(r.played and not r.started for r in comes_on)
    assert not [r for r in found if not r.played]
    # four starts and four appearances off the bench, each predicted by every model of its kind
    assert len([r for r in found if r.model == "start:today"]) == 4
    assert len([r for r in found if r.model == "on:today"]) == 4


def test_what_he_scored_is_the_score_of_that_game_not_an_expectation() -> None:
    games = [game(0, score=50.0), game(7, started=False, score=38.0), game(14, score=61.0)]
    found = backtest.walk_conditional({"p": player(games)})

    assert sorted(r.score for r in found if r.model == "start:today") == [50.0, 61.0]
    assert [r.score for r in found if r.model == "on:today"] == [38.0]


def test_no_prediction_sees_its_own_game_or_a_later_one() -> None:
    base = [game(7 * i, started=i % 3 != 0, score=40.0 + i) for i in range(12)]
    changed = [dict(g) for g in base]
    for later in (9, 10, 11):
        changed[later]["score"] = 99.0

    def said(games: list[dict[str, Any]]) -> dict[str, list[float]]:
        out: dict[str, list[float]] = {}
        for r in backtest.walk_conditional({"p": player(games), "q": player(games, "DEF")}):
            if r.date < MONDAY + timedelta(days=7 * 9):
                out.setdefault(r.model, []).append(r.expected)
        return out

    assert said(base) == said(changed)


def test_the_norm_of_a_position_is_what_every_player_before_the_game_scored_in_that_role() -> None:
    early = [
        game(0, started=False, score=60.0),
        game(7, started=False, score=60.0),
        game(14, started=False, score=60.0),
    ]
    later = [game(21, started=False, score=30.0)]
    afterwards = [game(28, started=False, score=0.0)]  # after the game below: it must not count
    found = backtest.walk_conditional({"b": player(early + afterwards), "a": player(later)})
    norm = {(r.player, r.date.date().isoformat()): r.expected for r in found if r.model == "on:norm"}

    first = (MONDAY + timedelta(days=0)).date().isoformat()
    assert norm[("b", first)] == pytest.approx(PRIOR_SUB_SCORE)  # nobody before him: the prior
    assert norm[("a", (MONDAY + timedelta(days=21)).date().isoformat())] == pytest.approx(60.0)
    # a goalkeeper's substitute scores are another pool
    keeper = backtest.walk_conditional({"b": player(early, "GK"), "a": player(later)})
    pooled = {(r.player, r.date.date().isoformat()): r.expected for r in keeper if r.model == "on:norm"}
    assert pooled[("a", (MONDAY + timedelta(days=21)).date().isoformat())] == pytest.approx(PRIOR_SUB_SCORE)


def test_the_minutes_model_uses_substitutes_who_got_about_as_many_minutes() -> None:
    cameos = [game(7 * i, started=False, score=36.0, mins=8) for i in range(6)]
    long_ones = [game(7 * i, started=False, score=50.0, mins=40) for i in range(6)]
    target_short = [game(60, started=False, score=45.0, mins=8)]
    # a player whose own appearances were long ones is asked about with the pool of long ones
    target_long = [game(60, started=False, score=45.0, mins=40)]
    found = backtest.walk_conditional({"cameo": player(cameos + target_short), "long": player(long_ones + target_long)})
    said = {r.player: r.expected for r in found if r.model == "on:minutes" and r.date == MONDAY + timedelta(days=60)}

    assert said["cameo"] == pytest.approx(36.0)
    assert said["long"] == pytest.approx(50.0)


def test_the_report_names_both_scores_and_says_which_candidate_is_closer() -> None:
    games = [game(7 * i, started=i % 3 != 0, score=40.0 + (i % 5)) for i in range(60)]
    found = backtest.walk_conditional({"p": player(games)})
    text = backtest.conditional_report(found, holdout_from=MONDAY + timedelta(days=7 * 50))

    assert "if he starts" in text.lower() and "if he comes on" in text.lower()
    for name in backtest.CONDITIONAL_MODELS:
        assert name in text
    assert "held out" in text.lower()
    assert dataclasses.is_dataclass(found[0])


def test_the_command_prints_the_two_scores_report_when_asked(tmp_path, capsys) -> None:
    import json

    from app.jobs import xscore_backtest

    games = [game(7 * i, started=i % 3 != 0, score=40.0 + (i % 5)) for i in range(60)]
    path = tmp_path / "history.json"
    path.write_text(json.dumps({"players": {"p": player(games)}}), encoding="utf-8")

    assert xscore_backtest.main(["--history", str(path), "--holdout", "2026-12-21", "--conditional"]) == 0
    printed = capsys.readouterr().out.lower()
    assert "if he starts" in printed and "if he comes on" in printed and "start:norm" in printed

    assert xscore_backtest.main(["--history", str(path), "--holdout", "2026-12-21"]) == 0
    assert "start:norm" not in capsys.readouterr().out  # not part of the usual report
