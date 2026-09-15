"""Bookmaker odds → fair probabilities, and the team markets the board shows.

Bookmakers only price win/draw/loss and total goals for most LaLiga games. Clean sheet, "team scores"
and "concedes 2+" come from the goal rates that reproduce those prices: fit a home and an away Poisson
rate to the fair 1X2 (and over/under 2.5 when available), then read the team markets off them. Every
price the board shows is therefore a fair (margin-free) market price, not our model.
"""

from __future__ import annotations

import math
from dataclasses import dataclass
from statistics import median

from scipy.optimize import minimize

MAX_GOALS = 10  # P(more than 10 goals for one side) is negligible for football rates
RATE_BOUNDS = (math.log(0.05), math.log(6.0))  # goal rates a football match can plausibly have
# Squared error left after fitting. Poisson under-prices draws, so tight real matches leave ~1e-3; far above that
# (e.g. a 90% draw) the prices don't describe a football match at all.
MAX_FIT_ERROR = 1e-2


@dataclass(frozen=True)
class MarketLine:
    """Consensus fair probabilities for one match, from the home side."""

    home: float
    draw: float
    away: float
    over_2_5: float | None
    bookmakers: int


@dataclass(frozen=True)
class TeamMarket:
    """One side's markets, as fair probabilities."""

    win: float
    draw: float
    loss: float
    scores: float  # scores at least once
    scores_2plus: float
    clean_sheet: float
    concedes_2plus: float


def fair_probabilities(prices: list[float]) -> list[float]:
    """Remove the bookmaker margin by normalising implied probabilities (proportional method)."""
    if not prices or any(price <= 1.0 for price in prices):
        raise ValueError(f"decimal prices must all be above 1.0: {prices}")
    implied = [1.0 / price for price in prices]
    total = sum(implied)
    return [p / total for p in implied]


def consensus(h2h: list[tuple[float, float, float]], totals: list[tuple[float, float]]) -> MarketLine | None:
    """Median fair probabilities across bookmakers. `h2h` rows are (home, draw, away) prices,
    `totals` rows (over 2.5, under 2.5) prices. None when no bookmaker priced the result."""
    rows = []
    for prices in h2h:
        try:
            rows.append(fair_probabilities(list(prices)))
        except ValueError:
            continue
    if not rows:
        return None
    home, draw, away = (median(row[i] for row in rows) for i in range(3))
    scale = home + draw + away  # medians of normalised rows need not add up to exactly 1
    overs = []
    for over, under in totals:
        try:
            overs.append(fair_probabilities([over, under])[0])
        except ValueError:
            continue
    return MarketLine(
        home=home / scale,
        draw=draw / scale,
        away=away / scale,
        over_2_5=median(overs) if overs else None,
        bookmakers=len(rows),
    )


def _poisson(rate: float) -> list[float]:
    return [math.exp(-rate) * rate**k / math.factorial(k) for k in range(MAX_GOALS + 1)]


def match_probabilities(home_rate: float, away_rate: float) -> tuple[float, float, float, float]:
    """(home win, draw, away win, over 2.5) for independent Poisson goal counts."""
    home, away = _poisson(home_rate), _poisson(away_rate)
    home_win = draw = away_win = under = 0.0
    for i, ph in enumerate(home):
        for j, pa in enumerate(away):
            p = ph * pa
            if i > j:
                home_win += p
            elif i == j:
                draw += p
            else:
                away_win += p
            if i + j <= 2:
                under += p
    total = home_win + draw + away_win
    return home_win / total, draw / total, away_win / total, 1 - under / total


def fit_goal_rates(line: MarketLine) -> tuple[float, float]:
    """Home and away goal rates whose Poisson match reproduces the market's fair prices."""

    def loss(params: list[float]) -> float:
        home, draw, away, over = match_probabilities(math.exp(params[0]), math.exp(params[1]))
        error = (home - line.home) ** 2 + (draw - line.draw) ** 2 + (away - line.away) ** 2
        if line.over_2_5 is not None:
            error += (over - line.over_2_5) ** 2
        return error

    # Nelder-Mead can stall on a lopsided market from a single start (a bound clips its simplex), so try a level
    # match and both kinds of favourite and keep the best fit.
    starts = [(1.4, 1.1), (2.4, 0.7), (0.7, 2.4)]
    result = min(
        (
            minimize(
                loss,
                [math.log(home), math.log(away)],
                method="Nelder-Mead",
                bounds=[RATE_BOUNDS, RATE_BOUNDS],
                options={"xatol": 1e-7, "fatol": 1e-14, "maxiter": 4000},
            )
            for home, away in starts
        ),
        key=lambda fit: fit.fun,
    )
    if not math.isfinite(result.fun) or result.fun > MAX_FIT_ERROR:
        raise ValueError(f"goal rates don't reproduce the prices (error {result.fun:.2g})")
    low, high = RATE_BOUNDS
    return math.exp(min(max(result.x[0], low), high)), math.exp(min(max(result.x[1], low), high))


def team_market(line: MarketLine, goals_for: float, goals_against: float, venue: str) -> TeamMarket:
    """The market from one side: result from the consensus prices, goal markets from the fitted rates."""
    win, loss = (line.home, line.away) if venue == "H" else (line.away, line.home)
    none_for, none_against = math.exp(-goals_for), math.exp(-goals_against)
    return TeamMarket(
        win=win,
        draw=line.draw,
        loss=loss,
        scores=1 - none_for,
        scores_2plus=1 - none_for * (1 + goals_for),
        clean_sheet=none_against,
        concedes_2plus=1 - none_against * (1 + goals_against),
    )
