"""Reading a finished match against the forecast that preceded it.

A board that calls a game Easy and watches the club lose has two very different things to say:

- *"that happens"* - the forecast gave the loss a real chance, and the club played about as well as
  expected. Football does this roughly one game in ten even when the rating is right, and a model that
  chases every one of them gets worse, not better;
- *"we had them wrong"* - the club did not just lose, it was outplayed, and the shots say so too.

Telling those apart needs two numbers per club per match:

1. **Surprise** - how unlikely the result was under our own forecast, as a percentile of that forecast's
   own distribution. A 1-in-20 result is surprising; a 1-in-3 result is not, however annoying.
2. **Performance gap** - what the club's shots on target were worth against the goals the model expected.
   Goals are noisy; shots on target are less so. When the result is bad but the gap is near zero, the
   finishing moved, not the team.

A red card puts the match outside what a goals model can be judged on, so those are set aside too.

The verdicts are what the learning layer is allowed to act on: only `evidence` counts as a sign the
rating itself is wrong (see the drift test in app/services/drift.py).
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

import numpy as np
import pandas as pd

Verdict = Literal["as forecast", "variance", "evidence", "data"]

SURPRISING = 0.20  # a result in the least likely fifth of the forecast's own distribution
PERFORMANCE_TOLERANCE = 0.6  # goals of shots-on-target value; below this the team played as forecast
POINTS = {"win": 3, "draw": 1, "loss": 0}


def outcome_points(goals_for: np.ndarray, goals_against: np.ndarray) -> np.ndarray:
    return np.select([goals_for > goals_against, goals_for == goals_against], [3, 1], 0)


def rps_from(p_win: np.ndarray, p_draw: np.ndarray, p_loss: np.ndarray, points: np.ndarray) -> np.ndarray:
    """Ranked probability score of one club's forecast against what it took, ordered win > draw > loss."""
    probs = np.stack([np.asarray(p_win), np.asarray(p_draw), np.asarray(p_loss)], axis=-1)
    index = np.select([np.asarray(points) == 3, np.asarray(points) == 1], [0, 1], 2)
    observed = np.eye(3)[index]
    gap = np.cumsum(probs, axis=-1)[..., :2] - np.cumsum(observed, axis=-1)[..., :2]
    return np.sum(gap**2, axis=-1) / 2


def surprise_percentile(p_win: np.ndarray, p_draw: np.ndarray, p_loss: np.ndarray, points: np.ndarray) -> np.ndarray:
    """How often a result at least this surprising happens, under the same forecast.

    Exact, not simulated: there are only three outcomes, so score each one and add up the probability of
    those the forecast finds at least as surprising as what happened. 0.5 is an ordinary Saturday; 0.05
    means the forecast said this would happen about one time in twenty.
    """
    p_win, p_draw, p_loss = (np.asarray(p, dtype=float) for p in (p_win, p_draw, p_loss))
    actual = rps_from(p_win, p_draw, p_loss, points)
    total = np.zeros_like(actual, dtype=float)
    for outcome, probability in (("win", p_win), ("draw", p_draw), ("loss", p_loss)):
        scored = rps_from(p_win, p_draw, p_loss, np.full_like(actual, POINTS[outcome]))
        total += np.where(scored >= actual - 1e-12, probability, 0.0)
    return total


def surprise_of(p_win: float, p_draw: float, p_loss: float, points: int) -> float:
    """surprise_percentile for a single forecast: the board reviews one played cell at a time."""
    one = lambda value: np.array([value], dtype=float)
    return float(surprise_percentile(one(p_win), one(p_draw), one(p_loss), one(points))[0])


def shots_value(shots_on_target: np.ndarray, conversion: float) -> np.ndarray:
    """What a club's shots on target were worth in goals, at the league's conversion rate."""
    return np.asarray(shots_on_target, dtype=float) * conversion


def league_conversion(matches: pd.DataFrame) -> float:
    """Goals per shot on target, from finished matches only. Pass matches from before the cutoff."""
    shots = matches[["hst", "ast"]].to_numpy(dtype=float)
    goals = matches[["hg", "ag"]].to_numpy(dtype=float)
    usable = np.isfinite(shots).all(axis=1)
    total = shots[usable].sum()
    return float(goals[usable].sum() / total) if total > 0 else 0.0


def classify(
    surprise: np.ndarray, performance_gap: np.ndarray, red_cards: np.ndarray, has_shots: np.ndarray
) -> np.ndarray:
    """One verdict per club per match. `performance_gap` is signed: below 0 = played worse than forecast."""
    surprise = np.asarray(surprise, dtype=float)
    gap = np.asarray(performance_gap, dtype=float)
    ordinary = surprise > SURPRISING
    played_to_forecast = np.abs(gap) <= PERFORMANCE_TOLERANCE
    return np.select(
        [~np.asarray(has_shots, dtype=bool), ordinary, np.asarray(red_cards, dtype=bool) | played_to_forecast],
        ["data", "as forecast", "variance"],
        "evidence",
    )


@dataclass(frozen=True)
class Review:
    """One club's match, read against the forecast that preceded it."""

    verdict: Verdict
    surprise: float  # percentile of the forecast's own distribution; low = unlikely result
    points: int
    expected_points: float
    goals_for: int
    goals_against: int
    xg_for: float
    performance_gap: float  # shots-on-target value minus expected goals, in goals
    note: str


def note_for(verdict: str, row: pd.Series) -> str:
    """One line a person can read, in the board's own words."""
    scoreline = f"{row['goals_for']:.0f}-{row['goals_against']:.0f}"
    played = f"{row['shots_value']:.1f} from shots against {row['xg_for']:.1f} expected"
    if verdict == "data":
        return f"{scoreline}, no shot counts for this match: not judged"
    if verdict == "as forecast":
        return (
            f"{scoreline}, about what the forecast allowed for ({row['surprise']:.0%} of results are this surprising)"
        )
    if verdict == "variance":
        if row["red_cards"]:
            return f"{scoreline} with a red card: the match stopped being the one that was forecast"
        return f"{scoreline}, but the play matched the forecast ({played}) - finishing and keeping, not the rating"
    direction = "worse" if row["performance_gap"] < 0 else "better"
    return f"{scoreline}, and played {direction} than forecast ({played}) - a sign the rating is off"


def review_rows(rows: pd.DataFrame, conversion: float) -> pd.DataFrame:
    """Review a frame of club-matches.

    Needs, per row: p_win, p_draw, p_loss, xg_for, goals_for, goals_against, shots_on_target, red_cards.
    Returns the same rows with surprise, performance_gap, verdict and note added.
    """
    points = outcome_points(rows["goals_for"].to_numpy(), rows["goals_against"].to_numpy())
    value = shots_value(rows["shots_on_target"].to_numpy(), conversion)
    has_shots = np.isfinite(rows["shots_on_target"].to_numpy(dtype=float))
    out = rows.assign(
        points=points,
        expected_points=3 * rows["p_win"] + rows["p_draw"],
        surprise=surprise_percentile(rows["p_win"], rows["p_draw"], rows["p_loss"], points),
        shots_value=value,
        performance_gap=np.where(has_shots, value - rows["xg_for"].to_numpy(dtype=float), np.nan),
    )
    out["verdict"] = classify(out["surprise"], out["performance_gap"].fillna(0.0), rows["red_cards"], has_shots)
    out["note"] = [note_for(verdict, row) for verdict, (_, row) in zip(out["verdict"], out.iterrows(), strict=True)]
    return out
