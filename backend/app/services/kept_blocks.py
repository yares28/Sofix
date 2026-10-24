"""Page blocks the jobs read again and again, kept so Neon sends only the ones rewritten since (owner's ask, 20 Oct 2026).

Every refresh read all 102 `missions_day:*` rows (6.3 MB) three times: mission capture, mission settling and the Audit,
while only today's change. `rows` asks Neon for the write times only, fetches the payloads whose time moved, and keeps the
rest in memory and, in the GitHub jobs, in the cached SQLite file of `games_mirror` (PLAYER_GAMES_MIRROR). Postgres only:
elsewhere (tests, local SQLite) it simply reads the rows.
"""

from __future__ import annotations

import json
import os
from collections.abc import Callable
from concurrent.futures import ThreadPoolExecutor
from copy import deepcopy
from dataclasses import dataclass
from datetime import datetime
from typing import Any

from sqlalchemy import or_, select, text
from sqlalchemy.orm import Session
from sqlalchemy.sql.elements import ColumnElement

from app.models import ReadModel
from app.services import r2
from app.sorare import games_mirror


@dataclass
class Row:
    key: str
    payload: Any
    updated_at: datetime


_kept: dict[str, tuple[str, Any]] | None = None  # key: (write time, payload)


def _file() -> str:
    return os.environ.get("PLAYER_GAMES_MIRROR", "")


def _load() -> dict[str, tuple[str, Any]]:
    global _kept
    if _kept is None:
        _kept = {}
        if _file():
            with games_mirror._engine(_file()).connect() as conn:
                for key, stamp, payload in conn.execute(text("SELECT key, stamp, payload FROM kept_blocks")):
                    _kept[key] = (stamp, json.loads(payload))
    return _kept


def _save(changed: dict[str, tuple[str, Any]], gone: list[str]) -> None:
    if not _file() or not (changed or gone):
        return
    with games_mirror._engine(_file()).begin() as conn:
        for key in [*changed, *gone]:
            conn.execute(text("DELETE FROM kept_blocks WHERE key = :key"), {"key": key})
        if changed:
            conn.execute(
                text("INSERT INTO kept_blocks (key, stamp, payload) VALUES (:key, :stamp, :payload)"),
                [{"key": k, "stamp": s, "payload": json.dumps(p)} for k, (s, p) in changed.items()],
            )


def rows(db: Session, *prefixes: str) -> list[Row]:
    """Every `read_models` row whose key starts with one of `prefixes`, each payload a fresh copy the caller may change."""
    where = or_(*(ReadModel.key.like(f"{prefix}%") for prefix in prefixes))
    return _rows(db, where, lambda key: key.startswith(prefixes))


def read(db: Session, key: str) -> Row | None:
    """One block, using the same versioned R2/disk path as bulk reads."""
    found = _rows(db, ReadModel.key == key, lambda candidate: candidate == key)
    return found[0] if found else None


def _rows(db: Session, where: ColumnElement[bool], includes: Callable[[str], bool]) -> list[Row]:
    if db.get_bind().dialect.name != "postgresql":
        rows = db.query(ReadModel).filter(where).populate_existing()  # what was just written, not the session's copy
        return [Row(r.key, r.payload, r.updated_at) for r in rows]
    stamps = dict(db.execute(select(ReadModel.key, ReadModel.updated_at).where(where)).tuples().all())
    kept = _load()
    stale = [k for k, at in stamps.items() if (kept.get(k) or ("",))[0] != at.isoformat()]
    changed: dict[str, tuple[str, Any]] = {}
    if stale and r2.configured():
        with ThreadPoolExecutor(max_workers=6) as pool:
            blocks = pool.map(lambda key: r2.get_block(key, stamps[key]), stale)
            for key, block in zip(stale, blocks, strict=True):
                if block is not None:
                    changed[key] = (stamps[key].isoformat(), block["payload"])
    stale = [key for key in stale if key not in changed]
    for offset in range(0, len(stale), 50):
        chunk = stale[offset : offset + 50]
        for key, payload in db.execute(select(ReadModel.key, ReadModel.payload).where(ReadModel.key.in_(chunk))):
            changed[key] = (stamps[key].isoformat(), payload)
    gone = [k for k in kept if includes(k) and k not in stamps]
    for key in gone:
        del kept[key]
    kept.update(changed)
    _save(changed, gone)
    return [Row(key, deepcopy(kept[key][1]), at) for key, at in stamps.items() if key in kept]
