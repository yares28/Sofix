"""Permanent game rows shared by the daily league read and the owner's refresh."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import Any

from sqlalchemy import or_, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.dialects.sqlite import insert as sqlite_insert
from sqlalchemy.orm import Session

from app.models import PlayerGame
from app.services.timeutil import as_utc

ACTUAL = ("competition", "home", "away", "status", "score", "played", "started", "mins", "yellow", "red", "stats")


def season_start(at: datetime) -> datetime:
    return datetime(at.year if at.month >= 7 else at.year - 1, 7, 1, tzinfo=UTC)


def save(db: Session, history: dict[str, list[dict[str, Any]]], at: datetime) -> int:
    """Only write actual columns; a delayed read cannot replace a newer read or frozen source statements."""
    insert = pg_insert if db.get_bind().dialect.name == "postgresql" else sqlite_insert
    groups: dict[tuple[str, ...], list[dict[str, Any]]] = {}
    unique: dict[tuple[str, str], dict[str, Any]] = {}
    for player, games in history.items():
        for game in games:
            if not game.get("gameId") or not game.get("date") or not game.get("competition"):
                continue
            values = {key: game[key] for key in ACTUAL if key in game and game[key] is not None}
            # NULL is meaningful for a pending score or unrecorded minutes, but absent cards/stats never erase a read.
            values.update({key: game[key] for key in ("score", "mins") if key in game})
            values.update(
                player=player, game_id=game["gameId"], date=as_utc(datetime.fromisoformat(game["date"])), read_at=at
            )
            key = player, game["gameId"]
            unique[key] = {**unique.get(key, {}), **values}
    for values in unique.values():
        groups.setdefault(tuple(values), []).append(values)
    for columns, rows in groups.items():
        for offset in range(0, len(rows), 100):
            statement = insert(PlayerGame).values(rows[offset : offset + 100])
            db.execute(
                statement.on_conflict_do_update(
                    index_elements=[PlayerGame.player, PlayerGame.game_id],
                    set_={key: getattr(statement.excluded, key) for key in columns if key not in ("player", "game_id")},
                    where=or_(PlayerGame.read_at.is_(None), PlayerGame.read_at <= at),
                )
            )
    db.commit()
    return len(unique)


def load(db: Session, *, now: datetime | None = None, days: int | None = None) -> dict[str, Any]:
    """The legacy history shape; the visible form window does not limit permanent storage or yellow totals."""
    at = now or datetime.now(UTC)
    cutoff = at - timedelta(days=days) if days is not None else None
    query = select(PlayerGame).order_by(PlayerGame.date)
    if cutoff:
        query = query.where(PlayerGame.date >= cutoff)
    out: dict[str, Any] = {}
    totals: dict[tuple[str, int], int] = {}
    if cutoff:
        for player, date, yellow in db.execute(
            select(PlayerGame.player, PlayerGame.date, PlayerGame.yellow).where(
                PlayerGame.competition == "laliga-es", PlayerGame.date < cutoff, PlayerGame.yellow.isnot(None)
            )
        ):
            key = player, season_start(as_utc(date)).year
            totals[key] = totals.get(key, 0) + yellow
    for row in db.scalars(query):
        date = as_utc(row.date)
        game = {key: value for key in ACTUAL if (value := getattr(row, key)) is not None}
        game.update(gameId=row.game_id, date=date.isoformat(), score=row.score, played=row.played, mins=row.mins)
        if row.competition == "laliga-es":
            key = row.player, season_start(date).year
            totals[key] = totals.get(key, 0) + (row.yellow or 0)
            game["seasonYellows"] = totals[key]
        entry = out.setdefault(row.player, {"at": "", "games": []})
        if row.read_at:
            entry["at"] = max(entry["at"], as_utc(row.read_at).isoformat())
        entry["games"].append(game)
    for entry in out.values():
        entry["games"].reverse()
    return out


def save_statements(db: Session, record: dict[str, Any], now: datetime, lineups: dict[str, Any] | None = None) -> int:
    """Keep the latest pre-lock reading; only statement columns are updated, and a failed source keeps its last number."""
    lock = datetime.fromisoformat(record["gameweek"]["lock"])
    at = datetime.fromisoformat(record["writtenAt"])
    if now >= lock or at >= lock:
        return 0  # never reconstruct something first seen after the lock
    elevens: dict[tuple[str, str], bool] = {}
    for match in (lineups or {}).get("matches") or []:
        for name in ("home", "away"):
            side = match.get(name) or {}
            if not side.get("published"):
                continue
            for row in side.get("rows") or []:
                for player in row.get("players") or []:
                    elevens[str(match["id"]), str(player["id"])] = True
            for player in side.get("alternatives") or []:
                elevens.setdefault((str(match["id"]), str(player["id"])), False)
    insert = pg_insert if db.get_bind().dialect.name == "postgresql" else sqlite_insert
    groups: dict[tuple[str, ...], list[dict[str, Any]]] = {}
    for slug, entry in (record.get("players") or {}).items():
        for game in entry.get("games") or []:
            if not game.get("id") or not game.get("kickoff") or not game.get("competition"):
                continue
            sources = game.get("sources") or {}
            said = {
                "ff_start": sources.get("futbolfantasy"),
                "sorare_start": sources.get("sorare"),
                "sofix_start": sources.get("sofix"),
                "sofix_x": game.get("sofix"),
                "sorare_x": game.get("sorare"),
                "ff_xi": elevens.get((str((game.get("ffMatch") or {}).get("id")), str(game.get("ffPlayer")))),
            }
            values = {key: value for key, value in said.items() if value is not None}
            columns = (*values, "said_at")
            values.update(
                player=slug,
                game_id=game["id"],
                date=as_utc(datetime.fromisoformat(game["kickoff"])),
                competition=game["competition"],
                home=game.get("home"),
                away=game.get("away"),
                said_at=at,
            )
            groups.setdefault(columns, []).append(values)
    count = 0
    for columns, rows in groups.items():
        for offset in range(0, len(rows), 100):
            statement = insert(PlayerGame).values(rows[offset : offset + 100])
            db.execute(
                statement.on_conflict_do_update(
                    index_elements=[PlayerGame.player, PlayerGame.game_id],
                    set_={key: getattr(statement.excluded, key) for key in columns},
                    where=or_(PlayerGame.said_at.is_(None), PlayerGame.said_at <= at),
                )
            )
        count += len(rows)
    db.flush()
    return count
