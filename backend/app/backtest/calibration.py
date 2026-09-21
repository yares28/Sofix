"""Checks that difficulty labels and clean-sheet probabilities mean what they claim."""

from __future__ import annotations

from collections.abc import Sequence

import numpy as np
import pandas as pd

from app.services.scoring import LABEL_THRESHOLDS, difficulty_score
from app.services.scoring import LABELS as PRODUCTION_LABELS

LABELS = list(PRODUCTION_LABELS)
# Production splits the top cut by venue; the research tables study one scale at a time, so they take the
# home one (app/services/scoring.py explains why).
CURRENT_THRESHOLDS = LABEL_THRESHOLDS


def with_difficulty(team_rows: pd.DataFrame) -> pd.DataFrame:
    scores = [
        difficulty_score(win, draw, loss)
        for win, draw, loss in team_rows[["p_win", "p_draw", "p_loss"]].itertuples(index=False)
    ]
    return team_rows.assign(difficulty=scores)


def label_for(scores: pd.Series, thresholds: Sequence[float]) -> pd.Series:
    bins = [-np.inf, *thresholds, np.inf]
    return pd.cut(scores, bins=bins, labels=LABELS, right=True)


def propose_thresholds(
    scores: pd.Series, shares: Sequence[float] = (0.15, 0.20, 0.30, 0.20, 0.15)
) -> tuple[float, ...]:
    """Thresholds that give each label a fixed share of historical fixtures."""
    if not np.isclose(sum(shares), 1.0):
        raise ValueError("label shares must sum to 1")
    cumulative = np.cumsum(shares)[:-1]
    thresholds = tuple(round(float(q), 1) for q in np.quantile(scores, cumulative))
    if np.any(np.diff(thresholds) <= 0):
        raise ValueError(f"scores too clustered for distinct thresholds: {thresholds}")
    return thresholds


def band_table(team_rows: pd.DataFrame, thresholds: Sequence[float]) -> pd.DataFrame:
    """How teams actually did in fixtures carrying each label."""
    labelled = team_rows.assign(label=label_for(team_rows["difficulty"], thresholds))
    table = (
        labelled.groupby("label", observed=False)
        .agg(
            fixtures=("points", "size"),
            expected_ppg=("expected_points", "mean"),
            actual_ppg=("points", "mean"),
            win_rate=("points", lambda p: (p == 3).mean()),
        )
        .reset_index()
    )
    table["share"] = table["fixtures"] / table["fixtures"].sum()
    return table


def clean_sheet_calibration(team_rows: pd.DataFrame, bins: int = 5) -> pd.DataFrame:
    """Predicted vs observed clean-sheet rate, by quantile of the prediction."""
    rows = team_rows.dropna(subset=["p_cs"])
    buckets = pd.qcut(rows["p_cs"], q=bins, duplicates="drop")
    return (
        rows.groupby(buckets, observed=True)
        .agg(
            fixtures=("p_cs", "size"),
            predicted=("p_cs", "mean"),
            observed=("goals_against", lambda g: (g == 0).mean()),
        )
        .reset_index(drop=True)
    )
