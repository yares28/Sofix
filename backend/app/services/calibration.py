"""Corrections fitted on past forecasts, so the numbers on the board mean what they say.

The rating model is good at ordering games and less good at the *level* of some of the numbers it
prints. Clean-sheet chances are the clear case: over nine backtested seasons they ran about 2 points
high, and about 4 points high on 2023/24-2025/26. Refitting the goal model to fix that would move the
win/draw/loss probabilities, which are well calibrated, so the correction is applied afterwards instead.

    p' = sigmoid(a + b * logit(p))

`a` shifts every chance, `b` stretches or flattens the spread. The fit is pulled toward doing nothing
(a = 0, b = 1) and hard-capped, so a thin or odd sample can't produce a wild correction.
"""

from __future__ import annotations

import json
import math
from dataclasses import asdict, dataclass
from pathlib import Path

import numpy as np
from scipy.optimize import minimize

EPS = 1e-6
SHIFT_BOUND = 1.0  # |a|, on the log-odds scale
SLOPE_BOUNDS = (0.5, 1.5)  # b
PRIOR_STRENGTH = 200.0  # how many forecasts the "change nothing" prior is worth
MIN_SAMPLE = 500  # below this, leave the probabilities alone


def logit(p: np.ndarray) -> np.ndarray:
    p = np.clip(np.asarray(p, dtype=float), EPS, 1 - EPS)
    return np.log(p / (1 - p))


def sigmoid(x: np.ndarray) -> np.ndarray:
    return 1 / (1 + np.exp(-np.asarray(x, dtype=float)))


@dataclass(frozen=True)
class CleanSheetCalibration:
    """What to do to a clean-sheet probability before showing it. Defaults are "nothing"."""

    a: float = 0.0
    b: float = 1.0
    n: int = 0  # forecasts it was fitted on
    fitted_through: str | None = None  # newest result in the fit, YYYY-MM-DD

    @property
    def is_identity(self) -> bool:
        return self.a == 0.0 and self.b == 1.0

    def apply(self, p: float) -> float:
        if self.is_identity:
            return float(p)
        return float(sigmoid(self.a + self.b * logit(np.asarray(p))))

    def apply_many(self, p: np.ndarray) -> np.ndarray:
        if self.is_identity:
            return np.asarray(p, dtype=float)
        return sigmoid(self.a + self.b * logit(p))


def fit_clean_sheet_calibration(
    predicted: np.ndarray, happened: np.ndarray, fitted_through: str | None = None
) -> CleanSheetCalibration:
    """Fit `a` and `b` on past forecasts and what followed them (maximum likelihood, penalised).

    `predicted` are the model's clean-sheet chances, `happened` 1 where the club kept one. Forecasts
    made for the same match at different horizons all count; the correction is applied at every horizon.
    """
    x, y = logit(predicted), np.asarray(happened, dtype=float)
    keep = np.isfinite(x) & np.isfinite(y)
    x, y = x[keep], y[keep]
    if len(x) < MIN_SAMPLE:
        return CleanSheetCalibration(n=len(x), fitted_through=fitted_through)

    def loss(theta: np.ndarray) -> tuple[float, np.ndarray]:
        a, b = theta
        z = a + b * x
        # log(1 + exp(z)) without overflow
        nll = float(np.sum(np.logaddexp(0.0, z) - y * z))
        residual = sigmoid(z) - y
        grad = np.array([residual.sum(), float(residual @ x)])
        penalty = PRIOR_STRENGTH * (a**2 + (b - 1) ** 2) / 2
        grad += PRIOR_STRENGTH * np.array([a, b - 1])
        return nll + penalty, grad

    result = minimize(
        loss,
        np.array([0.0, 1.0]),
        jac=True,
        method="L-BFGS-B",
        bounds=[(-SHIFT_BOUND, SHIFT_BOUND), SLOPE_BOUNDS],
    )
    a, b = (float(v) for v in result.x)
    if not result.success or not (math.isfinite(a) and math.isfinite(b)):
        return CleanSheetCalibration(n=len(x), fitted_through=fitted_through)
    return CleanSheetCalibration(a=a, b=b, n=len(x), fitted_through=fitted_through)


def load_clean_sheet_calibration(path: str | Path) -> CleanSheetCalibration:
    """The fitted correction, or "change nothing" when the backtest hasn't written one yet."""
    path = Path(path)
    if not path.exists():
        return CleanSheetCalibration()
    saved = json.loads(path.read_text(encoding="utf-8"))
    fields = CleanSheetCalibration.__dataclass_fields__
    return CleanSheetCalibration(**{k: v for k, v in saved.items() if k in fields})


def save_clean_sheet_calibration(path: str | Path, calibration: CleanSheetCalibration) -> None:
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(asdict(calibration), indent=2), encoding="utf-8")
