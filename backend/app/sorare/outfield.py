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

from app.sorare.keeper import MIN_STARTS, GameNumbers, adjusted_goals

ARTIFACT = Path(__file__).resolve().parents[2] / "artifacts" / "outfield_score.json"
POSITIONS = ("DEF", "MID", "FWD")
FEATURES = ("cs", "xgf", "xga", "home", "own_dec", "own_score")  # `proj` goes in last when Sorare has one
PRIOR_GAMES = 8.0  # his own record counts as this many starts' worth of the norm while he has few
PRIOR_DECISIVE = 0.12  # a start reaches a decisive score of 60 about one time in eight
PRIOR_SCORE = 45.0
RIDGE = 1.0
DECISIVE = 60.0


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
    return OutfieldModel(pos, bare, proj, len(mine), through)


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
        pos: OutfieldModel(pos, tuple(m["bare"]), tuple(m["proj"]), m["starts"], m.get("through"))
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
