"""Sync Sorare and publish the finished Play page into `read_models`.

    python -m app.jobs.sorare [--user yares] [--runs 30] [--dry-run]

Read-only against Sorare (the API key only raises the rate limit), then the whole gameweek is planned here and
stored as one payload the web app renders as it is. The scores that paid in past gameweeks are kept in
`read_models` between runs, so a run only fetches what it doesn't already know.

Without SORARE_API_KEY the step is skipped, exactly like the odds step without its key.
"""

from __future__ import annotations

import argparse
import json
import logging
import os
from datetime import UTC, datetime
from typing import Any

from sqlalchemy.orm import Session

from app.config import settings
from app.db import SessionLocal
from app.logging_config import configure_logging
from app.models import ReadModel
from app.services.publish import notify_app, put
from app.sorare import publish as sorare_publish
from app.sorare import record as sorare_record
from app.sorare import sync as sorare_sync
from app.sorare.client import SorareClient

logger = logging.getLogger(__name__)

SORARE_KEY = "sorare"
REFERENCES_KEY = "sorare_references"


def cached_references(db: Session) -> dict[str, Any]:
    row = db.get(ReadModel, REFERENCES_KEY)
    return dict(row.payload) if row and isinstance(row.payload, dict) else {}


def published(db: Session) -> dict[str, Any]:
    """What the app is showing now: its replay of the last gameweek can be kept instead of rebuilt."""
    row = db.get(ReadModel, SORARE_KEY)
    return dict(row.payload) if row and isinstance(row.payload, dict) else {}


def run(
    db: Session, user: str | None = None, runs: int = 30, dry_run: bool = False, standalone: bool = False
) -> dict[str, Any]:
    if not settings.sorare_api_key:
        logger.info("sorare: no API key, step skipped")
        return {"skipped": "no SORARE_API_KEY"}
    started = datetime.now(UTC)
    references = cached_references(db)
    previous = published(db)
    last = previous.get("last") or {}
    kept = last.get("played") and previous.get("version") == sorare_publish.PAYLOAD_VERSION
    replayed = (last.get("gameweek") or {}).get("slug") if kept else None
    # Sorare and the planner take a few minutes; Neon closes a connection that sits inside an open
    # transaction, so the session is let go here and picked up again to write the result.
    db.rollback()
    with SorareClient() as client:
        snapshot = sorare_sync.snapshot(
            client, user or settings.sorare_user, started, cached_references=references, replayed=replayed
        )
    payload = sorare_publish.build_payload(snapshot, runs=runs, previous=previous)
    size = len(json.dumps(payload, separators=(",", ":")))
    planned_week = sorare_publish.week_of(payload) or {}
    summary = {
        "gameweek": planned_week.get("gameweek", {}).get("number"),
        "state": planned_week.get("state"),
        "plans": len(planned_week.get("plans", [])),
        "playing": planned_week.get("playing", {}).get("cards"),
        "playable": len(planned_week.get("playable", [])),
        "weeks": [w["gameweek"]["number"] for w in payload.get("weeks", [])],
        "calls": snapshot["calls"],
        "bytes": size,
        "seconds": round((datetime.now(UTC) - started).total_seconds()),
    }
    if dry_run:
        logger.info("sorare (dry run): %s", summary)
        return {**summary, "dryRun": True}
    now = datetime.now(UTC)
    # Sorare's projections only exist for a player's next game, so they are written down before they are lost.
    planned = sorare_record.rows(snapshot, "plan")
    summary["moved"] = sorare_record.moved(db, planned)
    summary["kept"] = sorare_record.save(db, planned, now)
    sorare_record.save(db, sorare_record.rows(snapshot, "past"), now, final=True)
    payload = sorare_publish.with_status(
        payload,
        where="cloud" if os.environ.get("GITHUB_ACTIONS") == "true" else "pc",
        moved=summary["moved"],
        kept=sorare_record.summary(db),
        previous=previous,
    )
    put(db, SORARE_KEY, payload, now)
    put(db, REFERENCES_KEY, snapshot["references"], now)
    if standalone:
        # run by hand: ask the app to reload its cached pages, the way the refresh job does at the end
        summary["revalidate"] = notify_app(settings.app_url, settings.revalidate_secret, settings.vercel_bypass_secret)
    logger.info("sorare: %s", summary)
    return summary


def main(argv: list[str] | None = None) -> int:
    configure_logging()
    parser = argparse.ArgumentParser(description="Sync Sorare and publish the Play page data.")
    parser.add_argument("--user", default=None, help="the Sorare manager to plan for (default: SORARE_USER)")
    parser.add_argument("--runs", type=int, default=30, help="how many plan searches to run (more = steadier)")
    parser.add_argument("--dry-run", action="store_true", help="build everything but write nothing")
    args = parser.parse_args(argv)
    with SessionLocal() as db:
        result = run(db, args.user, args.runs, args.dry_run, standalone=True)
    print(json.dumps(result, indent=2))
    return 0 if "error" not in result else 1


if __name__ == "__main__":  # pragma: no cover
    raise SystemExit(main())
