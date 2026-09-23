"""Keep what was known before each gameweek locked.

Sorare serves a player's projection for his *next* fixture only, so the moment a gameweek is played the numbers
its plans were built on are unrecoverable. Every run therefore writes them down:

* while a gameweek is open, the row is overwritten with the latest numbers (Sorare keeps moving them);
* once it has locked, the forecast columns are frozen — only `actual` is filled in, from the scores that arrive
  with the games.

Nothing here calls Sorare: it reads the same snapshot the page is built from.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import SorareForecast
from app.sorare.forecast import forecasts as build_forecasts
from app.sorare.publish import card_games, player_weeks

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class Row:
    """One player's numbers for one gameweek, as a run saw them."""

    player: str
    gameweek: str
    games: int
    projection: float | None
    plays_odds: float | None
    mu: float
    p_play: float
    source: str
    lock: datetime
    actual: float | None


def _dt(value: str) -> datetime:
    return datetime.fromisoformat(value).astimezone(UTC)


def rows(snapshot: dict[str, Any], which: str = "plan") -> list[Row]:
    """The numbers this snapshot holds for the gameweek being planned (`plan`) or the one played (`past`)."""
    week = snapshot["planGameweek"] if which == "plan" else snapshot.get("pastGameweek")
    if not week:
        return []
    lock = _dt(week["lock"])
    games = card_games(snapshot["cards"], which)
    window = (_dt(week["start"]), _dt(week["end"])) if which == "past" else None
    # A played gameweek is read exactly as the page replays it: only what was known before its lock.
    weeks = player_weeks(snapshot["cards"], games, snapshot["history"], lock, window, use_sorare=which == "plan")
    out = []
    for player, seen in weeks.items():
        if seen.games <= 0:
            continue  # no game in this gameweek: nothing was forecast and nothing can be scored
        made = build_forecasts({player: seen})[player]
        out.append(
            Row(
                player=player,
                gameweek=week["slug"],
                games=seen.games,
                projection=seen.projection,
                plays_odds=seen.plays_odds,
                mu=made.mu,
                p_play=made.p_play,
                source=made.source,
                lock=lock,
                actual=seen.actual,
            )
        )
    return out


def moved(db: Session, fresh: list[Row], tolerance: float = 0.5) -> int:
    """How many players' numbers Sorare has changed since the last run wrote them down.

    Only a gameweek that is still open can move, and a row that was never stored doesn't count as a change.
    """
    if not fresh:
        return 0
    stored = {
        row.player: row
        for row in db.scalars(
            select(SorareForecast).where(
                SorareForecast.gameweek == fresh[0].gameweek,
                SorareForecast.player.in_([row.player for row in fresh]),
            )
        )
    }
    changed = 0
    for row in fresh:
        was = stored.get(row.player)
        if was is None or was.projection is None or row.projection is None:
            continue
        if (
            abs(was.projection - row.projection) > tolerance
            or abs((was.plays_odds or 0) - (row.plays_odds or 0)) > 0.05
        ):
            changed += 1
    return changed


def save(db: Session, fresh: list[Row], now: datetime | None = None, *, final: bool = False) -> dict[str, int]:
    """Write the rows down. Returns what happened, for the run's summary.

    `final` marks a gameweek that has been played: those rows carry what each player scored, and they only ever
    fill in a row that already exists. A gameweek nobody recorded before its lock stays a gap on purpose —
    filling it now with numbers rebuilt from form would look like a record of what Sorare said, and it isn't.
    """
    if not fresh:
        return {"written": 0, "frozen": 0, "scored": 0}
    at = now or datetime.now(UTC)
    stored = {
        row.player: row
        for row in db.scalars(select(SorareForecast).where(SorareForecast.gameweek == fresh[0].gameweek))
    }
    written = frozen = scored = 0
    for row in fresh:
        was = stored.get(row.player)
        if was is None:
            if final:
                continue
            db.add(
                SorareForecast(
                    player=row.player,
                    gameweek=row.gameweek,
                    games=row.games,
                    projection=row.projection,
                    plays_odds=row.plays_odds,
                    mu=row.mu,
                    p_play=row.p_play,
                    source=row.source,
                    captured_at=at,
                    lock=row.lock,
                    actual=None,
                    played=None,
                )
            )
            written += 1
            continue
        if final and was.played is None:
            was.actual = row.actual
            was.played = row.actual is not None  # the window was applied, so "no score" means he didn't play
            scored += 1
        if at >= row.lock:
            frozen += 1  # locked: whatever the plan was built on stays exactly as it was
            continue
        was.games = row.games
        was.projection = row.projection
        was.plays_odds = row.plays_odds
        was.mu = row.mu
        was.p_play = row.p_play
        was.source = row.source
        was.captured_at = at
        written += 1
    db.flush()
    return {"written": written, "frozen": frozen, "scored": scored}
