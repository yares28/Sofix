"""Sofix's score corrected from the record (plans/plan-algorithm-v2.md steps 1 and 9: learn after each gameweek).

Every game keeps the number Sofix gave a player before the lock (`PlayerGame.sofix_x`, his score if he starts) and what he scored.
On the 461 LaLiga starts of GW21-24 the number was right on average (+0.2) but too flat at the ends: players rated 60+ scored 5 more,
under 40 scored 6 less (real = -11.8 + 1.24 x Sofix, slope 95% range 0.96-1.52). The plan picks the top players, so its lineups
beat their projection by 31 points.

Each refresh fits real = a + b x Sofix on every settled start and turns the stretch on only when the evidence is clear, as a model
change ships (AGENTS.md "Model rules"): the slope's 95% range leaves out 1, and fitting on the other weeks predicts each week better
than the plain number does. The spread of the real scores around the (corrected) number replaces the planner's fixed one from enough
cases. The planner's copy of the numbers is corrected, never the record, so the next measurement is of Sofix's own number again.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

import numpy as np
from sqlalchemy import select
from sqlalchemy.orm import Session, load_only

from app.models import PlayerGame
from app.sorare import games_mirror

logger = logging.getLogger(__name__)

MIN_CASES = 200  # starts before the stretch or the spread is measured at all
MIN_WEEK = 30  # starts a week needs to be a holdout
SETTLED = timedelta(hours=26)  # a score Sorare may still review is not a case yet
BOOT = 1000

Case = tuple[str, float, float]  # week (ISO year-week of the game), Sofix's number, what he scored


@dataclass(frozen=True)
class ScoreFix:
    a: float = 0.0
    b: float = 1.0
    lo: float = 1.0
    hi: float = 1.0
    n: int = 0
    on: bool = False
    spread: float | None = None
    plain_error: float | None = (
        None  # mean squared error of each week's starts, the plain number, fitted on the other weeks
    )
    fixed_error: float | None = None  # ... the stretched one

    def apply(self, mu: float) -> float:
        return round(min(100.0, max(0.0, self.a + self.b * mu)), 2) if self.on else mu

    def summary(self) -> dict[str, object]:
        return {
            "n": self.n,
            "on": self.on,
            "a": round(self.a, 2),
            "b": round(self.b, 3),
            "range": [round(self.lo, 3), round(self.hi, 3)],
            "spread": round(self.spread, 2) if self.spread is not None else None,
            "plainError": round(self.plain_error, 1) if self.plain_error is not None else None,
            "fixedError": round(self.fixed_error, 1) if self.fixed_error is not None else None,
        }


def measure(cases: list[Case]) -> ScoreFix:
    """The stretch and the spread the record supports (see the module)."""
    if len(cases) < MIN_CASES:
        return ScoreFix(n=len(cases))
    week = np.array([c[0] for c in cases])
    x = np.array([c[1] for c in cases], dtype=float)
    y = np.array([c[2] for c in cases], dtype=float)
    b, a = (float(v) for v in np.polyfit(x, y, 1))
    rng = np.random.default_rng(7)
    slopes = []
    for _ in range(BOOT):
        i = rng.integers(0, len(x), len(x))
        slopes.append(float(np.polyfit(x[i], y[i], 1)[0]))
    lo, hi = (float(v) for v in np.percentile(slopes, [2.5, 97.5]))
    plain: list[float] = []
    fixed: list[float] = []
    for w in sorted(set(week.tolist())):
        held = week == w
        if held.sum() < MIN_WEEK or (~held).sum() < MIN_WEEK:
            continue
        bw, aw = np.polyfit(x[~held], y[~held], 1)
        plain.extend(((y[held] - x[held]) ** 2).tolist())
        fixed.extend(((y[held] - (aw + bw * x[held])) ** 2).tolist())
    plain_error = float(np.mean(plain)) if plain else None
    fixed_error = float(np.mean(fixed)) if fixed else None
    on = (lo > 1 or hi < 1) and plain_error is not None and fixed_error is not None and fixed_error < plain_error
    left = y - (a + b * x if on else x)
    return ScoreFix(
        a=a,
        b=b,
        lo=lo,
        hi=hi,
        n=len(cases),
        on=on,
        spread=float(np.std(left)),
        plain_error=plain_error,
        fixed_error=fixed_error,
    )


def cases(db: Session, *, now: datetime | None = None) -> list[Case]:
    """Every settled start with Sofix's number from before the lock."""
    now = now or datetime.now(UTC)
    rows = games_mirror.view(db).scalars(
        select(PlayerGame)
        .options(load_only(PlayerGame.date, PlayerGame.started, PlayerGame.score, PlayerGame.sofix_x))
        .where(PlayerGame.said_at.is_not(None), PlayerGame.sofix_x.is_not(None), PlayerGame.started.is_(True))
    )
    out: list[Case] = []
    for row in rows:
        date = row.date if row.date.tzinfo else row.date.replace(tzinfo=UTC)
        if row.score is None or row.sofix_x is None or date > now - SETTLED:
            continue
        year, number, _ = date.isocalendar()
        out.append((f"{year}-{number:02d}", float(row.sofix_x), float(row.score)))
    return out


def load(db: Session) -> ScoreFix:
    fix = measure(cases(db))
    logger.info("score fix: %s", fix.summary())
    return fix
