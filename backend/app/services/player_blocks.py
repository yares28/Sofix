"""Blocks built from tables, for pages that read R2 alone (plans/neon-write-mostly.md "Pages read R2 only").

The player page and Play's scores read each player's games (`player_games`), and the Control Center the recent runs
(`refresh_runs`). Pages no longer ask Neon, so the jobs publish them to R2 only: one `player_games:<slug>` block per
player, read from the games copy in GitHub's cache (`games_mirror.view`, no game bytes from Neon), uploaded only when its
content changed (its md5 is R2's ETag), and `refresh_runs`, the last eight runs.
"""

from __future__ import annotations

import hashlib
import json
import logging
from collections import defaultdict
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import PlayerAbsence, PlayerGame, RefreshRun
from app.services import kept_blocks, r2
from app.services.timeutil import as_utc

logger = logging.getLogger(__name__)

PREFIX = "player_games:"
RUNS_KEY = "refresh_runs"
GAME_COLUMNS = (
    "game_id",
    "date",
    "competition",
    "home",
    "away",
    "status",
    "score",
    "played",
    "started",
    "mins",
    "yellow",
    "red",
    "sofix_x",
    "sorare_x",
    "ff_start",
    "read_at",
)
ABSENCE_COLUMNS = ("id", "kind", "cause", "first_seen", "last_seen", "back")
_EPOCH = datetime(1970, 1, 1, tzinfo=UTC)


def _value(value: Any) -> Any:
    return as_utc(value).isoformat() if isinstance(value, datetime) else value


def build(db: Session, games_db: Session | None = None) -> dict[str, dict[str, Any]]:
    """Every player's games (newest first, future ones too: the page hides a game until it starts) and absences."""
    games: dict[str, list[dict[str, Any]]] = defaultdict(list)
    columns = [getattr(PlayerGame, c) for c in GAME_COLUMNS]
    query = select(PlayerGame.player, *columns).order_by(PlayerGame.player, PlayerGame.date.desc(), PlayerGame.game_id)
    for player, *values in (games_db or db).execute(query).tuples():
        games[player].append({c: _value(v) for c, v in zip(GAME_COLUMNS, values, strict=True)})
    links_row = kept_blocks.read(db, "ff_links")
    links = (links_row.payload.get("links") or {}) if links_row and isinstance(links_row.payload, dict) else {}
    absences: dict[str, list[dict[str, Any]]] = defaultdict(list)
    rows = db.scalars(
        select(PlayerAbsence)
        .where(PlayerAbsence.player.isnot(None))
        .order_by(PlayerAbsence.first_seen.desc(), PlayerAbsence.id.desc())
    )
    for row in rows:
        profile = (links.get(row.player) or {}).get("slug")
        url = f"https://www.futbolfantasy.com/jugadores/{profile}" if profile else None
        absences[str(row.player)].append({**{c: _value(getattr(row, c)) for c in ABSENCE_COLUMNS}, "url": url})
    return {p: {"games": games.get(p, []), "absences": absences.get(p, [])} for p in sorted({*games, *absences})}


def body(payload: dict[str, Any]) -> bytes:
    """The block as stored, the same bytes for the same content (its write time is the newest time inside it)."""
    times = [g["read_at"] for g in payload["games"] if g["read_at"]] + [a["last_seen"] for a in payload["absences"]]
    at = max(times, default=_EPOCH.isoformat())
    return json.dumps({"updatedAt": at, "payload": payload}, separators=(",", ":"), sort_keys=True).encode()


def publish(db: Session, games_db: Session | None = None) -> dict[str, int]:
    """Upload each player's block whose content changed, and delete those of players no longer kept."""
    blocks = build(db, games_db)
    remote = r2.list_blocks(PREFIX)
    uploaded = deleted = 0
    for player, payload in blocks.items():
        data = body(payload)
        if remote.get(PREFIX + player, ("",))[0] != hashlib.md5(data).hexdigest() and r2.put_body(
            PREFIX + player, data
        ):
            uploaded += 1
    for key in remote:
        if key[len(PREFIX) :] not in blocks and r2.delete_block(key):
            deleted += 1
    return {"players": len(blocks), "uploaded": uploaded, "deleted": deleted}


def recent_runs(db: Session) -> list[dict[str, Any]]:
    """The last eight refresh runs, newest first, as the Control Center shows them."""
    runs = db.scalars(select(RefreshRun).order_by(RefreshRun.id.desc()).limit(8))
    return [
        {c: _value(getattr(run, c)) for c in ("id", "trigger", "status", "started_at", "finished_at")} for run in runs
    ]


def latest_run(db: Session) -> dict[str, Any] | None:
    """The newest run with its step, error and step results, for the refresh button once no run is going."""
    run = db.scalars(select(RefreshRun).order_by(RefreshRun.id.desc()).limit(1)).first()
    columns = ("id", "trigger", "status", "step", "started_at", "finished_at", "error", "details")
    return {c: _value(getattr(run, c)) for c in columns} if run else None
