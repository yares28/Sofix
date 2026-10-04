"""The league figures of the Audit page: the new xScore against what happened, over two LaLiga seasons (plans/xscore.md P9 X5d; roadmap 10.2c, 10.5).

Everything here is replayed: each week of the games export is predicted from the weeks before it only (`keeper.walk_forward`, `outfield.walk_forward`) and then
compared with the score. The page draws `frontend/lib/data/audit_league.json`, written by `python -m app.jobs.audit_league`; the figures under 100 cases say
"too few to tell" there, as everywhere on the Audit.
"""

from __future__ import annotations

from collections import defaultdict
from collections.abc import Sequence
from dataclasses import dataclass
from datetime import datetime
from typing import Any

import numpy as np

FLOOR = 100  # the fewest cases a figure may rest on (as app.sorare.audit.FLOOR)
HIST_EDGE = 49  # the misses are drawn from -49 to +49 points in steps of 3.5, so that four bars in the middle are the starts within 7 points
HIST_STEP = 3.5


@dataclass(frozen=True)
class Case:
    """One start the new number was predicted for."""

    week: str
    date: datetime
    player: str
    pos: str
    said: float
    score: float


def weekly_pairs(cases: Sequence[Case], floor: int = FLOOR) -> list[dict[str, Any]]:
    """For each gameweek: of every two players of one position in it, how often the one with the higher number scored more (a tie in the score counts half),
    all positions together, oldest week first. A week with fewer than `floor` pairs is left out."""
    by_week: dict[str, dict[str, list[Case]]] = defaultdict(lambda: defaultdict(list))
    for case in cases:
        by_week[case.week][case.pos].append(case)
    out = []
    for week in sorted(by_week, key=lambda w: min(c.date for lst in by_week[w].values() for c in lst)):
        hit = total = 0.0
        for rows in by_week[week].values():
            said = np.array([c.said for c in rows])
            score = np.array([c.score for c in rows])
            who = np.array([c.player for c in rows])
            a = np.sign(said[:, None] - said[None, :])
            b = np.sign(score[:, None] - score[None, :])
            keep = np.triu((b != 0) & (who[:, None] != who[None, :]), 1)
            agree = (a * b)[keep]
            hit += float((agree > 0).sum() + 0.5 * (agree == 0).sum())
            total += float(keep.sum())
        if total and total >= floor:
            first = min(c.date for lst in by_week[week].values() for c in lst)
            out.append({"from": first.date().isoformat(), "rate": round(hit / total, 4), "pairs": int(total)})
    return out


def miss_histogram(cases: Sequence[Case]) -> dict[str, Any]:
    """How far each score landed from the number: counts of starts in bars of 3.5 points from -49 to +49 (28 bars; the four in the middle are the starts within
    7 points), and the shares within 7 and 15 points. A miss further out is counted in the end bars."""
    miss = np.array([c.score - c.said for c in cases], dtype=float)
    edges = np.arange(-HIST_EDGE, HIST_EDGE + HIST_STEP / 2, HIST_STEP)
    counts, _ = np.histogram(np.clip(miss, -HIST_EDGE + 0.01, HIST_EDGE - 0.01), bins=edges)
    return {
        "from": -HIST_EDGE,
        "step": HIST_STEP,
        "counts": [int(v) for v in counts],
        "n": int(len(miss)),
        "within7": round(float(np.mean(np.abs(miss) <= 7)), 4) if len(miss) else None,
        "within15": round(float(np.mean(np.abs(miss) <= 15)), 4) if len(miss) else None,
    }


def calibration(said: Sequence[float], happened: Sequence[bool], bins: int = 6) -> list[dict[str, float]]:
    """Chances against what happened: the starts sorted by what was said, cut into `bins` equal groups, each with the mean said, how often it happened and how many.
    A group on the diagonal is honest."""
    if len(said) < FLOOR:
        return []
    order = np.argsort(np.asarray(said), kind="stable")
    s = np.asarray(said, dtype=float)[order]
    h = np.asarray(happened, dtype=float)[order]
    out = []
    for part in np.array_split(np.arange(len(s)), bins):
        if len(part):
            out.append(
                {
                    "said": round(float(s[part].mean()), 4),
                    "happened": round(float(h[part].mean()), 4),
                    "n": int(len(part)),
                }
            )
    return out


def pooled_within(blocks: Sequence[dict[str, Any]], which: str, point: str = "7") -> float | None:
    """The share within `point` points over several positions' blocks (each `{games, within: {...}}`), weighted by their games."""
    games = sum(b[which]["games"] for b in blocks if b.get(which) and b[which].get("games"))
    if not games:
        return None
    total = sum(b[which]["games"] * b[which]["within"][point] for b in blocks if b.get(which) and b[which].get("games"))
    return round(total / games, 4)
