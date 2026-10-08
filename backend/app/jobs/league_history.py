"""Read every LaLiga player's past games once a day (the `league-history` workflow, owner's ask of 6 Oct 2026).

    python -m app.jobs.league_history

Keeps every game in `player_games`, including the owner's players outside LaLiga. The first read starts at the season's
first gameweek; later reads ask for new games and three days of corrections. Calls are paced by the Sorare client.
"""

from __future__ import annotations

import logging
import sys
from datetime import UTC, datetime
from typing import Any

from sqlalchemy.orm import Session

from app.db import SessionLocal
from app.jobs.sorare import LEAGUE_STATUS_KEY, SORARE_KEY
from app.logging_config import configure_logging
from app.models import ReadModel
from app.services.publish import put
from app.sorare import player_games
from app.sorare.client import SorareClient
from app.sorare.sync import league_history

logger = logging.getLogger(__name__)


def run(db: Session, client: SorareClient, now: datetime) -> dict[str, Any]:
    row = db.get(ReadModel, SORARE_KEY)
    payload = row.payload if row and isinstance(row.payload, dict) else {}
    slugs = sorted(
        {entry["slug"] for entry in payload.get("market") or [] if entry.get("slug")}
        | {entry["player"] for entry in payload.get("collection") or [] if entry.get("player")}
    )
    if not slugs:
        return {"players": 0, "read": 0, "at": now.isoformat()}
    kept = player_games.load(db)
    weeks = payload.get("timeline") or []
    since = min(
        (datetime.fromisoformat(w["start"]) for w in weeks if w.get("start")), default=player_games.season_start(now)
    )
    db.rollback()  # do not hold a Neon connection while Sorare is being read
    league = league_history(
        client,
        slugs,
        kept,
        now,
        lambda out: player_games.save(db, {slug: entry["games"] for slug, entry in out.items()}, now),
        since=since,
    )
    status = {
        "players": len(slugs),
        "read": sum(1 for e in league.values() if e.get("at") == now.isoformat()),
        "at": now.isoformat(),
    }
    put(db, LEAGUE_STATUS_KEY, status, now)
    return status


def main(argv: list[str] | None = None) -> int:
    configure_logging()
    with SessionLocal() as db, SorareClient() as client:
        status = run(db, client, datetime.now(UTC))
    logger.info("league history: %(read)s of %(players)s players read", status)
    # Nobody read although there were players to read: Sorare refused the run, worth GitHub's failure email.
    return 1 if status["players"] and not status["read"] else 0


if __name__ == "__main__":  # pragma: no cover
    raise SystemExit(main(sys.argv[1:]))
