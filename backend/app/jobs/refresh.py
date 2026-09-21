"""Run the whole data pipeline in order, one run at a time.

    python -m app.jobs.refresh [--trigger cli|schedule|button] [--skip-migrations] [--run-id N]

0. database migrations (alembic upgrade head); if this fails nothing else runs.
   With --skip-migrations (scheduled and button runs, which use the app role and must never run
   DDL unattended) the schema is only checked, and a pending migration stops the run.
1. sync: fixtures + results from football-data.org (needs FOOTBALL_DATA_ORG_TOKEN)
2. odds: bookmaker odds from The Odds API (needs ODDS_API_KEY; skipped without it, throttled to 6 h)
3. predict: rating model predictions (football-data.co.uk history, no key; blends the odds above into
   the next week's fixtures)

Steps 1–3 are isolated: a failure is recorded and the next step still runs (predictions from the
data already in the database are better than none). Each run is stored in `refresh_runs`, which
also acts as the lock: a second run while one is active exits with code 2. --run-id adopts a run
row the API already inserted (and so already holds the lock for).

Exit codes: 0 all steps succeeded · 1 a step, the schema check or the migrations failed · 2 another run is active.
"""

from __future__ import annotations

import argparse
import asyncio
import logging
import time
from collections.abc import Callable, Sequence
from dataclasses import asdict, is_dataclass
from datetime import UTC, datetime
from typing import Any

from sqlalchemy.orm import Session, sessionmaker

from app.config import settings
from app.db import SessionLocal, database_target
from app.jobs import predict, seed_and_sync, sync_odds
from app.logging_config import configure_logging
from app.migrate import ensure_schema_current, upgrade_to_head
from app.models import RUNNING, RefreshRun
from app.services.refresh_runs import (
    STALE_AFTER,
    TRIGGERS,
    RefreshAlreadyRunning,
    finish_run,
    start_run,
)

__all__ = ["STALE_AFTER", "RefreshAlreadyRunning", "main", "run_steps", "summarize"]

logger = logging.getLogger(__name__)

Step = tuple[str, Callable[[], Any]]


def default_steps() -> list[Step]:
    return [
        ("sync", lambda: asyncio.run(seed_and_sync.main())),
        # Odds before predict: the next gameweek's predictions blend the prices, so they must be the
        # freshest ones. The odds call is throttled to 6 h either way, so this costs no extra credits.
        ("odds", lambda: asyncio.run(sync_odds.main())),
        ("predict", predict.main),
    ]


def summarize(result: Any) -> Any:
    """Make a step's return value storable as JSON."""
    if is_dataclass(result) and not isinstance(result, type):
        result = asdict(result)
    if isinstance(result, dict):
        return {key: sorted(value) if isinstance(value, set) else value for key, value in result.items()}
    return result


def run_steps(db: Session, run: RefreshRun, steps: Sequence[Step]) -> bool:
    """Run every step, recording each result. Returns True when all succeeded."""
    details: dict[str, Any] = {}
    all_ok = True
    for name, step in steps:
        run.step = name
        db.commit()
        logger.info("step %s: starting", name)
        started = time.perf_counter()
        try:
            result = step()
        except Exception as exc:  # isolate: record and carry on with the next step
            all_ok = False
            details[name] = {
                "status": "failed",
                "seconds": round(time.perf_counter() - started, 2),
                "error": f"{type(exc).__name__}: {str(exc)[:300]}",
            }
            logger.exception("step %s failed", name)
        else:
            details[name] = {
                "status": "succeeded",
                "seconds": round(time.perf_counter() - started, 2),
                "result": summarize(result),
            }
            logger.info("step %s: done in %.1fs", name, details[name]["seconds"])
        run.details = dict(details)  # new object so SQLAlchemy sees the change
        db.commit()
    return all_ok


def prepare_schema(skip_migrations: bool, migrate: Callable[[], None], check: Callable[[], None]) -> str | None:
    """Migrate (or only verify the schema); returns an error message, or None when ready."""
    try:
        if skip_migrations:
            check()
        else:
            migrate()
    except Exception as exc:
        logger.exception("schema %s failed; nothing else was run", "check" if skip_migrations else "migration")
        return f"{'schema check' if skip_migrations else 'migrations'} failed: {type(exc).__name__}: {str(exc)[:300]}"
    return None


def main(
    argv: Sequence[str] | None = None,
    session_factory: sessionmaker = SessionLocal,
    steps: Sequence[Step] | None = None,
    migrate: Callable[[], None] = upgrade_to_head,
    check_schema: Callable[[], None] | None = None,
) -> int:
    parser = argparse.ArgumentParser(description="Refresh fixtures, odds and predictions.")
    parser.add_argument("--trigger", choices=TRIGGERS, default="cli")
    parser.add_argument("--skip-migrations", action="store_true", help="only verify the schema is current")
    parser.add_argument("--run-id", type=int, help="adopt a running refresh_runs row created by the API")
    args = parser.parse_args(argv)

    configure_logging()
    logger.info("database: %s", database_target(settings.postgres_url))
    if settings.app_env == "prod" and settings.postgres_url.startswith("sqlite"):
        logger.error("APP_ENV=prod but POSTGRES_URL is not set (would write to a throwaway SQLite file)")
        return 1
    check = check_schema or (lambda: ensure_schema_current(settings.postgres_url))

    db = session_factory()
    try:
        if args.run_id is None:
            if prepare_schema(args.skip_migrations, migrate, check):
                return 1
            try:
                run = start_run(db, args.trigger, datetime.now(UTC))
            except RefreshAlreadyRunning:
                logger.warning("another refresh is already running; exiting")
                return 2
        else:
            adopted = db.get(RefreshRun, args.run_id)
            if adopted is None or adopted.status != RUNNING:
                logger.error("refresh run %s does not exist or is no longer running", args.run_id)
                return 1
            run = adopted
            error = prepare_schema(args.skip_migrations, migrate, check)
            if error:
                finish_run(db, run, False, datetime.now(UTC), error=error)
                return 1

        all_ok = False
        try:
            all_ok = run_steps(db, run, steps if steps is not None else default_steps())
        finally:
            finish_run(db, run, all_ok, datetime.now(UTC))
        logger.info("refresh %s (run %d)", run.status, run.id)
        return 0 if all_ok else 1
    finally:
        db.close()


if __name__ == "__main__":
    raise SystemExit(main())
