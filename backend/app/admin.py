"""Owner-only endpoints, called by the Next.js server (never directly by the browser).

POST /api/admin/refresh         start a refresh: 202 · 409 while one runs · 429 during the cooldown
GET  /api/admin/refresh/latest  the most recent run, for polling

Every request needs `Authorization: Bearer <REFRESH_TOKEN>`. The refresh runs as a separate process
(`python -m app.jobs.refresh --trigger button`), so a crash or a slow model fit can't take the API down.
"""

from __future__ import annotations

import hmac
import logging
import math
import subprocess
import sys
from datetime import UTC, datetime
from typing import Any, Protocol

from fastapi import APIRouter, Depends, Header, HTTPException, Request
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session

from app.config import BACKEND_DIR
from app.db import get_db
from app.models import RUNNING, RefreshRun
from app.schemas import ApiResponse, RefreshRunOut, RefreshStatus
from app.services.refresh_runs import (
    STALE_AFTER,
    RefreshAlreadyRunning,
    active_run,
    cooldown_remaining,
    finish_run,
    latest_run,
    release_stale_runs,
    start_run,
)
from app.services.timeutil import as_utc

MIN_TOKEN_BYTES = 32
REFRESH_LOG = BACKEND_DIR / "reports" / "refresh-button.log"
logger = logging.getLogger("fixturediff.admin")


def require_refresh_token(request: Request, authorization: str | None = Header(default=None)) -> None:
    expected = request.app.state.settings.refresh_token.encode()
    if len(expected) < MIN_TOKEN_BYTES:
        raise HTTPException(503, "Refresh is not configured on the server.")
    scheme, _, supplied = (authorization or "").partition(" ")
    if scheme.lower() != "bearer" or not hmac.compare_digest(supplied.encode(), expected):
        raise HTTPException(401, "Not authorised.")


router = APIRouter(prefix="/api/admin", dependencies=[Depends(require_refresh_token)])


class Process(Protocol):
    def poll(self) -> int | None: ...


def launch_refresh(run_id: int) -> Process:
    """Start the refresh job detached from the API process; its output goes to reports/refresh-button.log."""
    REFRESH_LOG.parent.mkdir(parents=True, exist_ok=True)
    command = [
        sys.executable,
        "-m",
        "app.jobs.refresh",
        "--trigger",
        "button",
        "--skip-migrations",
        "--run-id",
        str(run_id),
    ]
    with REFRESH_LOG.open("ab") as log:
        if sys.platform == "win32":
            flags = subprocess.CREATE_NEW_PROCESS_GROUP | subprocess.DETACHED_PROCESS
            return subprocess.Popen(
                command, cwd=BACKEND_DIR, stdin=subprocess.DEVNULL, stdout=log, stderr=log, creationflags=flags
            )
        return subprocess.Popen(
            command, cwd=BACKEND_DIR, stdin=subprocess.DEVNULL, stdout=log, stderr=log, start_new_session=True
        )


def reap_dead_process(request: Request, db: Session, run: RefreshRun, now: datetime) -> None:
    """Fail a running run at once if the process this API started for it has exited without finishing it.

    Without this, a killed job would show as running until the 15-minute stale lock is released.
    """
    process = request.app.state.refresh_processes.get(run.id)
    if process is None or run.status != RUNNING:
        return
    code = process.poll()
    if code is None:
        return
    request.app.state.refresh_processes.pop(run.id, None)
    db.refresh(run)  # the job may have finished the run just before exiting
    if run.status == RUNNING:
        logger.error("refresh process for run %d exited with code %s without finishing", run.id, code)
        finish_run(db, run, False, now, error=f"refresh process exited unexpectedly (code {code})")


def run_out(run: RefreshRun) -> RefreshRunOut:
    steps = {name: info["status"] for name, info in (run.details or {}).items() if info.get("status")}
    return RefreshRunOut(
        id=run.id,
        trigger=run.trigger,
        status=run.status,  # type: ignore[arg-type]  # validated by pydantic
        step=run.step,
        started_at=as_utc(run.started_at),
        finished_at=as_utc(run.finished_at) if run.finished_at else None,
        error=run.error,
        steps=steps,
    )


def status_of(run: RefreshRun | None, now: datetime) -> RefreshStatus:
    return RefreshStatus(
        run=run_out(run) if run else None,
        retry_after=math.ceil(cooldown_remaining(run, now).total_seconds()),
    )


def respond(status_code: int, data: RefreshStatus, error: str | None = None) -> JSONResponse:
    body = ApiResponse[RefreshStatus](success=error is None, data=data, error=error).model_dump(mode="json")
    headers: dict[str, Any] = {"Cache-Control": "no-store"}
    if status_code == 429:
        headers["Retry-After"] = str(data.retry_after)
    return JSONResponse(status_code=status_code, content=body, headers=headers)


@router.post("/refresh", status_code=202, response_model=ApiResponse[RefreshStatus])
def start_refresh(request: Request, db: Session = Depends(get_db)) -> JSONResponse:
    now = datetime.now(UTC)
    release_stale_runs(db, now)
    running = active_run(db)
    if running is not None:
        return respond(409, status_of(running, now), "A refresh is already running.")
    last = latest_run(db)
    if cooldown_remaining(last, now).total_seconds() > 0:
        return respond(429, status_of(last, now), "Refreshed recently. Try again later.")

    try:
        run = start_run(db, "button", now)
    except RefreshAlreadyRunning:  # lost a race with another run starting
        return respond(409, status_of(active_run(db), now), "A refresh is already running.")
    try:
        process = request.app.state.launch_refresh(run.id)
        if process is not None:
            request.app.state.refresh_processes[run.id] = process
    except OSError:
        logger.exception("could not start the refresh process")
        finish_run(db, run, False, datetime.now(UTC), error="could not start the refresh process")
        return respond(500, status_of(run, now), "Could not start the refresh.")
    logger.info("refresh run %d started from the button", run.id)
    return respond(202, status_of(run, now))


@router.get("/refresh/latest", response_model=ApiResponse[RefreshStatus])
def refresh_latest(request: Request, db: Session = Depends(get_db)) -> JSONResponse:
    now = datetime.now(UTC)
    run = latest_run(db)
    if run is not None and run.status == RUNNING:
        reap_dead_process(request, db, run, now)
        if run.status == RUNNING and now - as_utc(run.started_at) > STALE_AFTER:
            release_stale_runs(db, now)  # e.g. started by another API process that has since restarted
            db.refresh(run)
    return respond(200, status_of(run, now))
