"""Who said he would start: Sorare, Sofix and Futbol Fantasy, written down before each lock and settled by what happened.

Three sources give a chance that a player starts a game: Sorare's own odds, Sofix's model (from his form alone, with
Sorare's numbers taken away so it is really a second opinion) and Futbol Fantasy's expected lineups. Nobody yet knows which
to trust, so every run writes each source's number for each of the owner's players with a game in the gameweek being
planned. While the gameweek is open a later run replaces the number; once it has locked the number is frozen, since what
matters is what was said before the team news. A day after the gameweek ends, `started` is filled in from what happened.
`compare` then scores the sources against each other.

It is one read model (`start_chances`), not a table: a season is a few thousand entries, and keeping it there means no
schema change for the unattended refresh to trip over. Nothing on screen reads it yet.
"""

from __future__ import annotations

import copy
import dataclasses
from collections.abc import Callable
from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Any

from sqlalchemy.orm import Session

from app.models import ReadModel
from app.services.publish import put
from app.sorare import projection, xg
from app.sorare.forecast import forecast as build_forecast
from app.sorare.publish import SETTLE, card_games, player_weeks
from app.sources import futbolfantasy

START_KEY = "start_chances"
FF_KEY = "futbolfantasy"  # the last page of chances read, kept so the site is asked only every few hours
SOURCES = ("sorare", "sofix", "futbolfantasy")
REFRESH = timedelta(hours=6)  # how long a read of the site is reused: twenty pages each time is enough for a day
NEAR = timedelta(hours=3)  # within this of a lock the team news is what counts...
NEAR_REFRESH = timedelta(minutes=45)  # ...so the site is asked more often then


@dataclass(frozen=True)
class Row:
    player: str  # Sorare's player slug
    gameweek: str  # the fixture slug
    source: str
    chance: float  # 0 to 1
    lock: datetime


def _dt(value: str) -> datetime:
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


def _matched(cards: list[dict[str, Any]], found: futbolfantasy.Snapshot | None) -> dict[str, futbolfantasy.Chance]:
    """Futbol Fantasy's chance for each LaLiga player of the owner's it can name with confidence (none is guessed)."""
    if found is None:
        return {}
    league, by_id = found.as_league(), found.by_id()
    out: dict[str, futbolfantasy.Chance] = {}
    for row in cards:
        player = row["player"]
        club = player.get("activeClub") or {}
        if player["slug"] in out or (club.get("domesticLeague") or {}).get("slug") != projection.LALIGA:
            continue
        match = xg.find(row, league, overrides={})  # Understat's hand-checked ids are not this site's
        if match is not None:
            out[player["slug"]] = by_id[match.id]
    return out


def _window(found: futbolfantasy.Snapshot | None, rounds: list[projection.Round]) -> tuple[datetime, datetime] | None:
    """The days of the round the site's chances are about, from the calendar; None when that round is not one we know."""
    if found is None or found.round is None:
        return None
    for round_ in rounds:
        if round_.number == found.round:
            kickoffs = [match.kickoff for match in round_.matches]
            return min(kickoffs) - timedelta(days=1), max(kickoffs) + timedelta(days=1)
    return None


def _plays_in(games: list[dict[str, Any]], window: tuple[datetime, datetime]) -> bool:
    return any(g.get("competition") == projection.LALIGA and window[0] <= _dt(g["kickoff"]) <= window[1] for g in games)


def chances(
    db: Session,
    now: datetime,
    lock: datetime,
    fetch: Callable[[], futbolfantasy.Snapshot | None] | None = None,
    write: bool = True,
) -> futbolfantasy.Snapshot | None:
    """Futbol Fantasy's chances, read at most every six hours (every 45 minutes in the last three before the lock).

    Between reads the last one is reused. A page that cannot be read gives nothing, never the old answer in its place: a
    chance from yesterday is not what the site says now.
    """
    row = db.get(ReadModel, FF_KEY)
    kept = None
    if row and isinstance(row.payload, dict) and row.payload.get("fetchedAt"):
        try:
            kept = futbolfantasy.Snapshot(
                round=row.payload.get("round"), chances=[futbolfantasy.Chance(**c) for c in row.payload["chances"]]
            )
        except (TypeError, KeyError):
            kept = None
    every = NEAR_REFRESH if timedelta(0) <= lock - now <= NEAR else REFRESH
    if kept is not None and row is not None and now - _dt(row.payload["fetchedAt"]) < every:
        return kept
    db.rollback()  # reading the site takes a while: the connection is not left inside a transaction meanwhile
    found = (fetch or futbolfantasy.fetch_all)()
    if found is None or not found.chances:
        return None
    if write:
        put(
            db,
            FF_KEY,
            {
                "fetchedAt": now.isoformat(),
                "round": found.round,
                "chances": [dataclasses.asdict(c) for c in found.chances],
            },
            now,
        )
    return found


def rows(snapshot: dict[str, Any], found: futbolfantasy.Snapshot | None, rounds: list[projection.Round]) -> list[Row]:
    """Each source's chance for each of the owner's players with a game in the gameweek being planned."""
    week = snapshot["planGameweek"]
    lock = _dt(week["lock"])
    games = card_games(snapshot["cards"], "plan")
    weeks = player_weeks(snapshot["cards"], games, snapshot["history"], lock, None, use_sorare=True)
    matched = _matched(snapshot["cards"], found)
    window = _window(found, rounds)
    out: list[Row] = []
    for player, seen in weeks.items():
        if seen.games <= 0:
            continue
        if seen.start_odds is not None:
            out.append(Row(player, week["slug"], "sorare", seen.start_odds, lock))
        # The app's own chance: Sorare's projection and odds taken away, so what is left is what it makes of his form.
        alone = build_forecast(dataclasses.replace(seen, projection=None, plays_odds=None, start_odds=None))
        if alone.p_start is not None:
            out.append(Row(player, week["slug"], "sofix", alone.p_start, lock))
        chance = matched.get(player)
        if chance is not None and window is not None and _plays_in(games.get(player, []), window):
            out.append(Row(player, week["slug"], "futbolfantasy", chance.chance, lock))
    return out


def _load(db: Session) -> dict[str, Any]:
    row = db.get(ReadModel, START_KEY)
    payload = copy.deepcopy(dict(row.payload)) if row and isinstance(row.payload, dict) else {}
    payload.setdefault("weeks", {})
    return payload


def save(db: Session, fresh: list[Row], now: datetime) -> dict[str, int]:
    """Write the rows down. A number is replaced while its gameweek is open and frozen once it has locked; one first seen
    after the lock is not made up afterwards, since it would look like what was said before the team news."""
    if not fresh:
        return {"written": 0, "frozen": 0}
    payload = _load(db)
    written = frozen = 0
    for row in fresh:
        locked = now >= row.lock
        week = payload["weeks"].get(row.gameweek)
        was = ((week or {}).get("players", {}).get(row.player) or {}).get(row.source)
        if was is not None and locked:
            frozen += 1
            continue
        if locked:
            continue
        week = payload["weeks"].setdefault(row.gameweek, {"lock": row.lock.isoformat(), "players": {}})
        week["players"].setdefault(row.player, {})[row.source] = {"chance": round(row.chance, 4), "at": now.isoformat()}
        written += 1
    if written:
        put(db, START_KEY, payload, now)
    return {"written": written, "frozen": frozen}


def settle(db: Session, snapshot: dict[str, Any]) -> dict[str, int]:
    """Fill in whether each player started the gameweek just played, once its scores are final (a day after it ends)."""
    week = snapshot.get("pastGameweek")
    now = _dt(snapshot["fetchedAt"])
    if not week or now < _dt(week["end"]) + SETTLE:
        return {"settled": 0}
    payload = _load(db)
    players = (payload["weeks"].get(week["slug"]) or {}).get("players", {})
    start, end = _dt(week["start"]), _dt(week["end"])
    settled = 0
    for player, entry in players.items():
        if "started" in entry:
            continue
        # A game still to be scored is neither a start nor a miss; one that was scored and not played is a miss.
        scored = [
            h
            for h in snapshot["history"].get(player, [])
            if start <= _dt(h["date"]) < end and h.get("status") != "PENDING"
        ]
        if not scored:
            continue  # no game on record for him in that window: left open rather than guessed
        entry["started"] = any(h.get("played") and h.get("started") for h in scored)
        settled += 1
    if settled:
        put(db, START_KEY, payload, now)
    return {"settled": settled}


def compare(payload: dict[str, Any]) -> dict[str, dict[str, float]]:
    """How each source did on the players it had a number for, once their gameweek was settled.

    `brier` is the mean squared distance from what happened (0 is perfect, 0.25 is saying 50% every time: lower is better),
    `right` how often calling it at 50% was right, `mean` the chance the source gave on average, which should sit near
    how often players really start.
    """
    by_source: dict[str, list[tuple[float, bool]]] = {}
    for week in (payload.get("weeks") or {}).values():
        for entry in (week.get("players") or {}).values():
            if "started" not in entry:
                continue
            for source in SOURCES:
                if source in entry:
                    by_source.setdefault(source, []).append((float(entry[source]["chance"]), bool(entry["started"])))
    return {
        source: {
            "n": len(pairs),
            "brier": sum((chance - float(started)) ** 2 for chance, started in pairs) / len(pairs),
            "right": sum((chance >= 0.5) == started for chance, started in pairs) / len(pairs),
            "mean": sum(chance for chance, _ in pairs) / len(pairs),
        }
        for source, pairs in by_source.items()
    }
