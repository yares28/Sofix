"""Forecasting methods compared in the backtest.

Every method has the same shape: given the match history before `cutoff`, the upcoming
matches and the season's promoted teams, return one row per upcoming match with
p_h, p_d, p_a (and cs_h, cs_a, lam_h, lam_a where the method produces them).
"""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass

import numpy as np
import pandas as pd

from app.modeling.dixon_coles import DixonColesConfig, fit_dixon_coles
from app.services.elo import update_pair
from app.services.market_blend import log_pool
from app.services.scoring import normalize_probs

Predict = Callable[[pd.DataFrame, pd.Timestamp, pd.DataFrame, frozenset[str]], pd.DataFrame]


@dataclass(frozen=True)
class Method:
    name: str
    predict: Predict


def dixon_coles(name: str, config: DixonColesConfig) -> Method:
    def predict(
        history: pd.DataFrame, cutoff: pd.Timestamp, targets: pd.DataFrame, promoted: frozenset[str]
    ) -> pd.DataFrame:
        teams = set(targets["home"]) | set(targets["away"])
        model = fit_dixon_coles(history, cutoff, teams=teams, promoted=promoted, config=config)
        return model.predict(targets["home"], targets["away"])

    return Method(name, predict)


PRE_ODDS_COLUMNS = ("odds_pre_h", "odds_pre_d", "odds_pre_a")


def blend_with_market(
    table: pd.DataFrame,
    targets: pd.DataFrame,
    cutoff: pd.Timestamp,
    weight: float,
    horizon_weeks: int,
    columns: tuple[str, str, str] = PRE_ODDS_COLUMNS,
) -> pd.DataFrame:
    """Move win/draw/loss toward the bookmakers for matches within `horizon_weeks` of the cutoff.

    Prices carry team news the model can't see, but only for games close enough to be priced. Matches
    further out, or without a complete price, keep the pure model forecast. Only win/draw/loss moves:
    the difficulty score reads those, while the goal rates and clean sheets stay the model's.

    `columns` must be pre-closing prices. The closing line is the backtest's ceiling: it is set minutes
    before kickoff, so a method that ships must never see it.
    """
    prices = targets.reindex(columns=list(columns)).to_numpy(dtype=float)
    weeks = (targets["date"] - pd.Timestamp(cutoff)).dt.days.to_numpy() // 7 + 1
    usable = np.isfinite(prices).all(axis=1) & (prices > 1).all(axis=1) & (weeks <= horizon_weeks)
    if usable.any():
        implied = 1 / prices[usable]
        market = implied / implied.sum(axis=1, keepdims=True)
        probs = table.loc[usable, ["p_h", "p_d", "p_a"]].to_numpy(dtype=float)
        table.loc[usable, ["p_h", "p_d", "p_a"]] = log_pool(probs, market, weight)
    return table


def market_blend(
    name: str,
    config: DixonColesConfig,
    weight: float,
    horizon_weeks: int = 1,
    columns: tuple[str, str, str] = PRE_ODDS_COLUMNS,
) -> Method:
    """Dixon-Coles, blended with bookmaker prices near the cutoff (see `blend_with_market`)."""

    def predict(
        history: pd.DataFrame, cutoff: pd.Timestamp, targets: pd.DataFrame, promoted: frozenset[str]
    ) -> pd.DataFrame:
        teams = set(targets["home"]) | set(targets["away"])
        model = fit_dixon_coles(history, cutoff, teams=teams, promoted=promoted, config=config)
        table = model.predict(targets["home"], targets["away"])
        return blend_with_market(table, targets, cutoff, weight, horizon_weeks, columns)

    return Method(name, predict)


def base_rates(lookback_days: int = 730) -> Method:
    """League-wide home/draw/away frequencies. Knows nothing about the teams."""

    def predict(
        history: pd.DataFrame, cutoff: pd.Timestamp, targets: pd.DataFrame, promoted: frozenset[str]
    ) -> pd.DataFrame:
        recent = history[history["date"] >= cutoff - pd.Timedelta(days=lookback_days)]
        hg, ag = recent["hg"], recent["ag"]
        row = {
            "p_h": (hg > ag).mean(),
            "p_d": (hg == ag).mean(),
            "p_a": (hg < ag).mean(),
            "cs_h": (ag == 0).mean(),
            "cs_a": (hg == 0).mean(),
            "lam_h": hg.mean(),
            "lam_a": ag.mean(),
        }
        return pd.DataFrame([row] * len(targets))

    return Method("Base rates", predict)


def elo_fallback() -> Method:
    """Baseline from the original scaffold: internal Elo with a hand-tuned linear mapping to W/D/L."""

    def predict(
        history: pd.DataFrame, cutoff: pd.Timestamp, targets: pd.DataFrame, promoted: frozenset[str]
    ) -> pd.DataFrame:
        ratings: dict[str, float] = {}
        for home, away, hg, ag in history[["home", "away", "hg", "ag"]].itertuples(index=False):
            new_home, new_away, _ = update_pair(ratings.get(home, 1500.0), ratings.get(away, 1500.0), hg, ag)
            ratings[home], ratings[away] = new_home, new_away
        rows = []
        for home, away in targets[["home", "away"]].itertuples(index=False):
            x = np.clip((ratings.get(home, 1500.0) + 65 - ratings.get(away, 1500.0)) / 400, -2, 2)
            p_h, p_d, p_a = normalize_probs(0.33 + 0.22 * x, 0.34 - 0.05 * abs(x), 0.33 - 0.22 * x)
            rows.append({"p_h": p_h, "p_d": p_d, "p_a": p_a})
        return pd.DataFrame(rows).assign(cs_h=np.nan, cs_a=np.nan, lam_h=np.nan, lam_a=np.nan)

    return Method("Elo (current fallback)", predict)


def closing_odds() -> Method:
    """Bookmaker closing prices, margin removed. A ceiling: only known minutes before kickoff."""

    def predict(
        history: pd.DataFrame, cutoff: pd.Timestamp, targets: pd.DataFrame, promoted: frozenset[str]
    ) -> pd.DataFrame:
        implied = 1 / targets[["odds_h", "odds_d", "odds_a"]].to_numpy(dtype=float)
        probs = implied / implied.sum(axis=1, keepdims=True)
        return pd.DataFrame(probs, columns=["p_h", "p_d", "p_a"]).assign(
            cs_h=np.nan, cs_a=np.nan, lam_h=np.nan, lam_a=np.nan
        )

    return Method("Closing odds (ceiling)", predict)
