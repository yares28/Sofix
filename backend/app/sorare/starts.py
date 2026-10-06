"""Who said he would start: Sorare, Sofix and Futbol Fantasy, written down before each lock and settled by what happened.

Three sources give a chance that a player starts a game: Sorare's own odds, Sofix's model (from his form alone, with
Sorare's numbers taken away so it is really a second opinion) and Futbol Fantasy's expected lineups. Futbol Fantasy's is the
one the page shows (plans/futbolfantasy.md), so the others are kept to be measured against it: every run writes each
source's number for each game of each of the owner's players in the gameweek being planned. While the gameweek is open a
later run replaces the number; once it has locked the number is frozen, since what matters is what was said before the team
news. A day after the gameweek ends, `started` is filled in for each game from what happened in it. `compare` then scores
the sources against each other.

It is one read model (`start_chances`), not a table: a season is a few thousand entries, and keeping it there means no
schema change for the unattended refresh to trip over. A game is one entry of a player's `games`, by Sorare's game id, so a
double gameweek is two observations; the entries written before that, one per player and gameweek, are still read.

Beside each chance the record also holds what the model made of the player (`model`: Sorare's projection and odds, his score
if he starts and if he comes on, the chance of each, which source's number the page used, how much form he had) and what each
of his games was (`info`: competition, opponent, home or away, kickoff), written and frozen on the same rule; and once a game is
settled, what he scored in it and for how many minutes. That is what a backtest of the xScore needs and the season does not
give back afterwards (roadmap 1.3, plans/xscore.md P1).
"""

from __future__ import annotations

import copy
import dataclasses
from collections.abc import Callable
from dataclasses import dataclass
from datetime import datetime
from typing import Any

from sqlalchemy.orm import Session

from app.models import ReadModel
from app.services.publish import put
from app.sorare.forecast import GameStart, PlayerWeek
from app.sorare.forecast import forecast as build_forecast
from app.sorare.publish import SETTLE, ScoresOf, card_games, player_weeks

START_KEY = "start_chances"
SOURCES = ("sorare", "sofix", "futbolfantasy")
Starts = Callable[[str, list[dict[str, Any]]], list[GameStart]]


@dataclass(frozen=True)
class Row:
    player: str  # Sorare's player slug
    gameweek: str  # the fixture slug
    game: str  # Sorare's id for the game
    source: str
    chance: float  # 0 to 1
    lock: datetime
    at: datetime | None = (
        None  # when the source said it, if that is not when this run wrote it (Futbol Fantasy's reading)
    )


@dataclass(frozen=True)
class Note:
    """What the model made of one player's week and what each of his games was, as a run saw them (roadmap 1.3)."""

    player: str
    gameweek: str
    lock: datetime
    model: dict[str, Any]
    games: dict[str, dict[str, Any]]  # Sorare's game id -> competition, team, opponent, venue, kickoff


def _dt(value: str) -> datetime:
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


def _planned(
    snapshot: dict[str, Any], ff: Starts | None, scores: ScoresOf | None = None
) -> tuple[dict[str, Any], datetime, dict[str, list[dict[str, Any]]], dict[str, PlayerWeek]]:
    """The gameweek being planned, its lock, each player's games in it and what is known about each player before it: the same
    numbers the page's plans are built on (the game model's score included), so the record scores what the page said."""
    week = snapshot["planGameweek"]
    lock = _dt(week["lock"])
    games = card_games(snapshot["cards"], "plan")
    weeks = player_weeks(
        snapshot["cards"],
        games,
        snapshot["history"],
        lock,
        None,
        use_sorare=True,
        ff=ff,
        scores=scores,
        projections=snapshot.get("projections"),
    )
    return week, lock, games, weeks


def _round(value: float | None) -> float | None:
    return None if value is None else round(float(value), 3)


def notes(snapshot: dict[str, Any], ff: Starts | None = None, scores: ScoresOf | None = None) -> list[Note]:
    """For each of the owner's players with a game in the gameweek being planned: the numbers the model had for him (the
    ones the page used, Sorare's own, and how much form he had) and what each of his games is."""
    week, lock, games, weeks = _planned(snapshot, ff, scores)
    out: list[Note] = []
    for player, seen in weeks.items():
        if seen.games <= 0:
            continue
        made = build_forecast(seen)
        last = seen.history[:5]
        model = {
            "games": seen.games,
            "pos": seen.pos,
            "projection": _round(seen.projection),
            "playsOdds": _round(seen.plays_odds),
            "startOdds": _round(seen.start_odds),
            "mu": _round(made.mu),
            "pPlay": _round(made.p_play),
            "source": made.source,
            "start": _round(made.start),
            "bench": _round(made.bench),
            "on": _round(made.on),
            "pStart": _round(made.p_start),
            "pOn": _round(made.p_on),
            "benchedOn": _round(made.benched_on),
            "startSource": made.start_source,
            "form": {
                "n": len(last),
                "played": sum(1 for _, _, ok in last if ok),
                "started": sum(1 for day, _, ok in last if ok and seen.starts.get(day) is True),
            },
        }
        info = {
            game["id"]: {key: game.get(key) for key in ("competition", "team", "opponent", "venue", "kickoff")}
            for game in games[player]
        }
        out.append(Note(player, week["slug"], lock, model, info))
    return out


def rows(snapshot: dict[str, Any], ff: Starts | None = None) -> list[Row]:
    """Each source's chance for each game of the owner's players in the gameweek being planned.

    Sorare's starter odds are about his next Classic fixture, so they are written against his first game; the app's own
    chance comes from his form alone and is the same for each of his games; Futbol Fantasy's is each game's own.
    """
    week, lock, games, weeks = _planned(snapshot, ff)
    out: list[Row] = []
    for player, seen in weeks.items():
        if seen.games <= 0:
            continue
        ordered = sorted(games[player], key=lambda game: _dt(game["kickoff"]))
        if seen.start_odds is not None:
            out.append(Row(player, week["slug"], ordered[0]["id"], "sorare", seen.start_odds, lock))
        # The app's own chance: Sorare's projection and odds taken away, so what is left is what it makes of his form.
        alone = build_forecast(
            dataclasses.replace(seen, projection=None, plays_odds=None, start_odds=None, game_ids=[], game_starts=[])
        )
        if alone.p_start is not None:
            out.extend(Row(player, week["slug"], game["id"], "sofix", alone.p_start, lock) for game in ordered)
        for told in seen.game_starts:
            read = told.info.get("startAt")
            out.append(
                Row(player, week["slug"], told.game, "futbolfantasy", told.p_start, lock, _dt(read) if read else None)
            )
    return out


def _load(db: Session) -> dict[str, Any]:
    row = db.get(ReadModel, START_KEY)
    payload = copy.deepcopy(dict(row.payload)) if row and isinstance(row.payload, dict) else {}
    payload.setdefault("weeks", {})
    return payload


def save(db: Session, fresh: list[Row], now: datetime, extra: list[Note] | None = None) -> dict[str, int]:
    """Write the rows down. A number is replaced while its gameweek is open and frozen once it has locked; one first seen
    after the lock is not made up afterwards, since it would look like what was said before the team news. The notes, when
    given, follow the same rule and are counted apart (`noted`)."""
    if not fresh and not extra:
        return {"written": 0, "frozen": 0}
    payload = _load(db)
    written = frozen = 0
    for row in fresh:
        locked = now >= row.lock
        week = payload["weeks"].get(row.gameweek)
        entry = ((week or {}).get("players", {}).get(row.player) or {}).get("games", {}).get(row.game) or {}
        if row.source in entry and locked:
            frozen += 1
            continue
        if locked:
            continue
        week = payload["weeks"].setdefault(row.gameweek, {"lock": row.lock.isoformat(), "players": {}})
        game = week["players"].setdefault(row.player, {}).setdefault("games", {}).setdefault(row.game, {})
        game[row.source] = {"chance": round(row.chance, 4), "at": (row.at or now).isoformat()}
        written += 1
    noted = 0
    for note in extra or ():
        if now >= note.lock:
            continue  # locked: what the model said stays as it was, and a player first seen now is not made up
        players = payload["weeks"].setdefault(note.gameweek, {"lock": note.lock.isoformat(), "players": {}})["players"]
        entry = players.setdefault(note.player, {})
        entry["model"] = {"at": now.isoformat(), **note.model}
        for game_id, info in note.games.items():
            entry.setdefault("games", {}).setdefault(game_id, {})["info"] = dict(info)
        noted += 1
    if written or noted:
        put(db, START_KEY, payload, now)
    return {"written": written, "frozen": frozen, **({"noted": noted} if extra is not None else {})}


def settle(db: Session, snapshot: dict[str, Any]) -> dict[str, int]:
    """Fill in whether he started each game of the gameweek just played, once its scores are final (a day after it ends)."""
    week = snapshot.get("pastGameweek")
    now = _dt(snapshot["fetchedAt"])
    if not week or now < _dt(week["end"]) + SETTLE:
        return {"settled": 0}
    payload = _load(db)
    players = (payload["weeks"].get(week["slug"]) or {}).get("players", {})
    start, end = _dt(week["start"]), _dt(week["end"])
    settled = 0
    for player, entry in players.items():
        history = snapshot["history"].get(player, [])
        for game_id, game in (entry.get("games") or {}).items():
            if "started" in game:
                continue
            # A game still to be scored is neither a start nor a miss; one that was scored and not played is a miss.
            scored = [h for h in history if h.get("gameId") == game_id and h.get("status") != "PENDING"]
            if not scored:
                continue  # no result on record for that game: left open rather than guessed
            game["started"] = any(h.get("played") and h.get("started") for h in scored)
            result = next((h for h in scored if h.get("played")), scored[0])
            game["played"] = bool(result.get("played"))
            game["score"] = result.get("score")
            game["mins"] = result.get("mins") if result.get("played") else None
            game["comp"] = result.get("competition")
            settled += 1
        if "started" in entry or "games" in entry:
            continue
        # The entries from before games were told apart: one per player, settled over the gameweek's days.
        scored = [h for h in history if start <= _dt(h["date"]) < end and h.get("status") != "PENDING"]
        if scored:
            entry["started"] = any(h.get("played") and h.get("started") for h in scored)
            settled += 1
    if settled:
        put(db, START_KEY, payload, now)
    return {"settled": settled}


def _observations(payload: dict[str, Any]) -> list[tuple[dict[str, Any], bool]]:
    """Every settled game (or, in the older entries, every settled player-gameweek) with what each source said and what happened."""
    found: list[tuple[dict[str, Any], bool]] = []
    for week in (payload.get("weeks") or {}).values():
        for entry in (week.get("players") or {}).values():
            for game in (entry.get("games") or {}).values():
                if "started" in game:
                    found.append((game, bool(game["started"])))
            if "started" in entry:
                found.append((entry, bool(entry["started"])))
    return found


def compare(payload: dict[str, Any]) -> dict[str, dict[str, float]]:
    """How each source did on the games it had a number for, once they were settled.

    `brier` is the mean squared distance from what happened (0 is perfect, 0.25 is saying 50% every time: lower is better),
    `right` how often calling it at 50% was right, `mean` the chance the source gave on average, which should sit near
    how often players really start.
    """
    by_source: dict[str, list[tuple[float, bool]]] = {}
    for said, started in _observations(payload):
        for source in SOURCES:
            if source in said:
                by_source.setdefault(source, []).append((float(said[source]["chance"]), started))
    return {
        source: {
            "n": len(pairs),
            "brier": sum((chance - float(started)) ** 2 for chance, started in pairs) / len(pairs),
            "right": sum((chance >= 0.5) == started for chance, started in pairs) / len(pairs),
            "mean": sum(chance for chance, _ in pairs) / len(pairs),
        }
        for source, pairs in by_source.items()
    }
