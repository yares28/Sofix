"""Mixing bookmaker prices into the model's win/draw/loss for games that are nearly here.

The backtest's ceiling is the closing price: bookmakers know the team news, and over nine seasons they
beat the model by about 0.006 RPS. Nothing free closes that gap except the prices themselves, and only
for games close enough to be priced. So the board blends them in for the next week of fixtures and
leaves everything further out to the model, which is what a fixture-difficulty board is for.

    p ∝ p_model^(1−w) · p_market^w      (a log pool, renormalised)

A log pool keeps an outcome that both sides call unlikely unlikely, which an average would not. `w` is
fitted by the backtest and stored in artifacts/market_blend.json; without that file nothing is blended.
Only win/draw/loss moves - the goal rates, clean sheets and expected goals stay the model's.
"""

from __future__ import annotations

import json
from dataclasses import asdict, dataclass
from datetime import datetime, timedelta
from pathlib import Path

import numpy as np


def log_pool(model: np.ndarray, market: np.ndarray, weight: float) -> np.ndarray:
    """Blend two sets of probabilities row by row: p ∝ p_model^(1−w) · p_market^w."""
    blended = np.clip(model, 1e-9, 1.0) ** (1 - weight) * np.clip(market, 1e-9, 1.0) ** weight
    return blended / blended.sum(axis=-1, keepdims=True)


@dataclass(frozen=True)
class MarketBlend:
    """How much of the bookmakers to mix in, and which fixtures qualify. Defaults are "none"."""

    weight: float = 0.0
    horizon_days: int = 7  # only fixtures this close to kickoff
    max_age_hours: int = 48  # a price older than this is stale (the odds sync runs every 6 h)
    min_bookmakers: int = 3

    @property
    def is_off(self) -> bool:
        return self.weight <= 0.0

    def applies(self, kickoff: datetime, now: datetime, fetched_at: datetime, bookmakers: int) -> bool:
        if self.is_off or bookmakers < self.min_bookmakers:
            return False
        if kickoff > now + timedelta(days=self.horizon_days):
            return False
        return now - fetched_at <= timedelta(hours=self.max_age_hours)

    def blend(
        self, model: tuple[float, float, float], market: tuple[float, float, float]
    ) -> tuple[float, float, float]:
        pooled = log_pool(np.array([model], dtype=float), np.array([market], dtype=float), self.weight)[0]
        return float(pooled[0]), float(pooled[1]), float(pooled[2])


def load_market_blend(path: str | Path) -> MarketBlend:
    """The fitted blend, or "blend nothing" when the backtest hasn't written one."""
    path = Path(path)
    if not path.exists():
        return MarketBlend()
    saved = json.loads(path.read_text(encoding="utf-8"))
    fields = MarketBlend.__dataclass_fields__
    return MarketBlend(**{k: v for k, v in saved.items() if k in fields})


def save_market_blend(path: str | Path, blend: MarketBlend) -> None:
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(asdict(blend), indent=2), encoding="utf-8")
