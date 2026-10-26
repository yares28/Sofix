"""Sofix's own LaLiga number never reads Sorare's projection (plans/score-engine.md E0, the owner's rule of 26 Oct 2026).

Sorare's number stays in the payload as the yardstick (`Forecast.sorare`) and as the score of the Play page's Sorare plan.
"""

from __future__ import annotations

import dataclasses

import pytest

from app.sorare import forecast as sorare_forecast
from app.sorare import keeper, outfield, scores
from app.sorare.forecast import PlayerWeek
from app.sorare.keeper import GameNumbers

FIND = lambda club, kickoff: GameNumbers(cs=0.3, xga=1.1, xgf=1.6, p_over=0.55)  # noqa: E731
GAME = {"competition": "laliga-es", "kickoff": "2026-10-31T20:00:00Z", "venue": "H", "opponent": "Getafe CF"}
PAST = [{"played": True, "started": True, "score": 55.0}] * 8


@pytest.mark.parametrize("position", ["Goalkeeper", "Defender", "Midfielder", "Forward"])
def test_the_shipped_lines_give_the_same_number_whatever_sorare_projects(position: str) -> None:
    of = scores.scores_for(keeper.load(), outfield.load(), FIND)
    card = {"position": position, "activeClub": {"name": "Real Betis", "shortName": "Betis"}}
    without = of(card, [GAME], None, PAST).outcomes
    assert without, "the line must tell this game"
    for projection in (20.0, 80.0):
        assert of(card, [GAME], projection, PAST).outcomes == without


def rotation_week(projection: float | None) -> PlayerWeek:
    """A player who starts about half his games, with Sofix's own score for his game this week."""
    history = [(f"2026-10-{d:02d}", s, True) for d, s in ((25, 60.0), (18, 42.0), (11, 38.0), (4, 51.0), (1, 47.0))]
    return PlayerWeek(
        games=1,
        projection=projection,
        history=history,
        starts={date: i % 2 == 0 for i, (date, _, _) in enumerate(history)},
        pos="MID",
        game_scores=(58.0,),
    )


def test_a_rotation_players_number_does_not_lean_on_sorares_projection() -> None:
    base = sorare_forecast.forecast(rotation_week(None))
    for projection in (25.0, 85.0):
        made = sorare_forecast.forecast(rotation_week(projection))
        assert (made.mu, made.start, made.p_play) == (base.mu, base.start, base.p_play)
        assert made.sorare == projection  # still shown beside it, as the yardstick


def test_without_a_game_of_sofixs_own_the_sorare_plan_still_scores_on_sorares_projection() -> None:
    stripped = dataclasses.replace(rotation_week(85.0), game_scores=())
    assert (
        sorare_forecast.forecast(stripped).mu
        != sorare_forecast.forecast(dataclasses.replace(stripped, projection=None)).mu
    )
