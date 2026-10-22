"""Research-only, venue-aware pooled European goals model. No serving registration.

Shares club strength across the three European cups using canonical club IDs. It
requires reviewed regulation outcomes, explicit venue context and availability times;
native source period fields cannot be passed through as approved targets implicitly.
"""

from __future__ import annotations

from collections.abc import Iterable, Sequence
from dataclasses import dataclass
from datetime import datetime
from numbers import Real

import numpy as np
import pandas as pd
from scipy.optimize import minimize, minimize_scalar

from app.modeling.dixon_coles import DixonColesConfig, dc_adjustments, outcome_table

CONFIG = DixonColesConfig(xi=0.001, ridge=1.0, promoted_prior=0.0, spread=1.10, goals_weight=1.0)


@dataclass
class EuropeanFitData:
    n: int
    home: np.ndarray
    away: np.ndarray
    weights: np.ndarray
    hg: np.ndarray
    ag: np.ndarray
    home_effect: np.ndarray
    ridge: float


def objective(theta: np.ndarray, data: EuropeanFitData) -> tuple[float, np.ndarray]:
    n, hi, ai, w = data.n, data.home, data.away, data.weights
    attack, defence = theta[2 : 2 + n], theta[2 + n :]
    eta_h = theta[0] + theta[1] * data.home_effect + attack[hi] - defence[ai]
    eta_a = theta[0] + attack[ai] - defence[hi]
    lam_h, lam_a = np.exp(eta_h), np.exp(eta_a)
    value = (w * (lam_h - data.hg * eta_h + lam_a - data.ag * eta_a)).sum()
    value += data.ridge * (np.square(attack).sum() + np.square(defence).sum())
    rh, ra = w * (lam_h - data.hg), w * (lam_a - data.ag)
    grad = np.empty_like(theta)
    grad[0] = rh.sum() + ra.sum()
    grad[1] = (rh * data.home_effect).sum()
    grad[2 : 2 + n] = np.bincount(hi, rh, n) + np.bincount(ai, ra, n) + 2 * data.ridge * attack
    grad[2 + n :] = -np.bincount(ai, rh, n) - np.bincount(hi, ra, n) + 2 * data.ridge * defence
    return float(value), grad


@dataclass
class EuropeanModel:
    teams: tuple[str, ...]
    mu: float
    home_adv: float
    attack: np.ndarray
    defence: np.ndarray
    rho: float

    def expected_goals(
        self, home: Sequence[str], away: Sequence[str], *, neutral: Sequence[bool]
    ) -> tuple[np.ndarray, np.ndarray]:
        if len(home) != len(away) or len(neutral) != len(home) or any(type(v) is not bool for v in neutral):
            raise ValueError("Explicit venue context required for every game")
        index = {team: i for i, team in enumerate(self.teams)}
        hi, ai = np.array([index[h] for h in home]), np.array([index[a] for a in away])
        home_effect = 1 - np.asarray(neutral, dtype=float)
        return (
            np.exp(self.mu + self.home_adv * home_effect + self.attack[hi] - self.defence[ai]),
            np.exp(self.mu + self.attack[ai] - self.defence[hi]),
        )

    def predict(self, home: Sequence[str], away: Sequence[str], *, neutral: Sequence[bool]) -> pd.DataFrame:
        lam_h, lam_a = self.expected_goals(home, away, neutral=neutral)
        return outcome_table(lam_h.tolist(), lam_a.tolist(), self.rho, CONFIG.max_goals)


def utc_column(values: pd.Series) -> pd.Series:
    if any(pd.isna(value) or pd.Timestamp(value).tzinfo is None for value in values):
        raise ValueError("History timestamps require a timezone and explicit UTC availability")
    return pd.to_datetime(values, utc=True)


def fit(history: pd.DataFrame, cutoff: datetime, *, teams: Iterable[str] = ()) -> EuropeanModel:
    stamp = pd.Timestamp(cutoff)
    if stamp.tzinfo is None:
        raise ValueError("Cutoff requires a timezone")
    if history["id"].isna().any() or history["id"].duplicated().any():
        raise ValueError("History game identity missing or repeated")
    dates, available = utc_column(history["date"]), utc_column(history["availableAt"])
    if (available < dates).any():
        raise ValueError("Result availability precedes kickoff")
    train = history[
        (dates < stamp) & (available < stamp) & (dates >= stamp - pd.Timedelta(days=CONFIG.window_days))
    ].copy()
    if train.empty:
        raise ValueError("No reviewed pre-lock European results")
    if train[["home", "away", "hg", "ag", "neutral"]].isna().any().any():
        raise ValueError("Unknown club, regulation result or venue context")
    if any(not isinstance(v, bool | np.bool_) for v in train["neutral"]):
        raise ValueError("Venue context must be boolean")
    for side in ("hg", "ag"):
        if any(isinstance(v, bool | np.bool_) or not isinstance(v, Real) for v in train[side]):
            raise ValueError("Regulation goals must be numeric integers, never booleans")
        values = train[side].to_numpy(dtype=float)
        if not np.isfinite(values).all() or (values < 0).any() or (values != np.floor(values)).any():
            raise ValueError("Regulation goals must be finite nonnegative integers")
    team_list = tuple(sorted(set(teams) | set(train["home"]) | set(train["away"])))
    index = {team: i for i, team in enumerate(team_list)}
    data = EuropeanFitData(
        len(team_list),
        train["home"].map(index).to_numpy(),
        train["away"].map(index).to_numpy(),
        np.exp(-CONFIG.xi * (stamp - dates.loc[train.index]).dt.total_seconds().to_numpy() / 86400),
        train["hg"].to_numpy(dtype=float),
        train["ag"].to_numpy(dtype=float),
        1 - train["neutral"].to_numpy(dtype=float),
        CONFIG.ridge,
    )
    mu = np.log(max(float(np.average((data.hg + data.ag) / 2, weights=data.weights)), 0.1))
    start = np.r_[mu, 0.0, np.zeros(2 * data.n)]
    result = minimize(objective, start, args=(data,), jac=True, method="L-BFGS-B")
    if not result.success or not np.isfinite(result.x).all():
        raise ValueError("European goals fit failed to converge")
    mu, home_adv = result.x[:2]
    attack, defence = result.x[2 : 2 + data.n], result.x[2 + data.n :]
    attack = attack.mean() + CONFIG.spread * (attack - attack.mean())
    defence = defence.mean() + CONFIG.spread * (defence - defence.mean())
    rates = np.exp(home_adv * data.home_effect + attack[data.home] - defence[data.away]) + np.exp(
        attack[data.away] - defence[data.home]
    )
    goals = float(np.sum(data.weights * (data.hg + data.ag)))
    total = float(np.sum(data.weights * rates))
    if goals > 0 and total > 0:
        mu = np.log(goals / total)
    model = EuropeanModel(team_list, float(mu), float(home_adv), attack, defence, 0.0)
    lam_h, lam_a = model.expected_goals(
        list(train["home"]), list(train["away"]), neutral=[bool(v) for v in train["neutral"]]
    )
    masks = {cell: (data.hg == cell[0]) & (data.ag == cell[1]) for cell in ((0, 0), (0, 1), (1, 0), (1, 1))}

    def rho_nll(rho: float) -> float:
        factors = dc_adjustments(lam_h, lam_a, rho)
        return -float(
            sum(
                np.sum(data.weights[mask] * np.log(np.clip(factors[cell][mask], 1e-10, None)))
                for cell, mask in masks.items()
            )
        )

    rho_fit = minimize_scalar(rho_nll, bounds=(-0.25, 0.25), method="bounded")
    if not rho_fit.success or not np.isfinite(rho_fit.fun):
        raise ValueError("European low-score fit failed")
    model.rho = float(rho_fit.x)
    return model
