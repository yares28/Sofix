"""Permanent game rows shared by the daily league read and the owner's refresh."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import Any

from sqlalchemy import JSON, func, literal_column, or_, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.dialects.sqlite import insert as sqlite_insert
from sqlalchemy.orm import Session

from app.models import PlayerGame, ReadModel
from app.services.publish import put
from app.services.timeutil import as_utc

ACTUAL = ("competition", "home", "away", "status", "score", "played", "started", "mins", "yellow", "red", "stats")


def season_start(at: datetime) -> datetime:
    return datetime(at.year if at.month >= 7 else at.year - 1, 7, 1, tzinfo=UTC)


def save(db: Session, history: dict[str, list[dict[str, Any]]], at: datetime, *, only_missing: bool = False) -> int:
    """Write actuals only; only_missing seeds unrecorded actuals without replacing any daily reading."""
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
                    where=PlayerGame.read_at.is_(None)
                    if only_missing
                    else or_(PlayerGame.read_at.is_(None), PlayerGame.read_at <= at),
                )
            )
    db.commit()
    return len(unique)


def _stats_of(db: Session, names: tuple[str, ...] | None) -> Any:
    """The `stats` column, or on Postgres only its entries named `names`: Neon then sends a few of a game's ~25 entries
    (they are 4.8 MB of the league's 70 days). Elsewhere `load` drops the rest itself, so both give the same games."""
    if names is None or db.get_bind().dialect.name != "postgresql":
        return PlayerGame.stats
    wanted = ", ".join(f"'{name}'" for name in names)  # our own constants, never input
    return literal_column(
        "CASE WHEN json_typeof(player_games.stats) = 'array' THEN COALESCE((SELECT json_agg(s) FROM"
        f" json_array_elements(player_games.stats) AS s WHERE s->>'stat' IN ({wanted})), '[]'::json)"
        " ELSE player_games.stats END",
        JSON,
    ).label("stats")


# A played FINAL game's `_context` zero names before this game's date: the first such game to name one keeps it.
_EARLIER_ZEROS = (
    "SELECT ARRAY(SELECT ez FROM player_games AS e, json_array_elements(e.stats) AS es,"
    " json_array_elements_text(es->'zeros') AS ez WHERE e.player = player_games.player AND e.status = 'FINAL'"
    " AND e.played AND e.date < player_games.date AND json_typeof(e.stats) = 'array' AND es->>'stat' = '_context'"
    " AND json_typeof(es->'zeros') = 'array') AS a OFFSET 0"
)
# `{stat: value}` in the detailed score's order, `_context` holding only its new zero names: lean_stats' list, smaller.
_LEAN_SQL = (
    "CASE WHEN json_typeof(player_games.stats) = 'array' THEN (SELECT COALESCE(json_object_agg(s->>'stat',"
    " CASE WHEN s->>'stat' = '_context' THEN (SELECT COALESCE(json_agg(z), '[]'::json) FROM"
    f" ({_EARLIER_ZEROS}) AS earlier, json_array_elements_text(s->'zeros') AS z WHERE z <> ALL(earlier.a))"
    " ELSE s->'statValue' END ORDER BY i), '{}'::json) FROM json_array_elements(player_games.stats)"
    " WITH ORDINALITY AS t(s, i) WHERE s->>'stat' IS NOT NULL"
    " AND (s->>'stat' <> '_context' OR json_typeof(s->'zeros') = 'array')) END"
)


def lean_stats(stats: list[dict[str, Any]], earlier: dict[str, datetime], date: datetime) -> list[dict[str, Any]]:
    """What the readers of a game's detailed score use (mission_form, mission_pool, publish.own_decisive): each entry's name
    and value, and of `_context` only the zero names no played FINAL game before `date` had (`earlier`: name: its first date).
    mission_form only takes the union of those names over such games, which the first game to have each still gives."""
    out = []
    for s in stats:
        if s.get("stat") is None:
            continue
        if s["stat"] != "_context":
            out.append({"stat": s["stat"], "statValue": s.get("statValue")})
        elif isinstance(s.get("zeros"), list):
            out.append({"stat": "_context", "zeros": [z for z in s["zeros"] if not earlier.get(z, date) < date]})
    return out


def load(
    db: Session,
    *,
    now: datetime | None = None,
    days: int | None = None,
    players: set[str] | None = None,
    stats: tuple[str, ...] | None = None,
    lean: bool = False,
) -> dict[str, Any]:
    """The legacy history shape; the visible form window does not limit permanent storage or yellow totals.

    `stats` keeps only those entries of each game's detailed score (None keeps them all). `lean` keeps each detailed score as
    `lean_stats` makes it: on Postgres Neon then sends a third of the bytes (the owner's games, read whole by the missions)."""
    at = now or datetime.now(UTC)
    cutoff = at - timedelta(days=days) if days is not None else None
    columns = [getattr(PlayerGame, key) for key in ("player", "game_id", "date", "read_at", *ACTUAL) if key != "stats"]
    postgres = db.get_bind().dialect.name == "postgresql"
    if lean and postgres:
        columns += [
            literal_column(
                "CASE WHEN json_typeof(player_games.stats) = 'array' THEN NULL ELSE player_games.stats END", JSON
            ).label("stats"),
            literal_column(_LEAN_SQL, JSON).label("lean"),
        ]
    else:
        columns.append(_stats_of(db, stats))
    query = select(*columns).order_by(PlayerGame.date)
    if players is not None:
        query = query.where(PlayerGame.player.in_(players))
    if cutoff:
        query = query.where(PlayerGame.date >= cutoff)
    out: dict[str, Any] = {}
    totals: dict[tuple[str, int], int] = {}
    if cutoff:
        # Only the yellows of the cutoff's own season can add to a game inside the window, summed by Postgres.
        season = season_start(cutoff)
        earlier = select(PlayerGame.player, func.sum(PlayerGame.yellow)).where(
            PlayerGame.competition == "laliga-es",
            PlayerGame.date >= season,
            PlayerGame.date < cutoff,
            PlayerGame.yellow.isnot(None),
        )
        if players is not None:
            earlier = earlier.where(PlayerGame.player.in_(players))
        for player, yellow in db.execute(earlier.group_by(PlayerGame.player)):
            totals[player, season.year] = yellow
    zeros: dict[str, dict[str, datetime]] = {}  # lean elsewhere: each player's zero names, first played FINAL date
    for row in db.execute(query):
        date = as_utc(row.date)
        game = {key: value for key in ACTUAL if (value := getattr(row, key)) is not None}
        if stats is not None and isinstance(game.get("stats"), list):
            game["stats"] = [entry for entry in game["stats"] if entry.get("stat") in stats]
        if lean and postgres and row.lean is not None:
            game["stats"] = [
                {"stat": key, "zeros": value} if key == "_context" else {"stat": key, "statValue": value}
                for key, value in row.lean.items()
            ]
        elif lean and isinstance(game.get("stats"), list):
            seen = zeros.setdefault(row.player, {})
            whole = game["stats"]
            game["stats"] = lean_stats(whole, seen, date)
            if row.status == "FINAL" and row.played:
                for s in whole:
                    if s.get("stat") == "_context" and isinstance(s.get("zeros"), list):
                        for name in s["zeros"]:
                            seen.setdefault(name, date)
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


def listed(db: Session, players: set[str]) -> list[str]:
    """Which of these players have any row, in the order `load(players=...)` lists them (by his first game)."""
    query = select(PlayerGame.player).where(PlayerGame.player.in_(players)).group_by(PlayerGame.player)
    return list(db.scalars(query.order_by(func.min(PlayerGame.date))))


def known(db: Session) -> dict[str, Any]:
    """`load`'s shape with only what the daily league read needs from each game (id, date, status): about a tenth of the
    bytes `load` pulls from Neon, whose free plan sends 5 GB a month."""
    out: dict[str, Any] = {}
    query = select(PlayerGame.player, PlayerGame.game_id, PlayerGame.date, PlayerGame.status, PlayerGame.read_at)
    for player, game_id, date, status, read_at in db.execute(query.order_by(PlayerGame.date.desc())):
        entry = out.setdefault(player, {"at": "", "games": []})
        if read_at:
            entry["at"] = max(entry["at"], as_utc(read_at).isoformat())
        entry["games"].append({"gameId": game_id, "date": as_utc(date).isoformat(), "status": status})
    return out


def read_times(db: Session, *, now: datetime | None = None, days: int | None = None) -> dict[str, Any]:
    """`load`'s shape without the games: who has games in the window and when he was last read. A refresh only needs
    that to tell a new player from a known one, and it is a few kilobytes where `load` is megabytes from Neon."""
    query = select(PlayerGame.player, func.max(PlayerGame.read_at)).group_by(PlayerGame.player)
    if days is not None:
        query = query.where(PlayerGame.date >= (now or datetime.now(UTC)) - timedelta(days=days))
    return {player: {"at": as_utc(at).isoformat() if at else "", "games": []} for player, at in db.execute(query)}


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


def save_record(db: Session, record: dict[str, Any], now: datetime, lineups: dict[str, Any] | None = None) -> int:
    """Keep week/position metadata with the same pre-lock boundary as the per-game statements."""
    lock = as_utc(datetime.fromisoformat(record["gameweek"]["lock"]))
    if now >= lock or as_utc(datetime.fromisoformat(record["writtenAt"])) >= lock:
        return 0
    count = save_statements(db, record, now, lineups)
    put(db, f"score_record:{record['gameweek']['slug']}", record, now)
    return count


def moved(db: Session, record: dict[str, Any] | None, now: datetime) -> int:
    """Players whose known Sorare projection changed while their week was still open."""
    if not record or now >= as_utc(datetime.fromisoformat(record["gameweek"]["lock"])):
        return 0
    previous = {
        (player, gid): value
        for player, gid, value in db.execute(
            select(PlayerGame.player, PlayerGame.game_id, PlayerGame.sorare_x).where(PlayerGame.sorare_x.isnot(None))
        )
    }
    return sum(
        any(
            game.get("sorare") is not None
            and (was := previous.get((player, game["id"]))) is not None
            and abs(game["sorare"] - was) > 0.5
            for game in entry.get("games") or []
        )
        for player, entry in (record.get("players") or {}).items()
    )


def summary(db: Session) -> dict[str, int]:
    """Projection status from the common store, without replaying or fetching any games."""
    rows, projections, scored = db.execute(
        select(func.count(), func.count(PlayerGame.sorare_x), func.count(PlayerGame.score)).where(
            PlayerGame.said_at.isnot(None)
        )
    ).one()
    weeks = db.scalar(select(func.count()).select_from(ReadModel).where(ReadModel.key.like("score_record:%")))
    return {"gameweeks": weeks or 0, "rows": rows, "projections": projections, "scored": scored}
