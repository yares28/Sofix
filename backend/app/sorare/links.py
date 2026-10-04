"""Scores that move together (plans/xscore.md P9 X6; roadmap 10.6).

The planner used to treat every player of a lineup as if no one else's game mattered. But a keeper and his own defenders share the clean
sheet, a side's forwards share its goals, and a forward's goal is the other keeper's goal conceded. Measured on every start of two LaLiga
seasons (`backend/reports/experiments/linked_scores.py`), the correlation of how far each player's score landed from his forecast, by pair:

* same side: keeper and defender +0.29, defender and defender +0.16, forward and forward +0.10, keeper and midfielder +0.08, defender
  and midfielder +0.07, midfielder and midfielder +0.08, midfielder and forward +0.05;
* opposite sides: keeper and forward -0.26, defender and forward -0.16, keeper and midfielder -0.09, defender and midfielder -0.08, midfielder
  and midfielder -0.09, midfielder and forward -0.06, defender and defender -0.05.

The pairs not listed (about zero, or too few) are left at zero. Both seasons agree (keeper and defender +0.28 and +0.35, keeper and forward -0.24
and -0.34), with a standard error of 0.01 to 0.05.
"""

from __future__ import annotations

import numpy as np

SAME = {
    ("DEF", "GK"): 0.29,
    ("DEF", "DEF"): 0.16,
    ("FWD", "FWD"): 0.10,
    ("GK", "MID"): 0.08,
    ("DEF", "MID"): 0.07,
    ("MID", "MID"): 0.08,
    ("FWD", "MID"): 0.05,
}
OPPOSITE = {
    ("FWD", "GK"): -0.26,
    ("DEF", "FWD"): -0.16,
    ("GK", "MID"): -0.09,
    ("DEF", "MID"): -0.08,
    ("MID", "MID"): -0.09,
    ("FWD", "MID"): -0.06,
    ("DEF", "DEF"): -0.05,
}


def pair(a: str, b: str, same_side: bool) -> float:
    return (SAME if same_side else OPPOSITE).get((min(a, b), max(a, b)), 0.0)


def matrix(positions: list[str], games: list[tuple[tuple[str, str], ...]]) -> np.ndarray:
    """The correlation matrix of these players' scores: `games` holds each player's games as (game id, "H" or "A"). Two players in a
    game together are linked by their positions and sides; the first game two share counts. The result is a valid correlation matrix
    (symmetric, unit diagonal, positive definite): when the pairs ask for too much at once they are scaled back."""
    n = len(positions)
    out = np.eye(n)
    for i in range(n):
        for j in range(i + 1, n):
            mine = dict(games[i])
            shared = next((g for g, _ in games[j] if g in mine), None)
            if shared is None:
                continue
            theirs = dict(games[j])
            out[i, j] = out[j, i] = pair(positions[i], positions[j], mine[shared] == theirs[shared])
    if np.array_equal(out, np.eye(n)):
        return out
    low = np.linalg.eigvalsh(out).min()
    if low < 0.05:  # shrink towards no links until it is safely positive definite
        out = np.eye(n) + (out - np.eye(n)) * ((1 - 0.05) / (1 - low))
    return out
