"""A player's score if he starts, worked out from each game itself, for the refresh (plans/xscore.md P9 X3 and X4; roadmap 10.3 and 10.4).

One callback for `publish.player_weeks`: for his card, his games of the gameweek, Sorare's projection and his past games it answers a score for
each game, in kick-off order, or nothing when any game of the week cannot be told (a game outside LaLiga, no prediction for it, a club the
registry does not know, no fitted line for his position): his number is then what it was, a week half known is not guessed at.

A goalkeeper's comes from `keeper.py` (the chance of a clean sheet, his score with and without one), the others' from `outfield.py`.
"""

from __future__ import annotations

from collections.abc import Callable
from typing import Any

from app.sorare import keeper as keeper_model
from app.sorare import outfield
from app.sorare.keeper import GameNumbers
from app.sorare.model import SORARE_POSITION

Find = Callable[[str, str], GameNumbers | None]


def scores_for(
    goalkeepers: keeper_model.KeeperModel | None, outfielders: dict[str, outfield.OutfieldModel], find: Find
) -> Callable[[dict[str, Any], list[dict[str, Any]], float | None, list[dict[str, Any]]], tuple[float, ...]]:
    keepers = keeper_model.outcomes_for(goalkeepers, find)

    def of(
        player: dict[str, Any], games: list[dict[str, Any]], projection: float | None, past: list[dict[str, Any]]
    ) -> tuple[float, ...]:
        pos = SORARE_POSITION.get(player.get("position") or "")
        if pos == "GK":
            return tuple(out.start for out in keepers(player, games, projection))
        model = outfielders.get(pos or "")
        if model is None or not games:
            return ()
        club = player.get("activeClub") or {}
        names = [name for name in (club.get("name"), club.get("shortName")) if name]
        own_dec, own_score = outfield.own_record(
            [h["score"] for h in past if h.get("played") and h.get("started") and h.get("score") is not None]
        )
        found: list[float] = []
        for i, game in enumerate(sorted(games, key=lambda g: g["kickoff"])):
            if game.get("competition") != keeper_model.LALIGA:
                return ()
            numbers = next((n for name in names if (n := find(name, game["kickoff"])) is not None), None)
            if numbers is None:
                return ()
            found.append(
                model.predict(numbers, game.get("venue") == "H", own_dec, own_score, projection if i == 0 else None)
            )
        return tuple(found)

    return of
