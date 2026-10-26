"""Publish the finished page data for the web app, then ask the app to reload it.

Production has no Python server: the refresh job writes each page's data into `read_models` and the Next.js
app on Vercel reads those rows straight from Neon. Pages are cached, so after writing the job pings the app's
revalidate route; without that ping the app still picks the data up within its one-hour cache.
"""

from __future__ import annotations

import json
import logging
import os
from datetime import UTC, datetime
from typing import Any

import httpx
from sqlalchemy import Text, cast, text, update
from sqlalchemy.orm import Session

from app.models import ReadModel, RefreshRun
from app.schemas import ApiResponse, FixtureGrid
from app.services import all_competitions, data_health, player_blocks, r2
from app.services.fixture_grid import build_fixture_grid, grid_meta
from app.services.kept_matches import match_audit

logger = logging.getLogger(__name__)

GRID_KEY = "grid"
SYSTEM_KEY = "system"
# Neon Free: 0.5 GB per project. Shown in the app's Control Center next to the size in use.
NEON_FREE_BYTES = 512 * 1024 * 1024


def put(db: Session, key: str, payload: dict[str, Any], now: datetime) -> None:
    """Replace one payload without reading the old one first: Neon counts every byte it sends (5 GB a month).

    An unchanged payload keeps its row and write time, compared inside the database: the web app keys its cache on the
    write time, so a rewrite of the same content would make every page download it again.
    """
    replaced = db.execute(
        update(ReadModel)
        .where(ReadModel.key == key, cast(ReadModel.payload, Text) != json.dumps(payload))
        .values(payload=payload, updated_at=now)
    )
    written = bool(replaced.rowcount)  # type: ignore[attr-defined]
    if not written and db.query(ReadModel.key).filter(ReadModel.key == key).first() is None:
        db.add(ReadModel(key=key, payload=payload, updated_at=now))
        written = True
    db.commit()
    if written:  # the web app reads it from R2 (free to send), Neon being the fallback
        r2.put_block(key, payload, now)


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
    # Football results remain publishable even when the Sorare read fails.
    audit = db.get(ReadModel, "audit")
    if audit is not None:
        put(db, "audit", {**audit.payload, "matches": match_audit(db, now)}, audit.updated_at)
    data_health.publish(db, now)
    return {"grid": publish_grid(db, now), "all": all_competitions.publish(db, now), "system": publish_system(db, now)}


def publish_to_r2() -> dict[str, Any]:
    """A job's last step, before the app reloads: R2 holds every block's newest version, the players' game histories and
    the recent runs, so pages never read Neon (plans/neon-write-mostly.md). Never fails the job."""
    if not r2.configured():
        return {}
    from app.db import SessionLocal
    from app.sorare import games_mirror

    out: dict[str, Any] = {}
    try:
        with SessionLocal() as db:
            out["sync"] = r2.sync(db)
            out["runs"] = r2.put_block(
                player_blocks.RUNS_KEY,
                {"runs": player_blocks.recent_runs(db), "latest": player_blocks.latest_run(db)},
                datetime.now(UTC),
            )
            if os.environ.get("PLAYER_GAMES_MIRROR"):  # without the copy, the histories would come from Neon in full
                out["players"] = player_blocks.publish(db, games_mirror.view(db))
    except Exception as error:  # noqa: BLE001 - the pages keep the versions R2 already has
        logger.warning("R2 publish failed: %s", type(error).__name__)
    logger.info("R2 publish: %s", out)
    return out


def notify_app(app_url: str, secret: str, bypass: str = "", client: httpx.Client | None = None) -> str:
    """Bring R2 up to date, then ask the web app to drop its cached pages. Never logs the URL's secrets (headers)."""
    publish_to_r2()
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
