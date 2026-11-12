"""A player's score if he starts, worked out from each game itself, for the refresh (plans/xscore.md P9 X3 and X4; roadmap 10.3 and 10.4).

One callback for `publish.player_weeks`: for his card, his games of the gameweek, Sorare's projection and his past games it answers a score for
each game, in kick-off order, or nothing when any game of the week cannot be told (a game outside LaLiga, no prediction for it, a club the
registry does not know, no fitted line for his position): his number is then what it was, a week half known is not guessed at.

A goalkeeper's comes from `keeper.py` (the chance of a clean sheet, his score with and without one), the others' from `outfield.py`.

Sorare's projection is taken and not used: Sofix's number stands on its own data (the owner's rule, 26 Oct 2026; plans/score-engine.md E0).
Each line has a version without it, which on the weeks held out from 1 Oct missed by 0.0 to 0.1 points more.
"""

from __future__ import annotations

import dataclasses
from collections.abc import Callable
from datetime import datetime
from typing import Any, NamedTuple

from app.sorare import keeper as keeper_model
from app.sorare import outfield, sofix_v1
from app.sorare.keeper import GameNumbers, Outcome
from app.sorare.model import SORARE_POSITION

Find = Callable[[str, str], GameNumbers | None]


class Made(NamedTuple):
    """A player's games worked out: one picture of each game in kick-off order, and the position's picture of a substitute.

    A game Sofix has no model for is None there; the week's other games keep theirs (plans/multi-competition-review.md B5).
    Empty when no game of the week can be told. `waiting`: the games (kick-off order) whose European board was not checked
    in the last six hours, so they wait for the board instead of having Sofix's number (B7)."""

    outcomes: tuple[Outcome | None, ...]
    sub: outfield.SubShape | None
    waiting: tuple[int, ...] = ()


MATCH = (
    "Opponent",
    "Attack",
)  # what the game's own numbers move: the clean-sheet chance, his side's and the opponent's goals


def _named(outcome: Outcome, opponent: str | None) -> Outcome:
    """The game's numbers as one reason, named after the opponent ("Barcelona"). The line moves the clean-sheet chance and the
    goals against under "Opponent" and his side's goals under "Attack" (outfield.py, frozen), so an easier opponent could read
    as a minus beside a bigger plus; together they are what this opponent does to his number (multi-competition-review X10)."""
    match = sum(pts for name, pts in outcome.why if name in MATCH)
    rest = [(name, pts) for name, pts in outcome.why if name not in MATCH]
    if len(rest) == len(outcome.why):
        return outcome
    why = sorted([*rest, (opponent or "Opponent", match)], key=lambda item: -abs(item[1]))
    return dataclasses.replace(outcome, why=tuple(why))


def scores_for(
    goalkeepers: keeper_model.KeeperModel | None,
    outfielders: dict[str, outfield.OutfieldModel],
    find: Find,
    subs: dict[str, outfield.SubShape] | None = None,
    *,
    v1: sofix_v1.Model | None = None,
) -> Callable[[dict[str, Any], list[dict[str, Any]], float | None, list[dict[str, Any]]], Made]:
    keepers = keeper_model.outcomes_for(goalkeepers, find)

    def of(
        player: dict[str, Any], games: list[dict[str, Any]], projection: float | None, past: list[dict[str, Any]]
    ) -> Made:
        pos = SORARE_POSITION.get(player.get("position") or "")
        sub = (subs or {}).get(pos or "")
        ordered = sorted(games, key=lambda g: g["kickoff"])
        if v1 is None and pos == "GK":
            outs = keepers(player, games, None)
            return Made(tuple(_named(o, g.get("opponent")) for o, g in zip(outs, ordered, strict=False)), sub)
        model = outfielders.get(pos or "")
        if pos is None or not games or (v1 is None and model is None):
            return Made((), sub)
        club = player.get("activeClub") or {}
        names = [name for name in (club.get("name"), club.get("shortName")) if name]
        own_dec, own_score = outfield.own_record(
            [h["score"] for h in past if h.get("played") and h.get("started") and h.get("score") is not None]
        )
        found: list[Outcome | None] = []
        for game in ordered:
            if game.get("competition") != keeper_model.LALIGA:
                return Made((), sub)
            numbers = next((n for name in names if (n := find(name, game["kickoff"])) is not None), None)
            if numbers is None:
                if v1 is None:
                    return Made((), sub)
                found.append(None)
                continue
            home = game.get("venue") == "H"
            previous = (
                goalkeepers.predict(numbers)
                if pos == "GK" and goalkeepers
                else model.outcome(numbers, home, own_dec, own_score)
                if model
                else None
            )
            lock = game.get("forecastBefore")
            before = datetime.fromisoformat(lock.replace("Z", "+00:00")) if lock else None
            if v1 and before and (v1.trained_through is None or v1.trained_through < before):
                found.append(v1.game(pos, home, numbers, sofix_v1.eligible(past, before), previous))
            else:
                found.append(_named(previous, game.get("opponent")) if previous else None)
        if not any(found):
            return Made((), sub)
        return Made(tuple(found), sub)

    return of
