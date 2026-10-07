"""Read every LaLiga player's past games once a day (the `league-history` workflow, owner's ask of 6 Oct 2026).

    python -m app.jobs.league_history

The refresh reads your players' games in full every run; this keeps everyone else's in `sorare_league_history`, so each
player's form (Sofix's start chance, his xScore) has his latest game. The players are the last refresh's LaLiga list
(`market` in the `sorare` read model). About 620 queries, paced by the client: four or five minutes with the API key.
"""

from __future__ import annotations

import logging
import sys
from datetime import UTC, datetime
from typing import Any

from sqlalchemy.orm import Session

from app.db import SessionLocal
from app.jobs.sorare import LEAGUE_HISTORY_KEY, LEAGUE_STATUS_KEY, SORARE_KEY, cached_league
from app.logging_config import configure_logging
from app.models import ReadModel
from app.services.publish import put
from app.sorare.client import SorareClient
from app.sorare.sync import league_history

logger = logging.getLogger(__name__)


def run(db: Session, client: SorareClient, now: datetime) -> dict[str, Any]:
    row = db.get(ReadModel, SORARE_KEY)
    market = (row.payload.get("market") if row and isinstance(row.payload, dict) else None) or []
    slugs = [entry["slug"] for entry in market if entry.get("slug")]
    if not slugs:
        return {"players": 0, "read": 0, "at": now.isoformat()}
    league = league_history(client, slugs, cached_league(db), now, lambda out: put(db, LEAGUE_HISTORY_KEY, out, now))
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
