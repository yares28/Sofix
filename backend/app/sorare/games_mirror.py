"""A local SQLite copy of `player_games` for the GitHub jobs, kept between runs in GitHub's cache (owner's ask, 20 Oct 2026).

Neon's free plan sends 5 GB a month and each refresh read ~28 MB of game history. With PLAYER_GAMES_MIRROR set (the
workflows point it at a cached file), every history read first asks Neon for one fingerprint per player (~55 kB); for the
players that changed, one per game; then it fetches only the games that changed and reads the copy. A missing or broken
file is rebuilt from Neon in full. Unset (local runs, tests), reads go to the database as before.
"""

from __future__ import annotations

import logging
import os
from functools import cache

from sqlalchemy import bindparam, create_engine, delete, select, text, tuple_
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session

from app.models import PlayerGame

logger = logging.getLogger(__name__)

# md5s over the rows exactly as stored (every column), so any change to any game shows: per player, then per game.
_PLAYER_PRINTS = text(
    "SELECT player, md5(string_agg(t::text, '|' ORDER BY game_id)) FROM player_games AS t GROUP BY player"
)
_GAME_PRINTS = text("SELECT player, game_id, md5(t::text) FROM player_games AS t WHERE player IN :players").bindparams(
    bindparam("players", expanding=True)
)
_TABLE = PlayerGame.metadata.tables["player_games"]
_COLUMNS = [c.name for c in _TABLE.columns]
_KEY = tuple_(PlayerGame.player, PlayerGame.game_id)


@cache
def _engine(path: str) -> Engine:
    os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
    engine = create_engine(f"sqlite:///{path}")
    try:
        _TABLE.create(engine, checkfirst=True)
        with engine.begin() as conn:
            conn.execute(text("CREATE TABLE IF NOT EXISTS fingerprints (player TEXT PRIMARY KEY, hash TEXT NOT NULL)"))
            conn.execute(
                text(
                    "CREATE TABLE IF NOT EXISTS game_prints"
                    " (player TEXT, game_id TEXT, hash TEXT NOT NULL, PRIMARY KEY (player, game_id))"
                )
            )
            # Page blocks the jobs re-read (app/services/kept_blocks.py), in the same cached file.
            conn.execute(
                text("CREATE TABLE IF NOT EXISTS kept_blocks (key TEXT PRIMARY KEY, stamp TEXT, payload TEXT)")
            )
            conn.execute(text("SELECT count(*) FROM player_games")).scalar()
    except Exception:  # a broken cached file: start again from an empty one
        logger.warning("games mirror unreadable, rebuilding it from Neon")
        engine.dispose()
        os.remove(path)
        return _engine.__wrapped__(path)
    return engine


def view(db: Session) -> Session:
    """`db` itself, or with PLAYER_GAMES_MIRROR on Postgres a session on the local copy, first brought up to date."""
    path = os.environ.get("PLAYER_GAMES_MIRROR", "")
    if not path or db.get_bind().dialect.name != "postgresql":
        return db
    local = Session(_engine(path))
    sync(db, local)
    return local


def _drop(local: Session, keys: list[tuple[str, str]]) -> None:
    for offset in range(0, len(keys), 300):
        chunk = keys[offset : offset + 300]
        local.execute(delete(PlayerGame).where(_KEY.in_(chunk)))
        local.execute(
            text("DELETE FROM game_prints WHERE player = :p AND game_id = :g"), [{"p": p, "g": g} for p, g in chunk]
        )


def sync(db: Session, local: Session) -> int:
    """Bring the copy level with Neon; returns how many games were fetched again."""
    remote = dict(db.execute(_PLAYER_PRINTS).tuples().all())
    kept = dict(local.execute(text("SELECT player, hash FROM fingerprints")).tuples().all())
    changed = [p for p, h in remote.items() if kept.get(p) != h]
    gone = [p for p in kept if p not in remote]
    fetched = 0
    for offset in range(0, len(changed), 500):
        players = changed[offset : offset + 500]
        theirs = {(p, g): h for p, g, h in db.execute(_GAME_PRINTS, {"players": players}).tuples()}
        ours = {
            (p, g): h
            for p, g, h in local.execute(
                text("SELECT player, game_id, hash FROM game_prints WHERE player IN :players").bindparams(
                    bindparam("players", expanding=True)
                ),
                {"players": players},
            ).tuples()
        }
        stale = [k for k, h in theirs.items() if ours.get(k) != h]
        _drop(local, stale + [k for k in ours if k not in theirs])
        for start in range(0, len(stale), 300):
            chunk = stale[start : start + 300]
            rows = db.execute(select(*_TABLE.columns).where(_KEY.in_(chunk))).mappings().all()
            if rows:
                local.execute(_TABLE.insert(), [{c: row[c] for c in _COLUMNS} for row in rows])
            local.execute(
                text("INSERT INTO game_prints (player, game_id, hash) VALUES (:p, :g, :h)"),
                [{"p": p, "g": g, "h": theirs[p, g]} for p, g in chunk],
            )
            fetched += len(rows)
    if changed or gone:
        local.execute(delete(PlayerGame).where(PlayerGame.player.in_(gone)))
        local.execute(
            text("DELETE FROM game_prints WHERE player IN :players").bindparams(bindparam("players", expanding=True)),
            {"players": gone},
        )
        local.execute(text("DELETE FROM fingerprints"))
        local.execute(
            text("INSERT INTO fingerprints (player, hash) VALUES (:player, :hash)"),
            [{"player": p, "hash": h} for p, h in remote.items()],
        )
        local.commit()
    logger.info(
        "games mirror: %d players changed, %d games fetched, %d players removed", len(changed), fetched, len(gone)
    )
    return fetched
