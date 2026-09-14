"""Rolling-origin backtest: every Monday, forecast the next N weeks using only past data."""

from __future__ import annotations

from collections.abc import Iterable, Sequence

import numpy as np
import pandas as pd

from app.backtest.data import promoted_teams
from app.backtest.methods import Method

TARGET_COLUMNS = ["season_start", "date", "home", "away", "hg", "ag"]


def season_cutoffs(season_matches: pd.DataFrame) -> list[pd.Timestamp]:
    """Mondays from the one on/before the first match until the last match."""
    first = season_matches["date"].min().normalize()
    last = season_matches["date"].max()
    start = first - pd.Timedelta(days=first.weekday())
    return list(pd.date_range(start, last, freq="7D"))


def run_walkforward(
    matches: pd.DataFrame,
    season_starts: Iterable[int],
    methods: Sequence[Method],
    horizon_weeks: int = 8,
) -> pd.DataFrame:
    """One row per (method, cutoff, match) with the forecast and the real result.

    `horizon` is 1 for matches in the week right after the cutoff, 2 for the week after, etc.
    """
    rows: list[pd.DataFrame] = []
    for season in season_starts:
        season_matches = matches[matches["season_start"] == season]
        if season_matches.empty:
            continue
        promoted = promoted_teams(matches, season)
        for cutoff in season_cutoffs(season_matches):
            window_end = cutoff + pd.Timedelta(weeks=horizon_weeks)
            targets = season_matches[(season_matches["date"] >= cutoff) & (season_matches["date"] < window_end)]
            if targets.empty:
                continue
            history = matches[matches["date"] < cutoff]
            base = (
                targets[TARGET_COLUMNS]
                .reset_index(drop=True)
                .assign(
                    cutoff=cutoff,
                    horizon=((targets["date"] - cutoff).dt.days // 7 + 1).to_numpy(),
                )
            )
            for method in methods:
                forecast = method.predict(history, cutoff, targets, promoted).reset_index(drop=True)
                rows.append(pd.concat([base.assign(method=method.name), forecast], axis=1))
    return pd.concat(rows, ignore_index=True)


def team_perspective(predictions: pd.DataFrame) -> pd.DataFrame:
    """Two rows per match, one per team, with expected and actual points."""
    home = pd.DataFrame(
        {
            "method": predictions["method"],
            "cutoff": predictions["cutoff"],
            "date": predictions["date"],
            "horizon": predictions["horizon"],
            "team": predictions["home"],
            "opponent": predictions["away"],
            "venue": "H",
            "p_win": predictions["p_h"],
            "p_draw": predictions["p_d"],
            "p_loss": predictions["p_a"],
            "p_cs": predictions["cs_h"],
            "xg_for": predictions["lam_h"],
            "goals_for": predictions["hg"],
            "goals_against": predictions["ag"],
        }
    )
    away = pd.DataFrame(
        {
            "method": predictions["method"],
            "cutoff": predictions["cutoff"],
            "date": predictions["date"],
            "horizon": predictions["horizon"],
            "team": predictions["away"],
            "opponent": predictions["home"],
            "venue": "A",
            "p_win": predictions["p_a"],
            "p_draw": predictions["p_d"],
            "p_loss": predictions["p_h"],
            "p_cs": predictions["cs_a"],
            "xg_for": predictions["lam_a"],
            "goals_for": predictions["ag"],
            "goals_against": predictions["hg"],
        }
    )
    teams = pd.concat([home, away], ignore_index=True)
    teams["expected_points"] = 3 * teams["p_win"] + teams["p_draw"]
    teams["points"] = np.select(
        [teams["goals_for"] > teams["goals_against"], teams["goals_for"] == teams["goals_against"]], [3, 1], 0
    )
    return teams


def run_ranking(predictions: pd.DataFrame, run_length: int = 5) -> pd.DataFrame:
    """Does the forecast rank teams' next-N-match runs correctly?

    For each cutoff: sum expected vs actual points over each team's next `run_length`
    matches, then take the Spearman rank correlation across teams. Averaged over cutoffs.
    """
    teams = team_perspective(predictions).sort_values(["method", "cutoff", "team", "date"])
    teams["order"] = teams.groupby(["method", "cutoff", "team"]).cumcount()
    runs = (
        teams[teams["order"] < run_length]
        .groupby(["method", "cutoff", "team"])
        .agg(expected=("expected_points", "sum"), actual=("points", "sum"), n=("points", "size"))
        .reset_index()
    )
    runs = runs[runs["n"] == run_length]

    def spearman(group: pd.DataFrame) -> float:
        if len(group) < 10:
            return np.nan
        return group["expected"].rank().corr(group["actual"].rank())

    per_cutoff = (
        runs.groupby(["method", "cutoff"]).apply(spearman, include_groups=False).rename("spearman").reset_index()
    )
    return per_cutoff.groupby("method")["spearman"].agg(["mean", "count"]).reset_index()
