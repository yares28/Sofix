"""A defender's, midfielder's or forward's score if he starts, from his game (plans/xscore.md P9 X4; roadmap 10.4).

Today's number is the mean of his last five starts. Over two LaLiga seasons a number that knows the game does better for every outfield position:
his side's chance of a clean sheet and the goals it is expected to score and concede (the football model, moved by the bookmakers' goals line),
home or away, Sorare's own projection once it is out, and his own record (how often his starts reached a decisive score of 60, and his mean score,
each pulled towards the norm while he has few). One line per position, fitted on every start of the games export (`app.jobs.outfield_fit`, into
`artifacts/outfield_score.json`) and tested walk-forward: each week predicted from the weeks before it only.

Unlike a keeper, a forward's or a midfielder's own record is worth having: his rate of goals and assists is his own.
"""

from __future__ import annotations

import json
from collections import defaultdict
from collections.abc import Sequence
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import numpy as np

from app.sorare.keeper import MIN_STARTS, SPREAD_SCALE, GameNumbers, Outcome, adjusted_goals

ARTIFACT = Path(__file__).resolve().parents[2] / "artifacts" / "outfield_score.json"
POSITIONS = ("DEF", "MID", "FWD")
FEATURES = ("cs", "xgf", "xga", "home", "own_dec", "own_score")  # `proj` goes in last when Sorare has one
PRIOR_GAMES = 8.0  # his own record counts as this many starts' worth of the norm while he has few
PRIOR_DECISIVE = 0.12  # a start reaches a decisive score of 60 about one time in eight
PRIOR_SCORE = 45.0
RIDGE = 1.0
DECISIVE = 60.0
SUB_ARTIFACT = Path(__file__).resolve().parents[2] / "artifacts" / "sub_shape.json"
MIN_EACH = 12  # starts with and without a decisive action a position needs before its chance of one is fitted
# What each feature is called when it moves the number: the opponent's strength, his side's attack, his own form, home, Sorare's projection.
REASON_OF = {
    "cs": "Opponent",
    "xgf": "Attack",
    "xga": "Opponent",
    "home": "Home",
    "own_dec": "Form",
    "own_score": "Form",
    "proj": "Sorare",
}


def own_record(scores: Sequence[float]) -> tuple[float, float]:
    """How often his starts reached 60 and his mean score, each pulled towards the norm (`PRIOR_GAMES` starts' worth)."""
    n = len(scores)
    return (
        (sum(1 for s in scores if s >= DECISIVE) + PRIOR_GAMES * PRIOR_DECISIVE) / (n + PRIOR_GAMES),
        (sum(scores) + PRIOR_GAMES * PRIOR_SCORE) / (n + PRIOR_GAMES),
    )


def features(numbers: GameNumbers, home: bool, own_dec: float, own_score: float, proj: float | None) -> list[float]:
    cs, xga, xgf = adjusted_goals(numbers)
    base = [cs, xgf, xga, 1.0 if home else 0.0, own_dec, own_score]
    return base if proj is None else [*base, proj]


@dataclass(frozen=True)
class OutfieldStart:
    week: str
    date: datetime
    player: str
    pos: str
    numbers: GameNumbers
    home: bool
    proj: float | None
    own_dec: float
    own_score: float
    score: float
    decisive: bool = False  # a goal or an assist (his decisive level reached 60)


def starts_from_games(
    games: Sequence[dict[str, Any]], weeks: list[dict[str, str]] | None = None
) -> list[OutfieldStart]:
    """Every outfield start of the games export (each game joined to its forecast), oldest first, with his own record from the starts
    before it. A game with no forecast is left out (its starts still count in a player's later record)."""
    from app.sorare import backtest  # here: backtest reads forecast, which reads scores, which reads this module

    windows = backtest._windows(weeks)
    seen: dict[str, list[float]] = defaultdict(list)
    out: list[OutfieldStart] = []
    for game in sorted(games, key=lambda one: one["date"]):
        ctx = game.get("ctx") or {}
        forecast, price = ctx.get("forecast"), (ctx.get("ou") or {}).get("p_over")
        when = datetime.fromisoformat(game["date"].replace("Z", "+00:00")).astimezone(UTC)
        for slug, row in game["players"].items():
            if row["pos"] not in POSITIONS or not row["started"]:
                continue
            if forecast:
                home = row["team"] == game["home"]["slug"]
                own_dec, own_score = own_record(seen[slug])
                out.append(
                    OutfieldStart(
                        week=backtest._week_of(when, windows),
                        date=when,
                        player=slug,
                        pos=row["pos"],
                        numbers=GameNumbers(
                            cs=float(forecast["cs_h" if home else "cs_a"]),
                            xga=float(forecast["lam_a" if home else "lam_h"]),
                            xgf=float(forecast["lam_h" if home else "lam_a"]),
                            p_over=float(price) if price is not None and price == price else None,
                        ),
                        home=home,
                        proj=None if row.get("proj") is None else float(row["proj"]),
                        own_dec=own_dec,
                        own_score=own_score,
                        score=float(row["score"]),
                        decisive=float(row.get("level") or 0.0) >= DECISIVE,
                    )
                )
            seen[slug].append(float(row["score"]))
    return out


@dataclass(frozen=True)
class OutfieldModel:
    """One position's two lines: with Sorare's projection (`proj`, one more coefficient) and without (`bare`). Each is an intercept then a
    coefficient for each of `FEATURES`."""

    pos: str
    bare: tuple[float, ...]
    proj: tuple[float, ...]
    starts: int
    through: str | None = None
    # What the picture of his game is made of (`outcome`): the chance of a decisive action as a line on the log-odds of the same features, how
    # far a start with one scores above one without, how far each spreads, and the mean of every feature (what "a typical game" is).
    chance: tuple[float, ...] = ()
    gap: float = 0.0
    sd: tuple[float, float] = (0.0, 0.0)
    means: tuple[float, ...] = ()

    def outcome(
        self,
        numbers: GameNumbers,
        home: bool,
        own_dec: float,
        own_score: float,
        projection: float | None = None,
    ) -> Outcome:
        """His score if he starts, as `predict`, with the picture behind it: the chance of a decisive action, the two scores that add up to the
        number, where each lands, and what moves the number in points (the opponent, his side's attack, his form, home, Sorare's view)."""
        start = self.predict(numbers, home, own_dec, own_score, projection)
        x = np.array(features(numbers, home, own_dec, own_score, None))
        if self.chance:
            p = float(_sigmoid(self.chance[0] + np.dot(self.chance[1:], x)))
        else:
            p = min(0.9, max(0.02, own_dec))
        gap = self.gap or 25.0
        sd_dec, sd_plain = self.sd if self.sd[0] > 0 else (12.0, 12.0)
        if_dec = min(100.0, start + (1 - p) * gap)
        if_plain = max(0.0, start - p * gap)
        low, high = mixture_range(p, if_dec, sd_dec, if_plain, sd_plain)
        cs, _, _ = adjusted_goals(numbers)
        return Outcome(cs, p, if_dec, if_plain, start, low, high, sd_dec, sd_plain, self._why(x, projection))

    def _why(self, x: np.ndarray, projection: float | None) -> tuple[tuple[str, float], ...]:
        line = self.bare if projection is None else self.proj
        if len(self.means) < len(x) or (projection is not None and len(self.means) < len(x) + 1):
            return ()
        names = list(FEATURES)
        values = [float(v) for v in x]
        if projection is not None:
            names.append("proj")
            values.append(float(projection))
        found: dict[str, float] = defaultdict(float)
        for i, name in enumerate(names):
            found[REASON_OF[name]] += float(line[1 + i]) * (values[i] - self.means[i])
        return tuple(sorted(found.items(), key=lambda item: -abs(item[1])))

    def predict(
        self, numbers: GameNumbers, home: bool, own_dec: float, own_score: float, projection: float | None = None
    ) -> float:
        line = self.bare if projection is None else self.proj
        x = np.array(features(numbers, home, own_dec, own_score, projection))
        return float(min(100.0, max(0.0, line[0] + np.dot(line[1:], x))))


def _ridge(x: np.ndarray, y: np.ndarray) -> tuple[float, ...]:
    x1 = np.column_stack([np.ones(len(x)), x])
    penalty = RIDGE * np.eye(x1.shape[1])
    penalty[0, 0] = 0.0
    return tuple(float(v) for v in np.linalg.solve(x1.T @ x1 + penalty, x1.T @ y))


def fit(starts: Sequence[OutfieldStart], pos: str, through: str | None = None) -> OutfieldModel | None:
    """The line of one position, or None when it has too few starts to mean anything."""
    mine = [s for s in starts if s.pos == pos]
    if len(mine) < MIN_STARTS:
        return None
    bare = _ridge(
        np.array([features(s.numbers, s.home, s.own_dec, s.own_score, None) for s in mine]),
        np.array([s.score for s in mine]),
    )
    with_proj = [s for s in mine if s.proj is not None]
    if len(with_proj) < MIN_STARTS:
        proj = (*bare, 0.0)
    else:
        proj = _ridge(
            np.array([features(s.numbers, s.home, s.own_dec, s.own_score, s.proj) for s in with_proj]),
            np.array([s.score for s in with_proj]),
        )
    chance: tuple[float, ...] = ()
    gap, sd = 0.0, (0.0, 0.0)
    dec = np.array([s.decisive for s in mine], dtype=bool)
    score = np.array([s.score for s in mine])
    x_bare = np.array([features(s.numbers, s.home, s.own_dec, s.own_score, None) for s in mine])
    if dec.sum() >= MIN_EACH and (~dec).sum() >= MIN_EACH:
        chance = _logistic(x_bare, dec.astype(float))
        gap = float(score[dec].mean() - score[~dec].mean())
        sd = (float(score[dec].std()) * SPREAD_SCALE, float(score[~dec].std()) * SPREAD_SCALE)
    means = tuple(float(v) for v in x_bare.mean(axis=0))
    if len(with_proj) >= MIN_STARTS:
        means += (float(np.mean([s.proj for s in with_proj])),)
    return OutfieldModel(pos, bare, proj, len(mine), through, chance, gap, sd, means)


def _sigmoid(x: Any) -> Any:
    return 1 / (1 + np.exp(-x))


def _logistic(x: np.ndarray, y: np.ndarray) -> tuple[float, ...]:
    """The log-odds of `y` as a line in `x`, by Newton's method with a little ridge (the intercept is not held back)."""
    x1 = np.column_stack([np.ones(len(x)), x])
    penalty = np.eye(x1.shape[1])
    penalty[0, 0] = 0.0
    beta = np.zeros(x1.shape[1])
    beta[0] = float(np.log(max(1e-3, y.mean()) / max(1e-3, 1 - y.mean())))
    for _ in range(40):
        p = _sigmoid(x1 @ beta)
        beta = beta + np.linalg.solve(x1.T @ (x1 * (p * (1 - p))[:, None]) + penalty, x1.T @ (y - p) - penalty @ beta)
    return tuple(float(v) for v in beta)


def mixture_range(p: float, if_dec: float, sd_dec: float, if_plain: float, sd_plain: float) -> tuple[float, float]:
    """Where he lands 8 times in 10 (the 10th and 90th percentile) when a start is one of two bell curves: with a decisive action (chance `p`) or without."""
    xs = np.linspace(0, 100, 401)

    def bell(m: float, sd: float) -> Any:
        sd = max(sd, 1.0)
        return np.exp(-0.5 * ((xs - m) / sd) ** 2) / sd

    density = p * bell(if_dec, sd_dec) + (1 - p) * bell(if_plain, sd_plain)
    cdf = np.cumsum(density)
    cdf = cdf / cdf[-1]
    low, high = np.interp([0.10, 0.90], cdf, xs)
    return float(low), float(high)


@dataclass(frozen=True)
class SubShape:
    """What a substitute's game looks like in one position: how often he gets a decisive action, how far that lifts his score and how far each spreads."""

    p: float
    gap: float
    sd_decisive: float
    sd_plain: float
    games: int


def around(mean: float, shape: SubShape) -> Outcome:
    """The picture of a game whose expected score is `mean` when he comes on: the position's own chance and spread, centred so they add up to it."""
    if_dec = min(100.0, mean + (1 - shape.p) * shape.gap)
    if_plain = max(0.0, mean - shape.p * shape.gap)
    low, high = mixture_range(shape.p, if_dec, shape.sd_decisive, if_plain, shape.sd_plain)
    return Outcome(0.0, shape.p, if_dec, if_plain, mean, low, high, shape.sd_decisive, shape.sd_plain)


def subs_from_games(games: Sequence[dict[str, Any]]) -> dict[str, SubShape]:
    """Each position's picture of a game he comes on in, from every substitute appearance of the games export."""
    found: dict[str, list[tuple[float, bool]]] = defaultdict(list)
    for game in games:
        for row in game["players"].values():
            if row.get("played") and not row.get("started") and row.get("score") is not None:
                found[row["pos"]].append((float(row["score"]), float(row.get("level") or 0.0) >= DECISIVE))
    out: dict[str, SubShape] = {}
    for pos, rows in found.items():
        dec = np.array([d for _, d in rows], dtype=bool)
        score = np.array([v for v, _ in rows])
        if dec.sum() < MIN_EACH or (~dec).sum() < MIN_EACH:
            continue
        out[pos] = SubShape(
            float(dec.mean()),
            float(score[dec].mean() - score[~dec].mean()),
            float(score[dec].std()) * SPREAD_SCALE,
            float(score[~dec].std()) * SPREAD_SCALE,
            len(rows),
        )
    return out


def save_subs(path: Path, shapes: dict[str, SubShape]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps({pos: m.__dict__ for pos, m in shapes.items()}, indent=2) + "\n", "utf-8")


def load_subs(path: Path = SUB_ARTIFACT) -> dict[str, SubShape]:
    """Each position's substitute picture, or none when there is no file (the panel then draws no curve for a substitute)."""
    if not path.exists():
        return {}
    return {pos: SubShape(**m) for pos, m in json.loads(path.read_text("utf-8")).items()}


def fit_all(starts: Sequence[OutfieldStart], through: str | None = None) -> dict[str, OutfieldModel]:
    return {pos: model for pos in POSITIONS if (model := fit(starts, pos, through)) is not None}


def save(path: Path, models: dict[str, OutfieldModel]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps({pos: m.__dict__ for pos, m in models.items()}, indent=2) + "\n", "utf-8")


def load(path: Path = ARTIFACT) -> dict[str, OutfieldModel]:
    """The fitted lines by position, or none when there is no file (the numbers then stay as they were)."""
    if not path.exists():
        return {}
    raw = json.loads(path.read_text("utf-8"))
    return {
        pos: OutfieldModel(
            pos,
            tuple(m["bare"]),
            tuple(m["proj"]),
            m["starts"],
            m.get("through"),
            tuple(m.get("chance") or ()),
            float(m.get("gap") or 0.0),
            (float((m.get("sd") or [0, 0])[0]), float((m.get("sd") or [0, 0])[1])),
            tuple(m.get("means") or ()),
        )
        for pos, m in raw.items()
    }


@dataclass(frozen=True)
class Walked:
    week: str
    date: datetime
    player: str
    pos: str
    score: float
    proj: float | None
    said: float


def walk_forward(starts: Sequence[OutfieldStart], min_train: int = MIN_STARTS) -> list[Walked]:
    """Each week's starts predicted by a line fitted on the earlier weeks' starts of his position only; the first weeks only train."""
    out: list[Walked] = []
    for pos in POSITIONS:
        mine = [s for s in starts if s.pos == pos]
        by_week: dict[str, list[OutfieldStart]] = defaultdict(list)
        for s in mine:
            by_week[s.week].append(s)
        for week in sorted(by_week, key=lambda w: min(s.date for s in by_week[w])):
            first = min(s.date for s in by_week[week])
            trained = [s for s in mine if s.date < first]
            model = fit(trained, pos) if len(trained) >= min_train else None
            if model is None:
                continue
            out += [
                Walked(
                    week,
                    s.date,
                    s.player,
                    pos,
                    s.score,
                    s.proj,
                    model.predict(s.numbers, s.home, s.own_dec, s.own_score, s.proj),
                )
                for s in by_week[week]
            ]
    return out
