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
from app.sorare import projection
from app.sorare import publish as sorare_publish
from app.sorare import record as sorare_record
from app.sorare import sync as sorare_sync
from app.sorare.client import SorareClient
from app.sources import understat

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
    # A finished gameweek's replay never changes once its scores are final: keep it, and fetch nothing for it.
    kept = sorare_publish.settled_replay(previous)
    replayed = kept["gameweek"]["slug"] if kept else None
    # Sorare and the planner take a few minutes; Neon closes a connection that sits inside an open
    # transaction, so the session is let go here and picked up again to write the result.
    db.rollback()
    with SorareClient() as client:
        snapshot = sorare_sync.snapshot(
            client, user or settings.sorare_user, started, cached_references=references, replayed=replayed
        )
    # Understat's xG for the midfielders and forwards, for the leagues the owner has players in: one request each, and a
    # league that cannot be read is left out, so its players simply show no xG.
    leagues = sorted(
        {
            slug
            for row in snapshot["cards"]
            if (slug := ((row["player"].get("activeClub") or {}).get("domesticLeague") or {}).get("slug"))
        }
    )
    snapshot["understat"] = understat.fetch_leagues(leagues, understat.season_of(started.date()))
    # Every LaLiga round Sorare has not opened a gameweek for is planned early, from the calendar the app already holds.
    fetched = datetime.fromisoformat(snapshot["fetchedAt"])
    early = sorare_publish.projected_weeks(
        snapshot, projection.unopened(projection.calendar(db, fetched), snapshot["gameweeks"], now=fetched), runs=runs
    )
    payload = sorare_publish.build_payload(
        snapshot, runs=runs, previous=previous, projected=sorare_publish.projected_heads(early)
    )
    size = len(json.dumps(payload, separators=(",", ":")))
    planned_week = sorare_publish.week_of(payload) or {}
    summary = {
        "gameweek": planned_week.get("gameweek", {}).get("number"),
        "state": planned_week.get("state"),
        "plans": len(planned_week.get("plans", [])),
        "playing": planned_week.get("playing", {}).get("cards"),
        "xg": sum(1 for p in planned_week.get("playing", {}).get("players", []) if "xg" in p),
        "playable": len(planned_week.get("playable", [])),
        "weeks": [w["gameweek"]["number"] for w in payload.get("weeks", [])],
        "projected": [w["projected"]["round"] for w in early],
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
    # Each early plan is a page of its own, read only when that week is opened; it is written again every run because it
    # follows the numbers.
    for week in early:
        put(db, f"{sorare_publish.AHEAD_PREFIX}{week['projected']['round']}", week, now)
    # The week just played, once final, is also kept whole on its own so it can be opened long after it leaves the page.
    archived = sorare_publish.archive_of(payload)
    if archived and db.get(ReadModel, archived[0]) is None:
        put(db, archived[0], archived[1], now)
        summary["archived"] = archived[0]
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
