"""A player's score if he starts, worked out from each game itself, for the refresh (plans/xscore.md P9 X3 and X4; roadmap 10.3 and 10.4).

One callback for `publish.player_weeks`: for his card, his games of the gameweek, Sorare's projection and his past games it answers a score for
each game, in kick-off order, or nothing when any game of the week cannot be told (a game outside LaLiga, no prediction for it, a club the
registry does not know, no fitted line for his position): his number is then what it was, a week half known is not guessed at.

A goalkeeper's comes from `keeper.py` (the chance of a clean sheet, his score with and without one), the others' from `outfield.py`.
"""

from __future__ import annotations

import dataclasses
from collections.abc import Callable
from typing import Any, NamedTuple

from app.sorare import keeper as keeper_model
from app.sorare import outfield
from app.sorare.keeper import GameNumbers, Outcome
from app.sorare.model import SORARE_POSITION

Find = Callable[[str, str], GameNumbers | None]


class Made(NamedTuple):
    """A player's games worked out: one picture of each game in kick-off order (none when any game cannot be told), and the position's picture of a substitute."""

    outcomes: tuple[Outcome, ...]
    sub: outfield.SubShape | None


def _named(outcome: Outcome, opponent: str | None) -> Outcome:
    """The reason called "Opponent" says who he is: "Barcelona"."""
    if not opponent:
        return outcome
    return dataclasses.replace(
        outcome, why=tuple((opponent if name == "Opponent" else name, pts) for name, pts in outcome.why)
    )


def scores_for(
    goalkeepers: keeper_model.KeeperModel | None,
    outfielders: dict[str, outfield.OutfieldModel],
    find: Find,
    subs: dict[str, outfield.SubShape] | None = None,
) -> Callable[[dict[str, Any], list[dict[str, Any]], float | None, list[dict[str, Any]]], Made]:
    keepers = keeper_model.outcomes_for(goalkeepers, find)

    def of(
        player: dict[str, Any], games: list[dict[str, Any]], projection: float | None, past: list[dict[str, Any]]
    ) -> Made:
        pos = SORARE_POSITION.get(player.get("position") or "")
        sub = (subs or {}).get(pos or "")
        ordered = sorted(games, key=lambda g: g["kickoff"])
        if pos == "GK":
            outs = keepers(player, games, projection)
            return Made(tuple(_named(o, g.get("opponent")) for o, g in zip(outs, ordered, strict=False)), sub)
        model = outfielders.get(pos or "")
        if model is None or not games:
            return Made((), sub)
        club = player.get("activeClub") or {}
        names = [name for name in (club.get("name"), club.get("shortName")) if name]
        own_dec, own_score = outfield.own_record(
            [h["score"] for h in past if h.get("played") and h.get("started") and h.get("score") is not None]
        )
        found: list[Outcome] = []
        for i, game in enumerate(ordered):
            if game.get("competition") != keeper_model.LALIGA:
                return Made((), sub)
            numbers = next((n for name in names if (n := find(name, game["kickoff"])) is not None), None)
            if numbers is None:
                return Made((), sub)
            found.append(
                _named(
                    model.outcome(
                        numbers, game.get("venue") == "H", own_dec, own_score, projection if i == 0 else None
                    ),
                    game.get("opponent"),
                )
            )
        return Made(tuple(found), sub)

    return of
