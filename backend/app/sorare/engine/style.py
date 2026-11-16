"""E2 · the opponent's style, home or away, and the game state (plans/score-engine.md §3 step 4, §7 E2).

Before each game is added to the `Book`, every starter's counts are set against what his own rates said for his minutes. Summed by the
opposing club and his role, that is the club's style: what players in that role made against it ÷ what the same players usually make,
so "its opponents are weak" cancels out and only the club's effect is left. It is pulled towards 1 by `m` games' worth (fitted per
stat), older games weighing less. The same sums by home or away give the venue's factor.

The game state is a factor exp(b_for × (his side's expected goals − its usual) + b_against × (expected goals against − its usual)) per
position and stat (his rates already hold his side's usual game, so only tonight's difference from it moves them), fitted on the tuning
seasons (a Poisson fit with what he was expected to make as the offset). A stat the scoreline does not move
ends with b ≈ 0, nothing assumed.
"""

from __future__ import annotations

import math
from collections import defaultdict
from dataclasses import dataclass, field
from typing import Any

import numpy as np

from app.sorare.engine import allround
from app.sorare.engine.allround import STATS, Book

STYLE_TAU = 365.0  # days
MEAN_GOALS = 1.35  # a side's usual expected goals before it has a forecast game
_N = len(STATS)
FREE = np.array(
    [s not in allround.MATCH for s in STATS]
)  # goals conceded and the clean sheet come from the match itself


@dataclass(frozen=True)
class StyleSettings:
    m_club: np.ndarray  # games' worth of "no effect" each club's factor is pulled towards, per stat
    m_venue: np.ndarray
    state: dict[str, np.ndarray] = field(
        default_factory=dict
    )  # per position: (2, stats) coefficients on goals for and against

    def to_json(self) -> dict[str, Any]:
        return {
            "m_club": dict(zip(STATS, map(float, self.m_club), strict=True)),
            "m_venue": dict(zip(STATS, map(float, self.m_venue), strict=True)),
            "state": {
                pos: {s: [float(b[0, i]), float(b[1, i])] for i, s in enumerate(STATS)} for pos, b in self.state.items()
            },
        }

    @staticmethod
    def from_json(raw: dict[str, Any]) -> StyleSettings:
        return StyleSettings(
            m_club=np.array([float(raw["m_club"].get(s, 1e9)) for s in STATS]),
            m_venue=np.array([float(raw["m_venue"].get(s, 1e9)) for s in STATS]),
            state={
                pos: np.array(
                    [[float(b.get(s, (0, 0))[0]) for s in STATS], [float(b.get(s, (0, 0))[1]) for s in STATS]]
                )
                for pos, b in (raw.get("state") or {}).items()
            },
        )


def neutral() -> StyleSettings:
    return StyleSettings(m_club=np.full(_N, 1e9), m_venue=np.full(_N, 1e9))


class _Sum:
    """Made (a) against expected (e) and games (n), older ones weighing less."""

    __slots__ = ("a", "e", "n", "t")

    def __init__(self) -> None:
        self.a = np.zeros(_N)
        self.e = np.zeros(_N)
        self.n = 0.0
        self.t = -math.inf

    def now(self, t: float) -> tuple[np.ndarray, np.ndarray, float]:
        f = 1.0 if self.t == -math.inf else math.exp(-max(0.0, t - self.t) / STYLE_TAU)
        return self.a * f, self.e * f, self.n * f

    def add(self, t: float, made: np.ndarray, expected: np.ndarray) -> None:
        a, e, n = self.now(t)
        self.a, self.e, self.n, self.t = a + made, e + expected, n + 1, t

    def factor(self, t: float, m: np.ndarray) -> np.ndarray:
        a, e, n = self.now(t)
        if n <= 0:
            return np.ones(_N)
        prior = m * e / n  # m games' worth of what was expected
        return np.divide(a + prior, e + prior, out=np.ones(_N), where=(e + prior) > 0)


class Style:
    """The clubs' and the venues' factors so far (see the module's doc)."""

    def __init__(self, settings: StyleSettings) -> None:
        self.settings = settings
        self.clubs: dict[tuple[str, str], _Sum] = defaultdict(_Sum)
        self.venues: dict[tuple[bool, str], _Sum] = defaultdict(_Sum)
        self.teams: dict[
            str, list[float]
        ] = {}  # per club: expected goals for and against, and games, older ones weighing less (`t` last)

    def usual(self, team: str, t: float) -> tuple[float, float]:
        """His side's usual expected goals for and against, pulled towards 1.35 by three games."""
        xf, xa, n, last = self.teams.get(team, (0.0, 0.0, 0.0, t))
        f = math.exp(-max(0.0, t - last) / STYLE_TAU)
        return (xf * f + 3 * MEAN_GOALS) / (n * f + 3), (xa * f + 3 * MEAN_GOALS) / (n * f + 3)

    def _team(self, team: str, t: float, xgf: float, xga: float) -> None:
        xf, xa, n, last = self.teams.get(team, (0.0, 0.0, 0.0, t))
        f = math.exp(-max(0.0, t - last) / STYLE_TAU)
        self.teams[team] = [xf * f + xgf, xa * f + xga, n * f + 1, t]

    def observe(self, game: dict[str, Any], book: Book) -> None:
        """Set this game's starters against their rates (call before `book.add(game)`)."""
        t = allround.day_of(game["date"])
        role_of = allround.starters(game)
        home_slug, away_slug = game["home"]["slug"], game["away"]["slug"]
        for slug, row in game["players"].items():
            mins = float(row.get("mins") or 0)
            if not row.get("started") or mins <= 0 or slug not in book.players:
                continue
            role = role_of.get(slug) or book.usual_role(slug, row.get("pos") or "")
            expected = book.rate(slug, role, t) * mins / 90.0 * FREE
            made = allround.counts_of(row) * FREE
            home = row["team"] == home_slug
            self.clubs[(away_slug if home else home_slug, role)].add(t, made, expected)
            self.venues[(home, role)].add(t, made, expected)
        forecast = (game.get("ctx") or {}).get("forecast")
        if forecast:
            self._team(home_slug, t, float(forecast["lam_h"]), float(forecast["lam_a"]))
            self._team(away_slug, t, float(forecast["lam_a"]), float(forecast["lam_h"]))

    def club(self, opponent: str, role: str, t: float) -> np.ndarray:
        found = self.clubs.get((opponent, role))
        return np.ones(_N) if found is None else found.factor(t, self.settings.m_club)

    def venue(self, home: bool, role: str, t: float) -> np.ndarray:
        found = self.venues.get((home, role))
        return np.ones(_N) if found is None else found.factor(t, self.settings.m_venue)

    def state(self, pos: str, d_for: float, d_against: float) -> np.ndarray:
        """`d_for`, `d_against`: tonight's expected goals for and against minus his side's usual."""
        b = self.settings.state.get(pos)
        if b is None:
            return np.ones(_N)
        return np.exp(b[0] * d_for + b[1] * d_against) * FREE + ~FREE

    def factor(
        self, opponent: str, team: str, home: bool, role: str, pos: str, xgf: float, xga: float, t: float
    ) -> np.ndarray:
        """What this game does to each of his stats, as a multiplier on his rate (1 for goals conceded and the clean sheet)."""
        usual_for, usual_against = self.usual(team, t)
        return (
            self.club(opponent, role, t)
            * self.venue(home, role, t)
            * self.state(pos, xgf - usual_for, xga - usual_against)
        )


def fit_state(x: np.ndarray, offset: np.ndarray, y: np.ndarray, ridge: float = 20.0) -> np.ndarray:
    """Per stat, (b_for, b_against) of a Poisson fit log μ = log offset + b · x, by Newton's method with a ridge towards 0.

    x: (n, 2) centred goals for and against; offset, y: (n, stats). Returns (2, stats)."""
    out = np.zeros((2, y.shape[1]))
    for j in range(y.shape[1]):
        if y[:, j].sum() < 30:
            continue
        b = np.zeros(2)
        for _ in range(25):
            mu = offset[:, j] * np.exp(x @ b)
            grad = x.T @ (y[:, j] - mu) - ridge * b
            hess = (x * mu[:, None]).T @ x + ridge * np.eye(2)
            b = b + np.linalg.solve(hess, grad)
        out[:, j] = b
    return out
