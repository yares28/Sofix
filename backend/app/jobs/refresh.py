"""Run the whole data pipeline in order, one run at a time.

    python -m app.jobs.refresh [--trigger cli|schedule|button]

0. database migrations (alembic upgrade head); if this fails nothing else runs
1. sync: fixtures + results from football-data.org (needs FOOTBALL_DATA_ORG_TOKEN)
2. predict: rating model predictions (football-data.co.uk history, no key)
3. weather: kickoff weather from Open-Meteo (no key)

Steps 1–3 are isolated: a failure is recorded and the next step still runs (predictions from the
data already in the database are better than none). Each run is stored in `refresh_runs`, which
also acts as the lock: a second run while one is active exits with code 2.

Exit codes: 0 all steps succeeded · 1 a step or the migrations failed · 2 another run is active.
"""

from __future__ import annotations

import argparse
import asyncio
import logging
import time
from collections.abc import Callable, Sequence
from dataclasses import asdict, is_dataclass
from datetime import UTC, datetime, timedelta
from typing import Any

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, sessionmaker

from app.config import settings
from app.db import SessionLocal, database_target
from app.jobs import predict, seed_and_sync, sync_weather
from app.logging_config import configure_logging
from app.migrate import upgrade_to_head
from app.models import RUNNING, RefreshRun
from app.services.timeutil import as_utc

logger = logging.getLogger(__name__)

STALE_AFTER = timedelta(minutes=15)
TRIGGERS = ("cli", "schedule", "button")
Step = tuple[str, Callable[[], Any]]


class RefreshAlreadyRunning(RuntimeError):
    pass


def default_steps() -> list[Step]:
    return [
        ("sync", lambda: asyncio.run(seed_and_sync.main())),
        ("predict", predict.main),
        ("weather", lambda: asyncio.run(sync_weather.main())),
    ]


def summarize(result: Any) -> Any:
    """Make a step's return value storable as JSON."""
    if is_dataclass(result) and not isinstance(result, type):
        result = asdict(result)
    if isinstance(result, dict):
        return {key: sorted(value) if isinstance(value, set) else value for key, value in result.items()}
    return result


def start_run(db: Session, trigger: str, now: datetime) -> RefreshRun:
    """Take the lock by inserting a running row; release locks left behind by crashed runs first."""
    for stale in db.query(RefreshRun).filter(RefreshRun.status == RUNNING).all():
        if now - as_utc(stale.started_at) > STALE_AFTER:
            logger.warning("releasing stale refresh run %d started %s", stale.id, as_utc(stale.started_at))
            stale.status = "abandoned"
            stale.finished_at = now
            stale.error = "stale lock released"
    db.commit()

    run = RefreshRun(trigger=trigger, status=RUNNING, started_at=now, details={})
    db.add(run)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise RefreshAlreadyRunning("another refresh is already running") from exc
    return run


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


def finish_run(db: Session, run: RefreshRun, all_ok: bool, now: datetime) -> None:
    run.status = "succeeded" if all_ok else "failed"
    run.step = None
    run.finished_at = now
    failed = [name for name, info in (run.details or {}).items() if info.get("status") == "failed"]
    run.error = f"failed steps: {', '.join(failed)}" if failed else None
    db.commit()


def main(
    argv: Sequence[str] | None = None,
    session_factory: sessionmaker = SessionLocal,
    steps: Sequence[Step] | None = None,
    migrate: Callable[[], None] = upgrade_to_head,
) -> int:
    parser = argparse.ArgumentParser(description="Refresh fixtures, predictions and weather.")
    parser.add_argument("--trigger", choices=TRIGGERS, default="cli")
    args = parser.parse_args(argv)

    configure_logging()
    logger.info("database: %s", database_target(settings.postgres_url))
    if settings.app_env == "prod" and settings.postgres_url.startswith("sqlite"):
        logger.error("APP_ENV=prod but POSTGRES_URL is not set (would write to a throwaway SQLite file)")
        return 1

    try:
        migrate()
    except Exception:
        logger.exception("migrations failed; nothing else was run")
        return 1

    db = session_factory()
    try:
        try:
            run = start_run(db, args.trigger, datetime.now(UTC))
        except RefreshAlreadyRunning:
            logger.warning("another refresh is already running; exiting")
            return 2
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
