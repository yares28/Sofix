"""Historical LaLiga matches in one tidy frame for model fitting and backtests."""

from __future__ import annotations

from collections.abc import Iterable
from pathlib import Path

import numpy as np
import pandas as pd

from app.sources.football_data_co_uk import fetch_season_csv

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


def load_history(season_starts: Iterable[int], cache_dir: Path, refresh_latest: bool = False) -> pd.DataFrame:
    seasons = sorted(season_starts)
    frames = [
        normalize_season(fetch_season_csv(year, cache_dir, refresh=refresh_latest and year == seasons[-1]), year)
        for year in seasons
    ]
    return pd.concat(frames, ignore_index=True).sort_values("date", kind="stable", ignore_index=True)


def promoted_teams(matches: pd.DataFrame, season_start: int) -> frozenset[str]:
    """Teams in this season that were not in the previous one (empty if that season isn't loaded)."""
    previous = matches[matches["season_start"] == season_start - 1]
    if previous.empty:
        return frozenset()
    current = matches[matches["season_start"] == season_start]
    teams = lambda df: set(df["home"]) | set(df["away"])
    return frozenset(teams(current) - teams(previous))
