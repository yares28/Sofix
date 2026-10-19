"""A local SQLite copy of `player_games` for the GitHub jobs, kept between runs in GitHub's cache (owner's ask, 20 Oct 2026).

Neon's free plan sends 5 GB a month and each refresh read ~28 MB of game history. With PLAYER_GAMES_MIRROR set (the
workflows point it at a cached file), every history read first asks Neon for one fingerprint per player (~55 kB), fetches
only the players whose rows changed, and then reads the copy. A missing or broken file is rebuilt from Neon in full.
Unset (local runs, tests), reads go to the database as before.
"""

from __future__ import annotations

import logging
import os
from functools import cache

from sqlalchemy import create_engine, delete, select, text
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session

from app.models import PlayerGame

logger = logging.getLogger(__name__)

# One md5 per player over his rows exactly as stored (every column), so any change to any of his games shows.
_FINGERPRINTS = text(
    "SELECT player, md5(string_agg(t::text, '|' ORDER BY game_id)) FROM player_games AS t GROUP BY player"
)
_TABLE = PlayerGame.metadata.tables["player_games"]
_COLUMNS = [c.name for c in _TABLE.columns]


@cache
def _engine(path: str) -> Engine:
    os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
    engine = create_engine(f"sqlite:///{path}")
    try:
        _TABLE.create(engine, checkfirst=True)
        with engine.begin() as conn:
            conn.execute(text("CREATE TABLE IF NOT EXISTS fingerprints (player TEXT PRIMARY KEY, hash TEXT NOT NULL)"))
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


def sync(db: Session, local: Session) -> int:
    """Bring the copy level with Neon; returns how many players were fetched again."""
    remote = dict(db.execute(_FINGERPRINTS).tuples().all())
    kept = dict(local.execute(text("SELECT player, hash FROM fingerprints")).tuples().all())
    changed = [p for p, h in remote.items() if kept.get(p) != h]
    gone = [p for p in kept if p not in remote]
    for offset in range(0, len(changed), 200):
        batch = changed[offset : offset + 200]
        rows = db.execute(select(*_TABLE.columns).where(PlayerGame.player.in_(batch))).mappings().all()
        local.execute(delete(PlayerGame).where(PlayerGame.player.in_(batch)))
        if rows:
            local.execute(_TABLE.insert(), [{c: row[c] for c in _COLUMNS} for row in rows])
    if changed or gone:
        local.execute(delete(PlayerGame).where(PlayerGame.player.in_(gone)))
        local.execute(text("DELETE FROM fingerprints"))
        local.execute(
            text("INSERT INTO fingerprints (player, hash) VALUES (:player, :hash)"),
            [{"player": p, "hash": h} for p, h in remote.items()],
        )
        local.commit()
    logger.info("games mirror: %d players fetched again, %d removed, %d kept", len(changed), len(gone), len(kept))
    return len(changed)
