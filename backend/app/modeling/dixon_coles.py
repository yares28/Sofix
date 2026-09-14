"""Time-decayed Dixon-Coles goals model.

    log λ_home = μ + home_adv + attack[home] − defence[away]
    log λ_away = μ + attack[away] − defence[home]

- Recent matches weigh more: weight = exp(−xi · days_before_cutoff). This is how "form" enters.
- Ratings are pulled toward a prior with an L2 penalty: 0 for established teams,
  `promoted_prior` for newly promoted ones. This also stabilises the start of a season.
  (Ratings centre on the mean prior, so "0" is league average only approximately.)
- The fitting target blends real goals with a shots-on-target xG proxy, which is less noisy.
- A Dixon-Coles correction (rho) adjusts the 0-0 / 0-1 / 1-0 / 1-1 scorelines.
"""

from __future__ import annotations

import warnings
from collections.abc import Iterable, Sequence
from dataclasses import dataclass, field

import numpy as np
import pandas as pd
from scipy.optimize import minimize, minimize_scalar
from scipy.stats import poisson

OUTCOME_COLUMNS = ["lam_h", "lam_a", "p_h", "p_d", "p_a", "cs_h", "cs_a"]


@dataclass(frozen=True)
class DixonColesConfig:
    xi: float = 0.002  # time decay per day (0 = every match counts equally)
    goals_weight: float = 0.7  # 1.0 = goals only, 0.0 = shots-on-target proxy only
    ridge: float = 2.0  # strength of the pull toward the prior
    promoted_prior: float = -0.2  # prior attack and defence rating for promoted teams
    window_days: int = 730  # ignore matches older than this
    max_goals: int = 10


def dc_adjustments(lam_h: np.ndarray, lam_a: np.ndarray, rho: float) -> dict[tuple[int, int], np.ndarray]:
    """Dixon-Coles multipliers for the (home goals, away goals) cells they change."""
    return {
        (0, 0): 1 - lam_h * lam_a * rho,
        (0, 1): 1 + lam_h * rho,
        (1, 0): 1 + lam_a * rho,
        (1, 1): np.full_like(lam_h, 1 - rho, dtype=float),
    }


def score_matrix(lam_h: np.ndarray, lam_a: np.ndarray, rho: float, max_goals: int) -> np.ndarray:
    """P(home scores i, away scores j) for each match, shape (n, max_goals+1, max_goals+1)."""
    lam_h, lam_a = np.asarray(lam_h, dtype=float), np.asarray(lam_a, dtype=float)
    goals = np.arange(max_goals + 1)
    ph = poisson.pmf(goals[None, :], lam_h[:, None])
    pa = poisson.pmf(goals[None, :], lam_a[:, None])
    matrix = ph[:, :, None] * pa[:, None, :]
    for (i, j), factor in dc_adjustments(lam_h, lam_a, rho).items():
        matrix[:, i, j] *= factor
    matrix = np.clip(matrix, 0.0, None)
    return matrix / matrix.sum(axis=(1, 2), keepdims=True)


def outcome_table(
    lam_h: Sequence[float], lam_a: Sequence[float], rho: float = 0.0, max_goals: int = 10
) -> pd.DataFrame:
    """Win/draw/loss and clean-sheet probabilities from expected goals."""
    lam_h = np.asarray(lam_h, dtype=float)
    lam_a = np.asarray(lam_a, dtype=float)
    matrix = score_matrix(lam_h, lam_a, rho, max_goals)
    return pd.DataFrame(
        {
            "lam_h": lam_h,
            "lam_a": lam_a,
            "p_h": np.tril(matrix, -1).sum(axis=(1, 2)),
            "p_d": np.trace(matrix, axis1=1, axis2=2),
            "p_a": np.triu(matrix, 1).sum(axis=(1, 2)),
            "cs_h": matrix[:, :, 0].sum(axis=1),  # away team scores 0
            "cs_a": matrix[:, 0, :].sum(axis=1),  # home team scores 0
        }
    )


@dataclass
class DixonColesModel:
    teams: tuple[str, ...]
    mu: float
    home_adv: float
    attack: np.ndarray
    defence: np.ndarray
    rho: float
    config: DixonColesConfig
    _index: dict[str, int] = field(init=False, repr=False)

    def __post_init__(self) -> None:
        self._index = {team: i for i, team in enumerate(self.teams)}

    def _indices(self, names: Iterable[str]) -> np.ndarray:
        try:
            return np.array([self._index[name] for name in names], dtype=int)
        except KeyError as exc:
            raise KeyError(f"team {exc.args[0]!r} was not part of the fit") from exc

    def expected_goals(self, home: Sequence[str], away: Sequence[str]) -> tuple[np.ndarray, np.ndarray]:
        hi, ai = self._indices(home), self._indices(away)
        lam_h = np.exp(self.mu + self.home_adv + self.attack[hi] - self.defence[ai])
        lam_a = np.exp(self.mu + self.attack[ai] - self.defence[hi])
        return lam_h, lam_a

    def predict(self, home: Sequence[str], away: Sequence[str]) -> pd.DataFrame:
        lam_h, lam_a = self.expected_goals(home, away)
        return outcome_table(lam_h, lam_a, self.rho, self.config.max_goals)

    def ratings(self) -> pd.DataFrame:
        table = pd.DataFrame({"team": self.teams, "attack": self.attack, "defence": self.defence})
        table["overall"] = table["attack"] + table["defence"]
        return table.sort_values("overall", ascending=False, ignore_index=True)


def blended_targets(matches: pd.DataFrame, goals_weight: float) -> tuple[np.ndarray, np.ndarray]:
    """Blend goals with shots on target × league conversion rate, where shot data exists."""
    hg = matches["hg"].to_numpy(dtype=float)
    ag = matches["ag"].to_numpy(dtype=float)
    if goals_weight >= 1.0 or "hst" not in matches or "ast" not in matches:
        return hg, ag
    hst = matches["hst"].to_numpy(dtype=float)
    ast = matches["ast"].to_numpy(dtype=float)
    has_shots = ~(np.isnan(hst) | np.isnan(ast))
    shots_total = hst[has_shots].sum() + ast[has_shots].sum()
    if shots_total <= 0:
        return hg, ag
    conversion = (hg[has_shots].sum() + ag[has_shots].sum()) / shots_total
    yh = np.where(has_shots, goals_weight * hg + (1 - goals_weight) * np.nan_to_num(hst) * conversion, hg)
    ya = np.where(has_shots, goals_weight * ag + (1 - goals_weight) * np.nan_to_num(ast) * conversion, ag)
    return yh, ya


@dataclass(frozen=True)
class FitData:
    """Everything the objective needs, in index form."""

    n_teams: int
    home_idx: np.ndarray
    away_idx: np.ndarray
    weights: np.ndarray
    home_target: np.ndarray
    away_target: np.ndarray
    prior: np.ndarray
    ridge: float


def objective(theta: np.ndarray, data: FitData) -> tuple[float, np.ndarray]:
    """Penalised Poisson negative log-likelihood and its gradient.

    theta = [mu, home_adv, attack_0..n-1, defence_0..n-1]. Constant terms are dropped, which
    keeps it valid for the non-integer blended targets.
    """
    n, hi, ai, w = data.n_teams, data.home_idx, data.away_idx, data.weights
    mu, home_adv = theta[0], theta[1]
    attack, defence = theta[2 : 2 + n], theta[2 + n :]
    eta_h = mu + home_adv + attack[hi] - defence[ai]
    eta_a = mu + attack[ai] - defence[hi]
    lam_h, lam_a = np.exp(eta_h), np.exp(eta_a)
    nll = np.sum(w * (lam_h - data.home_target * eta_h)) + np.sum(w * (lam_a - data.away_target * eta_a))
    penalty = data.ridge * (np.sum((attack - data.prior) ** 2) + np.sum((defence - data.prior) ** 2))

    rh, ra = w * (lam_h - data.home_target), w * (lam_a - data.away_target)
    grad = np.empty_like(theta)
    grad[0] = rh.sum() + ra.sum()
    grad[1] = rh.sum()
    grad[2 : 2 + n] = np.bincount(hi, rh, n) + np.bincount(ai, ra, n) + 2 * data.ridge * (attack - data.prior)
    grad[2 + n :] = -np.bincount(ai, rh, n) - np.bincount(hi, ra, n) + 2 * data.ridge * (defence - data.prior)
    return nll + penalty, grad


def fit_dixon_coles(
    matches: pd.DataFrame,
    cutoff: pd.Timestamp,
    teams: Iterable[str] = (),
    promoted: Iterable[str] = (),
    config: DixonColesConfig = DixonColesConfig(),
) -> DixonColesModel:
    """Fit on matches played strictly before `cutoff`.

    `teams` lists teams that must be predictable even without recent matches (e.g. promoted
    sides); they fall back to their prior.
    """
    cutoff = pd.Timestamp(cutoff)
    window_start = cutoff - pd.Timedelta(days=config.window_days)
    train = matches[(matches["date"] < cutoff) & (matches["date"] >= window_start)]
    if train.empty:
        raise ValueError(f"no matches in the {config.window_days} days before {cutoff.date()}")

    promoted = set(promoted)
    team_list = tuple(sorted(set(teams) | set(train["home"]) | set(train["away"])))
    index = {team: i for i, team in enumerate(team_list)}
    n = len(team_list)
    yh, ya = blended_targets(train, config.goals_weight)
    data = FitData(
        n_teams=n,
        home_idx=train["home"].map(index).to_numpy(),
        away_idx=train["away"].map(index).to_numpy(),
        weights=np.exp(-config.xi * (cutoff - train["date"]).dt.days.to_numpy(dtype=float)),
        home_target=yh,
        away_target=ya,
        prior=np.array([config.promoted_prior if team in promoted else 0.0 for team in team_list]),
        ridge=config.ridge,
    )

    all_weights = np.concatenate([data.weights, data.weights])
    mean_goals = max(np.average(np.concatenate([yh, ya]), weights=all_weights), 0.1)
    theta0 = np.concatenate([[np.log(mean_goals), 0.0], data.prior, data.prior])
    result = minimize(objective, theta0, args=(data,), jac=True, method="L-BFGS-B")
    if not result.success:
        warnings.warn(
            f"Dixon-Coles fit at {cutoff.date()} did not converge: {result.message}", RuntimeWarning, stacklevel=2
        )

    theta = result.x
    model = DixonColesModel(
        teams=team_list,
        mu=float(theta[0]),
        home_adv=float(theta[1]),
        attack=theta[2 : 2 + n].copy(),
        defence=theta[2 + n :].copy(),
        rho=0.0,
        config=config,
    )
    model.rho = _fit_rho(model, train, data.weights)
    return model


def _fit_rho(model: DixonColesModel, train: pd.DataFrame, weights: np.ndarray) -> float:
    """Low-score correction, fitted on real (integer) scorelines given the fitted goal rates."""
    lam_h, lam_a = model.expected_goals(train["home"], train["away"])
    hg, ag = train["hg"].to_numpy(), train["ag"].to_numpy()
    masks = {cell: (hg == cell[0]) & (ag == cell[1]) for cell in [(0, 0), (0, 1), (1, 0), (1, 1)]}

    def nll(rho: float) -> float:
        factors = dc_adjustments(lam_h, lam_a, rho)
        return -sum(
            np.sum(weights[mask] * np.log(np.clip(factors[cell][mask], 1e-10, None))) for cell, mask in masks.items()
        )

    return float(minimize_scalar(nll, bounds=(-0.25, 0.25), method="bounded").x)
