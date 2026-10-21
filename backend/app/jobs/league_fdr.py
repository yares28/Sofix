"""Refresh one full foreign-league FDR block with bounded cached history reads."""

import argparse
import asyncio
import logging
from datetime import UTC, datetime
from functools import partial
from pathlib import Path

import httpx
import pandas as pd

from app.backtest.data import normalize_season
from app.config import settings
from app.db import SessionLocal
from app.models import ReadModel
from app.schemas import ApiResponse, FixtureGrid
from app.services.league_fdr import LEAGUES, build_league_grid
from app.services.publish import notify_app, put
from app.sources.football_data_co_uk import cached_path, fetch_season_csv
from app.sources.football_data_org import FootballDataOrg


def load_league_history(code: str, start: int) -> pd.DataFrame:
    division = LEAGUES[code][1]
    root = Path(settings.history_cache_dir)
    frames = []
    for year in range(start - 4, start + 1):
        try:
            raw = fetch_season_csv(year, root, division, refresh=year == start)
        except (httpx.HTTPError, OSError) as exc:
            if cached_path(year, root, division).exists():
                raw = fetch_season_csv(year, root, division, refresh=False)
            elif year == start and isinstance(exc, httpx.HTTPStatusError) and exc.response.status_code == 404:
                continue
            else:
                raise
        frames.append(normalize_season(raw, year))
    return pd.concat(frames, ignore_index=True)


def run(code: str) -> dict:
    # One full-season request per league, no per-fixture or paid odds requests.
    payload = asyncio.run(FootballDataOrg().matches(competition=code))
    starts = {m["season"]["startDate"][:4] for m in payload.get("matches", [])}
    if len(starts) != 1:
        raise ValueError("Expected one complete league season")
    history = load_league_history(code, int(next(iter(starts))))
    db = SessionLocal()
    try:
        key = f"grid:{code}"
        kept = db.get(ReadModel, key)
        previous = ApiResponse[FixtureGrid].model_validate(kept.payload) if kept else None
        body = build_league_grid(code, payload, history, datetime.now(UTC), previous)
        put(db, key, body.model_dump(mode="json"), datetime.now(UTC))
        return {
            "teams": len(body.data.teams),
            "fixtures": len(payload["matches"]),
            "model_version": body.data.model_version,
        }
    finally:
        db.close()


def bootstrap() -> int:
    """Publish missing blocks once; preserve the full refresh's three-hour push cooldown."""
    from app.jobs import refresh

    db = SessionLocal()
    try:
        present = {key for (key,) in db.query(ReadModel.key).filter(ReadModel.key.in_(["grid:PL", "grid:BL1"])).all()}
    finally:
        db.close()
    missing = [code for code in LEAGUES if f"grid:{code}" not in present]
    if not missing:
        logging.getLogger(__name__).info("league FDR bootstrap skipped: both blocks already exist")
        return 0
    steps = [("fdr_pl" if code == "PL" else "fdr_bl", partial(run, code)) for code in missing]
    steps.append(
        ("revalidate", lambda: notify_app(settings.app_url, settings.revalidate_secret, settings.vercel_bypass_secret))
    )
    # Reuse schema validation, the database writer lock and per-step failure records.
    return refresh.main(["--skip-migrations", "--trigger", "cli"], steps=steps)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Initialize missing PL/Bundesliga FDR blocks only")
    parser.add_argument("--bootstrap", action="store_true", required=True)
    parser.parse_args()
    raise SystemExit(bootstrap())
