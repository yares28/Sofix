"""Scoring rules for probabilistic match forecasts. Lower is better except accuracy."""

from __future__ import annotations

import numpy as np
import pandas as pd

METRIC_COLUMNS = ["matches", "rps", "log_loss", "accuracy", "clean_sheet_brier"]


def outcome_index(hg: np.ndarray, ag: np.ndarray) -> np.ndarray:
    """0 = home win, 1 = draw, 2 = away win."""
    hg, ag = np.asarray(hg), np.asarray(ag)
    return np.where(hg > ag, 0, np.where(hg == ag, 1, 2))


def ranked_probability_score(probs: np.ndarray, outcome: np.ndarray) -> float:
    """Mean RPS for ordered H/D/A outcomes. Rewards putting probability near the right answer."""
    probs = np.asarray(probs, dtype=float)
    observed = np.eye(3)[np.asarray(outcome)]
    cumulative_gap = np.cumsum(probs, axis=1)[:, :2] - np.cumsum(observed, axis=1)[:, :2]
    return float(np.mean(np.sum(cumulative_gap**2, axis=1) / 2))


def log_loss(probs: np.ndarray, outcome: np.ndarray) -> float:
    probs = np.asarray(probs, dtype=float)
    picked = probs[np.arange(len(probs)), np.asarray(outcome)]
    return float(-np.mean(np.log(np.clip(picked, 1e-12, 1.0))))


def accuracy(probs: np.ndarray, outcome: np.ndarray) -> float:
    return float(np.mean(np.argmax(probs, axis=1) == np.asarray(outcome)))


def brier(prob: np.ndarray, happened: np.ndarray) -> float:
    return float(np.mean((np.asarray(prob, dtype=float) - np.asarray(happened, dtype=float)) ** 2))


def summarize(predictions: pd.DataFrame, by: list[str]) -> pd.DataFrame:
    """Metrics per group. Expects columns p_h, p_d, p_a, cs_h, cs_a, hg, ag."""

    def score(group: pd.DataFrame) -> pd.Series:
        probs = group[["p_h", "p_d", "p_a"]].to_numpy()
        outcome = outcome_index(group["hg"], group["ag"])
        has_cs = group["cs_h"].notna() & group["cs_a"].notna()
        cs_pred = np.concatenate([group.loc[has_cs, "cs_h"], group.loc[has_cs, "cs_a"]])
        cs_real = np.concatenate([group.loc[has_cs, "ag"] == 0, group.loc[has_cs, "hg"] == 0])
        return pd.Series(
            {
                "matches": len(group),
                "rps": ranked_probability_score(probs, outcome),
                "log_loss": log_loss(probs, outcome),
                "accuracy": accuracy(probs, outcome),
                "clean_sheet_brier": brier(cs_pred, cs_real) if has_cs.any() else np.nan,
            }
        )

    if predictions.empty:
        return pd.DataFrame(columns=[*by, *METRIC_COLUMNS])
    return predictions.groupby(by, sort=True).apply(score, include_groups=False).reset_index()
