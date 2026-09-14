"""Historical LaLiga matches in one tidy frame for model fitting and backtests."""

from __future__ import annotations

import logging
from collections.abc import Callable, Iterable
from datetime import date
from pathlib import Path

import httpx
import numpy as np
import pandas as pd

from app.sources.football_data_co_uk import cached_path, fetch_season_csv

logger = logging.getLogger(__name__)

MATCH_COLUMNS = ["season_start", "date", "home", "away", "hg", "ag", "hst", "ast", "odds_h", "odds_d", "odds_a"]
REQUIRED = ["Date", "HomeTeam", "AwayTeam", "FTHG", "FTAG"]
# Closing odds: Pinnacle first, market average second. Pre-closing columns are a last resort.
ODDS_PREFERENCE = [
    ("PSCH", "PSCD", "PSCA"),
    ("AvgCH", "AvgCD", "AvgCA"),
    ("PSH", "PSD", "PSA"),
    ("AvgH", "AvgD", "AvgA"),
]


def _numeric(df: pd.DataFrame, column: str) -> pd.Series:
    if column not in df.columns:
        return pd.Series(np.nan, index=df.index)
    return pd.to_numeric(df[column], errors="coerce")


def normalize_season(raw: pd.DataFrame, season_start: int) -> pd.DataFrame:
    missing = [c for c in REQUIRED if c not in raw.columns]
    if missing:
        raise ValueError(f"season {season_start}: missing columns {missing}")
    df = raw.dropna(subset=REQUIRED).copy()
    out = pd.DataFrame(
        {
            "season_start": season_start,
            "date": pd.to_datetime(df["Date"], dayfirst=True, format="mixed"),
            "home": df["HomeTeam"].astype(str).str.strip(),
            "away": df["AwayTeam"].astype(str).str.strip(),
            "hg": pd.to_numeric(df["FTHG"], errors="raise").astype(int),
            "ag": pd.to_numeric(df["FTAG"], errors="raise").astype(int),
            "hst": _numeric(df, "HST"),
            "ast": _numeric(df, "AST"),
        }
    )
    # Take all three prices from the first source that has a complete, valid set for the match,
    # so the margin is removed from one bookmaker's book rather than a mix.
    odds = pd.DataFrame(np.nan, index=df.index, columns=["odds_h", "odds_d", "odds_a"])
    for group in ODDS_PREFERENCE:
        candidate = pd.concat([_numeric(df, c) for c in group], axis=1).set_axis(odds.columns, axis=1)
        usable = candidate.notna().all(axis=1) & (candidate > 1).all(axis=1) & odds.isna().all(axis=1)
        odds.loc[usable] = candidate.loc[usable]
    out[["odds_h", "odds_d", "odds_a"]] = odds

    if (out["hg"] < 0).any() or (out["ag"] < 0).any():
        raise ValueError(f"season {season_start}: negative goals")
    if (out["home"] == out["away"]).any():
        raise ValueError(f"season {season_start}: team playing itself")
    return out.sort_values("date", kind="stable", ignore_index=True)[MATCH_COLUMNS]


def load_history(
    season_starts: Iterable[int],
    cache_dir: Path,
    refresh_latest: bool = False,
    fetch: Callable[..., pd.DataFrame] = fetch_season_csv,
) -> pd.DataFrame:
    """All requested seasons in one frame.

    Resilient to the calendar and the network: the newest season's CSV only appears around
    matchday 1 (a 404 before that means "no rows yet"), and a failed re-download falls back to
    the cached copy when there is one.
    """
    seasons = sorted(season_starts)
    frames = []
    for year in seasons:
        newest = year == seasons[-1]
        try:
            raw = fetch(year, cache_dir, refresh=refresh_latest and newest)
        except httpx.HTTPStatusError as exc:
            if exc.response.status_code == 404 and newest:
                logger.info("no football-data.co.uk CSV for %d/%02d yet; using earlier seasons", year, (year + 1) % 100)
                continue
            raw = _cached_or_raise(year, cache_dir, exc, fetch)
        except httpx.TransportError as exc:
            raw = _cached_or_raise(year, cache_dir, exc, fetch)
        frames.append(normalize_season(raw, year))
    if not frames:
        raise RuntimeError(f"no match history available for seasons {seasons}")
    return pd.concat(frames, ignore_index=True).sort_values("date", kind="stable", ignore_index=True)


def _cached_or_raise(year: int, cache_dir: Path, exc: Exception, fetch: Callable[..., pd.DataFrame]) -> pd.DataFrame:
    if not cached_path(year, cache_dir).exists():
        raise exc
    logger.warning("download for %d failed (%s); using the cached CSV", year, type(exc).__name__)
    return fetch(year, cache_dir, refresh=False)


def promoted_from_fixtures(season_teams: Iterable[str], matches: pd.DataFrame, season_start: int) -> frozenset[str]:
    """Promoted teams for a season that may have no CSV rows yet: this season's fixture teams
    that did not play in the previous season (empty if that season isn't loaded)."""
    previous = matches[matches["season_start"] == season_start - 1]
    if previous.empty:
        return frozenset()
    return frozenset(set(season_teams) - (set(previous["home"]) | set(previous["away"])))


def current_season_start(today: date) -> int:
    """LaLiga seasons start in August; July already belongs to the next season's calendar."""
    return today.year if today.month >= 7 else today.year - 1


def promoted_teams(matches: pd.DataFrame, season_start: int) -> frozenset[str]:
    """Teams in this season that were not in the previous one (empty if that season isn't loaded)."""
    previous = matches[matches["season_start"] == season_start - 1]
    if previous.empty:
        return frozenset()
    current = matches[matches["season_start"] == season_start]
    teams = lambda df: set(df["home"]) | set(df["away"])
    return frozenset(teams(current) - teams(previous))
