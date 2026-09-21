"""Publish the finished page data for the web app, then ask the app to reload it.

Production has no Python server: the refresh job writes each page's data into `read_models` and the Next.js
app on Vercel reads those rows straight from Neon. Pages are cached, so after writing the job pings the app's
revalidate route; without that ping the app still picks the data up within its one-hour cache.
"""

from __future__ import annotations

import json
import logging
from datetime import UTC, datetime
from typing import Any

import httpx
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.models import ReadModel, RefreshRun
from app.schemas import ApiResponse, FixtureGrid
from app.services.fixture_grid import build_fixture_grid, grid_meta

logger = logging.getLogger(__name__)

GRID_KEY = "grid"
SYSTEM_KEY = "system"
# Neon Free: 0.5 GB per project. Shown in the app's Control Center next to the size in use.
NEON_FREE_BYTES = 512 * 1024 * 1024


def put(db: Session, key: str, payload: dict[str, Any], now: datetime) -> None:
    row = db.get(ReadModel, key)
    if row is None:
        db.add(ReadModel(key=key, payload=payload, updated_at=now))
    else:
        row.payload = payload
        row.updated_at = now
    db.commit()


def publish_grid(db: Session, now: datetime | None = None) -> dict[str, int]:
    """Store the board exactly as GET /api/fixture-grid would answer it (same envelope, same schema)."""
    grid = build_fixture_grid(db)
    if grid is None:
        body = ApiResponse[FixtureGrid](success=False, error="No fixtures yet.")
    else:
        body = ApiResponse[FixtureGrid](success=True, data=grid, meta=grid_meta(db))
    payload = body.model_dump(mode="json")
    put(db, GRID_KEY, payload, now or datetime.now(UTC))
    return {"teams": len(grid.teams) if grid else 0, "bytes": len(json.dumps(payload, separators=(",", ":")))}


def latest_odds_credits(db: Session) -> tuple[int | None, str | None]:
    """The Odds API reports the credits left on each call; the odds step records them when it fetched."""
    runs = db.query(RefreshRun).order_by(RefreshRun.id.desc()).limit(40).all()
    for run in runs:
        result = ((run.details or {}).get("odds") or {}).get("result") or {}
        credits = result.get("credits_remaining")
        if isinstance(credits, int | float):
            return int(credits), run.started_at.isoformat() if run.started_at else None
    return None, None


def database_bytes(db: Session) -> int | None:
    if db.get_bind().dialect.name != "postgresql":
        return None
    return int(db.execute(text("SELECT pg_database_size(current_database())")).scalar_one())


def publish_system(db: Session, now: datetime | None = None) -> dict[str, Any]:
    """Numbers for the Control Center's free-limit gauges that the app can't read cheaply itself."""
    credits, credits_at = latest_odds_credits(db)
    payload = {
        "odds_credits_remaining": credits,
        "odds_credits_at": credits_at,
        "database_bytes": database_bytes(db),
        "database_limit_bytes": NEON_FREE_BYTES,
    }
    put(db, SYSTEM_KEY, payload, now or datetime.now(UTC))
    return payload


def publish_all(db: Session) -> dict[str, Any]:
    now = datetime.now(UTC)
    return {"grid": publish_grid(db, now), "system": publish_system(db, now)}


def notify_app(app_url: str, secret: str, bypass: str = "", client: httpx.Client | None = None) -> str:
    """Ask the web app to drop its cached pages. Never logs the URL's secrets (they travel in headers)."""
    if not app_url or not secret:
        return "skipped: APP_URL or REVALIDATE_SECRET is not set"
    headers = {"Authorization": f"Bearer {secret}"}
    if bypass:
        headers["x-vercel-protection-bypass"] = bypass
    owns_client = client is None
    http = client or httpx.Client(timeout=15)
    try:
        response = http.post(f"{app_url.rstrip('/')}/api/revalidate", headers=headers)
        return f"HTTP {response.status_code}"
    except httpx.HTTPError as exc:
        logger.warning("revalidate call failed: %s", type(exc).__name__)
        return f"failed: {type(exc).__name__}"
    finally:
        if owns_client:
            http.close()
