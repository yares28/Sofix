"""A pre-lock LaLiga score distribution and its best within-seven point."""

from __future__ import annotations

import gzip
import json
from dataclasses import dataclass
from datetime import datetime, timedelta
from functools import lru_cache
from pathlib import Path
from typing import Any

import numpy as np

from app.sorare.keeper import LALIGA, GameNumbers, Outcome

VERSION = "Sofix v1"
ARTIFACT = Path(__file__).resolve().parents[2] / "artifacts" / "sofix_v1.json.gz"
# The other competitions' models, one file a competition (plans/competitions-xscore-evidence.md): `<code>.json.gz`
COMPETITION_ARTIFACTS = ARTIFACT.parent / "sofix_v1"
POSITIONS = ("GK", "DEF", "MID", "FWD")
WINDOW = timedelta(days=70)
DELAY = timedelta(hours=48)
POINTS = np.arange(101)


def eligible(past: list[dict[str, Any]], lock: datetime, competition: str = LALIGA) -> list[dict[str, Any]]:
    """The same history window and settlement buffer in training and in the job, his games in `competition` only."""
    first, last = lock - WINDOW, lock - DELAY
    found = []
    for game in past:
        if (
            game.get("competition") == competition
            and game.get("played") is True
            and type(game.get("started")) is bool
            and game.get("score") is not None
            and game.get("status") != "PENDING"
            and first <= datetime.fromisoformat(game["date"].replace("Z", "+00:00")) < last
        ):
            found.append(game)
    return sorted(found, key=lambda g: g["date"], reverse=True)


def features(pos: str, home: bool, numbers: GameNumbers, past: list[dict[str, Any]]) -> list[float]:
    """Only raw football forecasts and already settled player appearances."""
    found = [float(POSITIONS.index(pos)), float(home), numbers.cs, numbers.xga, numbers.xgf]
    for started in (True, False):
        games = [g for g in past if g["started"] is started]
        found.append(float(len(games)))
        for n in (3, 10):
            recent = games[:n]
            scores = [float(g["score"]) for g in recent]
            minutes = [float(g["mins"]) for g in recent if g.get("mins") is not None]
            found.extend(
                [
                    float(np.mean(scores)) if scores else -1.0,
                    float(np.std(scores)) if scores else -1.0,
                    float(np.mean(minutes)) if minutes else -1.0,
                    sum(score >= 60 for score in scores) / len(scores) if scores else -1.0,
                ]
            )
    return found


@dataclass(frozen=True)
class Score:
    point: float
    outcome: Outcome


@dataclass(frozen=True, kw_only=True)
class GameScore(Outcome):
    point: float
    sub: Score
    previous: float | None
    version: str = VERSION


def best_point(mass: np.ndarray) -> float:
    """The whole score with the most of the distribution within seven points either side (ties: nearest the mode)."""
    windows = np.convolve(np.pad(mass, 7), np.ones(15), mode="valid")
    tied = np.flatnonzero(np.isclose(windows, windows.max(), atol=1e-10, rtol=0))
    return float(tied[np.argmin(np.abs(tied - mass.argmax()))])


def from_distribution(hist: np.ndarray, cs: float) -> Score:
    mass = hist.sum(axis=0)
    mean = float(np.dot(mass, POINTS))
    point = best_point(mass)
    p = float(hist[1].sum())
    plain = float(hist[0] @ POINTS / (1 - p)) if p < 1 - 1e-9 else mean
    decisive = float(hist[1] @ POINTS / p) if p > 1e-9 else mean
    lo, hi = np.searchsorted(np.cumsum(mass), [0.1, 0.9])
    sd_dec = float(np.sqrt(hist[1] @ (POINTS - decisive) ** 2 / p)) if p > 1e-9 else 0.0
    sd_plain = float(np.sqrt(hist[0] @ (POINTS - plain) ** 2 / (1 - p))) if p < 1 - 1e-9 else 0.0
    return Score(point, Outcome(cs, p, decisive, plain, mean, float(lo), float(hi), sd_dec, sd_plain))


class Model:
    def __init__(
        self,
        trees: dict[str, list[list[list[Any]]]],
        trained_through: datetime | None = None,
        *,
        version: str = VERSION,
        competition: str = LALIGA,
    ) -> None:
        """`trees` holds "start" and "bench"; an optional "point" set (starts fitted on ordinary games only) picks the starter's
        within-seven point while "start" keeps his expected score and decisive chance."""
        self.trees = trees
        self.trained_through = trained_through
        self.version = version
        self.competition = competition

    @staticmethod
    def _hist(trees: list[list[list[Any]]], row: list[float]) -> np.ndarray:
        hist = np.zeros(202)
        for tree in trees:
            index = 0
            while len(tree[index]) == 4:
                feature, threshold, left, right = tree[index]
                index = left if row[feature] <= threshold else right
            bins, counts = tree[index]
            weights = np.asarray(counts, dtype=float)
            hist[bins] += weights / weights.sum()
        return hist.reshape(2, 101) / len(trees)

    def predict(self, pos: str, home: bool, numbers: GameNumbers, past: list[dict[str, Any]], *, role: str) -> Score:
        row = features(pos, home, numbers, past)
        score = from_distribution(self._hist(self.trees[role], row), numbers.cs)
        if role == "start" and self.trees.get("point"):
            return Score(best_point(self._hist(self.trees["point"], row).sum(axis=0)), score.outcome)
        return score

    def game(
        self, pos: str, home: bool, numbers: GameNumbers, past: list[dict[str, Any]], previous: Outcome | None
    ) -> GameScore:
        start = self.predict(pos, home, numbers, past, role="start")
        sub = self.predict(pos, home, numbers, past, role="bench")
        return GameScore(
            **vars(start.outcome),
            point=start.point,
            sub=sub,
            previous=previous.start if previous else None,
            version=self.version,
        )


@lru_cache(maxsize=1)
def load() -> Model | None:
    if not ARTIFACT.is_file():
        return None
    with gzip.open(ARTIFACT, "rt", encoding="utf-8") as source:
        data = json.load(source)
    if data["version"] != VERSION:
        raise ValueError("Unexpected LaLiga xScore artifact version")
    return Model(data["trees"], datetime.fromisoformat(data["trainedThrough"]))


@lru_cache(maxsize=8)
def load_competition(code: str) -> Model | None:
    """Another competition's model (`COMPETITION_ARTIFACTS/<code>.json.gz`), or None when it has none."""
    path = COMPETITION_ARTIFACTS / f"{code}.json.gz"
    if not path.is_file():
        return None
    with gzip.open(path, "rt", encoding="utf-8") as source:
        data = json.load(source)
    if data.get("code") != code or not str(data.get("version", "")).startswith(VERSION):
        raise ValueError(f"Unexpected {code} xScore artifact")
    return Model(
        data["trees"],
        datetime.fromisoformat(data["trainedThrough"]),
        version=data["version"],
        competition=data["competition"],
    )
