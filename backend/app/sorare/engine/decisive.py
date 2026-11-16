"""E4 · decisive actions, one chance for each kind (plans/score-engine.md §3 step 5, §7 E4; item X8 of multi-competition-review.md).

Sorare's decisive level, rebuilt exactly from the stats on all 38,850 appearances of the export (28 Oct 2026; only 8 keepers taken off
with a clean sheet differ):

    level = goals + assists + penalties won that were scored (`assist_penalty_won`) + clearances off the line + last-man tackles
            + penalty saves + a keeper's clean sheet − red cards − own goals − penalties conceded − errors leading to a goal

A penalty won that is missed (`penalty_won`) is an all-around stat (+3), not a decisive one.

Each kind's expected count for his game comes from his rate (shrunk to his role's, `allround.Book`) × his minutes × the game's factor
(`style.Style`: the opponent, the venue and how many goals his side is expected to score and concede compared with its usual), the
keeper's clean sheet from the football model's chance corrected on its log-odds. Each kind is a Poisson count and the keeper's clean
sheet a coin, so the level's whole distribution follows, and with it his chance of each kind, of a decisive action (level 1+), of a
negative one, and his expected score:

    score = Σ over levels: chance × min(100, max(floor, level points + his expected all-around))
"""

from __future__ import annotations

import math
from collections.abc import Sequence
from dataclasses import dataclass

import numpy as np

from app.sorare.engine.allround import STATS

POSITIVE = ("goals", "goal_assist", "assist_penalty_won", "clearance_off_line", "last_man_tackle", "penalty_save")
NEGATIVE = ("red_card", "own_goals", "penalty_conceded", "error_lead_to_goal")
KINDS = (
    "goals",
    "goal_assist",
    "assist_penalty_won",
    "clearance_off_line",
    "last_man_tackle",
    "penalty_save",
    "clean_sheet",
)
POINTS = {-3: 0.0, -2: 5.0, -1: 15.0, 0: 35.0, 1: 60.0, 2: 70.0, 3: 80.0, 4: 90.0, 5: 100.0}
_POS = np.array([STATS.index(s) for s in POSITIVE])
_NEG = np.array([STATS.index(s) for s in NEGATIVE])
_TOP = 9  # counts beyond this carry no weight worth adding


def floor_of(level: int) -> float:
    return POINTS[level] if level >= 1 else 0.0


def _poisson(lam: float) -> np.ndarray:
    k = np.arange(_TOP + 1)
    pmf = np.exp(-lam + k * math.log(max(lam, 1e-12)) - np.array([math.lgamma(i + 1) for i in k]))
    pmf[-1] += max(0.0, 1.0 - pmf.sum())
    return pmf


def correct_clean_sheet(cs: float, a: float, b: float) -> float:
    """The football model's clean-sheet chance moved on its log-odds: a + b × logit(cs)."""
    c = min(max(cs, 1e-4), 1 - 1e-4)
    return 1.0 / (1.0 + math.exp(-(a + b * math.log(c / (1 - c)))))


@dataclass(frozen=True)
class Level:
    """His decisive level's distribution for one start, and each kind's chance."""

    pmf: dict[int, float]  # level → chance, −3 to 5
    kinds: dict[str, float]  # kind → chance of at least one

    @property
    def p_decisive(self) -> float:
        return sum(p for level, p in self.pmf.items() if level >= 1)

    @property
    def p_negative(self) -> float:
        return sum(p for level, p in self.pmf.items() if level <= -1)

    def score(self, all_around: float) -> float:
        return sum(p * min(100.0, max(floor_of(level), POINTS[level] + all_around)) for level, p in self.pmf.items())


def level_of(counts: np.ndarray, clean_sheet: float = 0.0, scale_pos: float = 1.0, scale_neg: float = 1.0) -> Level:
    """The level from each decisive kind's expected count (`counts`, in `STATS` order) and a keeper's chance of a clean sheet (0 for the
    others). `scale_pos`, `scale_neg` are the position's corrections, fitted so the chances are honest."""
    lam_pos = float(counts[_POS].sum()) * scale_pos
    lam_neg = float(counts[_NEG].sum()) * scale_neg
    pos = _poisson(lam_pos)
    if clean_sheet > 0:
        pos = np.append(pos * (1 - clean_sheet), 0.0) + np.append(0.0, pos * clean_sheet)
    neg = _poisson(lam_neg)
    pmf: dict[int, float] = {}
    for i, a in enumerate(pos):
        for j, b in enumerate(neg):
            level = max(-3, min(5, i - j))
            pmf[level] = pmf.get(level, 0.0) + float(a * b)
    kinds = {s: 1.0 - math.exp(-float(counts[STATS.index(s)]) * scale_pos) for s in POSITIVE}
    kinds["clean_sheet"] = clean_sheet
    return Level(pmf, kinds)


def fit_scale(levels: Sequence[tuple[float, float]], hit: Sequence[bool]) -> float:
    """The correction of the positive kinds' expected counts that makes the chance of a decisive action honest on these starts. Each
    start is (positive count, clean-sheet chance); the scale is the one with the lowest log loss on a grid. (A negative action can cancel
    one positive; it is rare enough to leave out of the fit.)"""
    lp = np.array([x[0] for x in levels])
    cs = np.array([x[1] for x in levels])
    y = np.array(hit, dtype=bool)
    best, best_loss = 1.0, math.inf
    for scale in np.arange(0.5, 1.81, 0.02):
        p = np.clip(1 - np.exp(-lp * scale) * (1 - cs), 1e-6, 1 - 1e-6)
        loss = -float(np.log(np.where(y, p, 1 - p)).sum())
        if loss < best_loss:
            best, best_loss = float(scale), loss
    return best
