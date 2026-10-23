"""Shared cached UEFA facts and reviewed cross-provider club identities."""

from __future__ import annotations

import json
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any

import httpx
import pandas as pd

from app.config import settings
from app.research.european_alignment import KICKOFF_LINKS
from app.research.european_cases import football_row, is_main, native_rows
from app.research.european_data import COMPETITIONS, fetch_inventory
from app.research.league_xscore_data import when

REGISTRY = Path(__file__).resolve().parents[2] / "artifacts/european_clubs.json"


def season_at(now: datetime) -> int:
    return now.year if now.month >= 7 else now.year - 1


def cache_root() -> Path:
    return Path(settings.history_cache_dir) / "uefa"


def current_clubs(code: str, season: int) -> dict[str, str]:
    raw = json.loads(REGISTRY.read_text(encoding="utf-8"))
    clubs = raw["clubs"].get(code)
    if raw["seasonStart"] != season or not clubs or len(clubs) != 36 or len(set(clubs.values())) != 36:
        raise ValueError("Current European club registry needs a source-verified yearly rollover")
    return clubs


def calendars(now: datetime, *, root: Path | None = None) -> dict[str, dict[int, list[dict[str, Any]]]]:
    folder = root or cache_root()
    start = season_at(now)
    out: dict[str, dict[int, list[dict[str, Any]]]] = {}
    with httpx.Client(timeout=45, headers={"User-Agent": "Sofix personal fixture board (read-only, cached)"}) as client:
        for code in COMPETITIONS:
            out[code] = {}
            for year in range(start - 2, start + 1):
                fetch_inventory(client, code, year, folder, now=now)
                out[code][year] = native_rows(folder, code, year)
    return out


def history(calendars: dict[str, dict[int, list[dict[str, Any]]]]) -> pd.DataFrame:
    rows = []
    for code, editions in calendars.items():
        for season, raw in editions.items():
            for game in raw:
                if not is_main(game) or game.get("status") != "FINISHED":
                    continue
                row = football_row(code, season, game)
                link = KICKOFF_LINKS.get((code, season, game["id"]))
                if link and (row["home"], row["away"], when(row["date"])) == (link[1], link[2], when(link[5])):
                    row["availableAt"] = max(when(row["availableAt"]), when(link[6]) + timedelta(days=2)).isoformat()
                rows.append(row)
    return pd.DataFrame(rows)
