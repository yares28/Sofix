"""Refresh run bookkeeping shared by the refresh job and the admin API.

Kept free of the pipeline's heavy imports (pandas, the model) so the API can use it.
"""

from __future__ import annotations

import logging
from datetime import datetime, timedelta

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models import RUNNING, RefreshRun
from app.services.timeutil import as_utc

logger = logging.getLogger(__name__)

STALE_AFTER = timedelta(minutes=15)
# football-data.org allows 10 requests/min; one refresh uses one. The cooldown also keeps Neon's
# compute budget safe from a button pressed repeatedly.
COOLDOWN = timedelta(minutes=10)
TRIGGERS = ("cli", "schedule", "button")


class RefreshAlreadyRunning(RuntimeError):
    pass


def release_stale_runs(db: Session, now: datetime) -> None:
    """Mark runs left 'running' by a crashed process as abandoned, so they stop holding the lock."""
    for stale in db.query(RefreshRun).filter(RefreshRun.status == RUNNING).all():
        if now - as_utc(stale.started_at) > STALE_AFTER:
            logger.warning("releasing stale refresh run %d started %s", stale.id, as_utc(stale.started_at))
            stale.status = "abandoned"
            stale.finished_at = now
            stale.error = "stale lock released"
    db.commit()


def start_run(db: Session, trigger: str, now: datetime) -> RefreshRun:
    """Take the lock by inserting a running row; release locks left behind by crashed runs first."""
    release_stale_runs(db, now)
    run = RefreshRun(trigger=trigger, status=RUNNING, started_at=now, details={})
    db.add(run)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise RefreshAlreadyRunning("another refresh is already running") from exc
    return run


def latest_run(db: Session) -> RefreshRun | None:
    return db.query(RefreshRun).order_by(RefreshRun.started_at.desc(), RefreshRun.id.desc()).first()


def active_run(db: Session) -> RefreshRun | None:
    return db.query(RefreshRun).filter(RefreshRun.status == RUNNING).first()


def cooldown_remaining(run: RefreshRun | None, now: datetime) -> timedelta:
    """Time left before another refresh may start (counted from the last run's start, whatever its outcome)."""
    if run is None:
        return timedelta(0)
    return max(timedelta(0), as_utc(run.started_at) + COOLDOWN - now)


def finish_run(db: Session, run: RefreshRun, all_ok: bool, now: datetime, error: str | None = None) -> None:
    run.status = "succeeded" if all_ok else "failed"
    run.step = None
    run.finished_at = now
    failed = [name for name, info in (run.details or {}).items() if info.get("status") == "failed"]
    run.error = error or (f"failed steps: {', '.join(failed)}" if failed else None)
    db.commit()
