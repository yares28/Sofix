"""The goalkeeper's number: the game in the score (plans/xscore.md P9 X3; roadmap 10.3).

A keeper's score is mostly one thing: did his side keep a clean sheet? A clean sheet is a decisive action worth at least 60 (a start
that keeps one scored 75 on average over two LaLiga seasons); without one the score falls with the goals his side lets in (41 on
average, 31 after four). A keeper's own recent games say almost nothing about his next one: the same keeper scores 75 or 35 on the
luck of the game. So the number is built from the game, the way Sorare adds a score up:

    chance of a decisive action x his score with one  +  the rest x his score without one

* The **chance of a clean sheet** is the football model's, nudged by the bookmakers' goals line (the over/under 2.5 price moves how many
  goals the game is expected to have, the split between the sides staying the model's), then corrected on the keepers' own starts: the
  model ran about 5 points high for them (it said 30%, 25% happened).
* The chance of a **decisive action** adds the penalties he saves (about 3% of starts without a clean sheet).
* His **score without** one is a line in the goals expected against, and Sorare's own projection once it is published; his score
  **with** one a level and the projection.
* The spread of what is left over (how far scores land from those two) gives the range: where he lands 8 times in 10.

Fitted on every keeper start of two LaLiga seasons (`app.jobs.keeper_fit`, into `artifacts/keeper_score.json`), and tested by
`walk_forward`: each week predicted from the weeks before it only. Nothing here looks at a keeper's own form: tried, it added nothing.
"""

from __future__ import annotations

import json
import math
from collections import defaultdict
from collections.abc import Callable, Sequence
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any

import numpy as np
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import settings
from app.models import Fixture, MarketOdds, Prediction, Team
from app.services import team_registry
from app.services.calibration import CleanSheetCalibration, load_clean_sheet_calibration

ARTIFACT = Path(__file__).resolve().parents[2] / "artifacts" / "keeper_score.json"
MIN_STARTS = 150  # starts a model needs before it means anything
MIN_EACH = 12  # ...of which at least this many with and without a decisive action
DECISIVE = 60.0  # a score's decisive level at or above this is a decisive action
SPREAD = tuple(range(5, 100, 5))  # the percentiles of what is left over, kept for the range
SAME_GAME = timedelta(
    hours=36
)  # a kick-off this close to Sorare's is the same game (schedules move, days differ by zone)
LALIGA = "laliga-es"
SPREAD_SCALE = (
    1.2  # the leftovers of a fitted model are smaller than those of the next game: the range is widened by this much
)
RIDGE = 2.0  # how many starts the "change nothing" prior is worth when the clean-sheet correction is fitted


# --------------------------------------------------------------------------- the game
@dataclass(frozen=True)
class GameNumbers:
    """What is known about his side's game before it: the football model's numbers and the bookmakers' goals line."""

    cs: float  # the football model's chance his side keeps a clean sheet (before the board's own correction)
    xga: float  # the goals it expects his side to concede
    xgf: float  # the goals it expects his side to score
    p_over: float | None = None  # the bookmakers' chance of over 2.5 goals, margin removed


@dataclass(frozen=True)
class Outcome:
    """The keeper's game, worked out: the chances and the two scores behind his number, and where he lands 8 times in 10."""

    p_clean_sheet: float
    p_decisive: float
    if_decisive: float
    if_plain: float
    start: float
    low: float
    high: float
    sd_decisive: float = (
        0.0  # how far his score with a decisive action spreads (a standard deviation), for the panel's picture
    )
    sd_plain: float = 0.0
    why: tuple[tuple[str, float], ...] = ()  # what moves the number off a typical game's, in points, biggest first


def _logit(p: float | np.ndarray) -> Any:
    clipped = np.clip(p, 1e-4, 1 - 1e-4)
    return np.log(clipped / (1 - clipped))


def _sigmoid(x: float | np.ndarray) -> Any:
    return 1 / (1 + np.exp(-x))


def _over(total: float) -> float:
    """The chance of 3 or more goals when the game is expected to have `total` (Poisson)."""
    return 1 - math.exp(-total) * (1 + total + total * total / 2)


def total_goals(p_over: float) -> float:
    """The goals a game is expected to have for the chance of over 2.5 that a bookmaker's price gives."""
    low, high = 0.2, 8.0
    for _ in range(60):
        mid = (low + high) / 2
        low, high = (mid, high) if _over(mid) < p_over else (low, mid)
    return (low + high) / 2


def adjusted_goals(numbers: GameNumbers) -> tuple[float, float, float]:
    """His side's clean-sheet chance, goals against and goals for once the bookmakers' goals line is in: the line sets how many goals the
    game holds, the football model how they are split between the sides. A price that is missing (or is not one) leaves the model's own."""
    if numbers.p_over is None or not 0 < numbers.p_over < 1 or numbers.xga + numbers.xgf <= 0:
        return numbers.cs, numbers.xga, numbers.xgf
    scale = total_goals(numbers.p_over) / (numbers.xga + numbers.xgf)
    xga = numbers.xga * scale
    return min(1.0, max(0.0, numbers.cs * math.exp(-(xga - numbers.xga)))), xga, numbers.xgf * scale


def adjusted(numbers: GameNumbers) -> tuple[float, float]:
    """His side's clean-sheet chance and goals against with the bookmakers' goals line in (`adjusted_goals`)."""
    cs, xga, _ = adjusted_goals(numbers)
    return cs, xga


def raw_clean_sheet(shown: float, calibration: CleanSheetCalibration | None = None) -> float:
    """The football model's own chance of a clean sheet, from the board's: the board corrects it (`services/calibration.py`), and the
    model here is fitted on the uncorrected one."""
    found = (
        calibration if calibration is not None else load_clean_sheet_calibration(settings.clean_sheet_calibration_path)
    )
    if found.is_identity:
        return float(shown)
    return float(_sigmoid((_logit(shown) - found.a) / found.b))


# --------------------------------------------------------------------------- one keeper start
@dataclass(frozen=True)
class Start:
    """A keeper who started a LaLiga game, with what was known before it and what happened."""

    week: str
    date: datetime
    player: str
    numbers: GameNumbers
    proj: float | None  # Sorare's projection for him in that game
    score: float
    decisive: bool  # his decisive level was 60 or more: a clean sheet or a penalty saved
    clean_sheet: bool  # his side conceded nothing


def starts_from_games(games: Sequence[dict[str, Any]], weeks: list[dict[str, str]] | None = None) -> list[Start]:
    """Every keeper start of the games export (`app.sorare.gamedata`, each game joined to its forecast), oldest first.

    A keeper on the bench, an outfield player and a game with no forecast are left out. `weeks` are Sorare's gameweeks (`slug`, `start`,
    `end`); without them a week is the Monday's.
    """
    from app.sorare import backtest  # here, not at the top: backtest reads forecast, which reads this module

    windows = backtest._windows(weeks)
    out: list[Start] = []
    for game in sorted(games, key=lambda one: one["date"]):
        forecast = (game.get("ctx") or {}).get("forecast")
        if not forecast:
            continue
        price = ((game.get("ctx") or {}).get("ou") or {}).get("p_over")
        when = datetime.fromisoformat(game["date"].replace("Z", "+00:00")).astimezone(UTC)
        for slug, row in game["players"].items():
            if row["pos"] != "GK" or not row["started"]:
                continue
            home = row["team"] == game["home"]["slug"]
            conceded = game["awayGoals"] if home else game["homeGoals"]
            out.append(
                Start(
                    week=backtest._week_of(when, windows),
                    date=when,
                    player=slug,
                    numbers=GameNumbers(
                        cs=float(forecast["cs_h" if home else "cs_a"]),
                        xga=float(forecast["lam_a" if home else "lam_h"]),
                        xgf=float(forecast["lam_h" if home else "lam_a"]),
                        p_over=float(price) if price is not None and price == price else None,
                    ),
                    proj=None if row.get("proj") is None else float(row["proj"]),
                    score=float(row["score"]),
                    decisive=float(row.get("level") or 0.0) >= DECISIVE,
                    clean_sheet=conceded == 0,
                )
            )
    return out


# --------------------------------------------------------------------------- the model
@dataclass(frozen=True)
class KeeperModel:
    """The numbers a fit found. Each score is a line: `dec` (with a decisive action) is an intercept and a slope on Sorare's
    projection, `plain` (without one) an intercept, a slope on his side's goals against and a slope on the projection; `dec0` and
    `plain0` are the same without a projection."""

    cs: tuple[float, float]  # the correction of the clean-sheet chance on its log-odds: a + b * logit(chance)
    p_save: float  # the chance of a decisive action when his side did not keep a clean sheet (a penalty saved)
    dec: tuple[float, float]
    dec0: float
    plain: tuple[float, float, float]
    plain0: tuple[float, float]
    spread_dec: tuple[float, ...]  # how far scores with a decisive action landed from the line, at 5%, 10% ... 95%
    spread_plain: tuple[float, ...]
    starts: int
    through: str | None = None  # the newest start in the fit, YYYY-MM-DD
    typical: tuple[float, float] | None = (
        None  # a typical game's clean-sheet chance and goals against: what "the opponent" is measured from
    )

    def _core(self, cs: float, xga: float, projection: float | None) -> tuple[float, float, float, float]:
        p_cs = float(_sigmoid(self.cs[0] + self.cs[1] * _logit(cs)))
        p_dec = p_cs + (1 - p_cs) * self.p_save
        if projection is None:
            if_dec = self.dec0
            if_plain = self.plain0[0] + self.plain0[1] * xga
        else:
            if_dec = self.dec[0] + self.dec[1] * projection
            if_plain = self.plain[0] + self.plain[1] * xga + self.plain[2] * projection
        return p_cs, p_dec, min(100.0, max(0.0, if_dec)), min(100.0, max(0.0, if_plain))

    def predict(self, numbers: GameNumbers, projection: float | None = None) -> Outcome:
        cs, xga = adjusted(numbers)
        p_cs, p_dec, if_dec, if_plain = self._core(cs, xga, projection)
        low, high = self._range(p_dec, if_dec, if_plain)
        start = p_dec * if_dec + (1 - p_dec) * if_plain
        why: list[tuple[str, float]] = []
        if self.typical is not None:
            _, q, d, p = self._core(self.typical[0], self.typical[1], projection)
            why.append(("Opponent", start - (q * d + (1 - q) * p)))
        if projection is not None:
            _, q, d, p = self._core(cs, xga, None)
            why.append(("Sorare", start - (q * d + (1 - q) * p)))
        why.sort(key=lambda item: -abs(item[1]))
        return Outcome(
            p_cs,
            p_dec,
            if_dec,
            if_plain,
            start,
            low,
            high,
            self._sd(self.spread_dec),
            self._sd(self.spread_plain),
            tuple(why),
        )

    @staticmethod
    def _sd(spread: tuple[float, ...]) -> float:
        """A standard deviation from the 5th to the 95th percentile of what was left over (a normal's span is 3.29 deviations), widened like the range."""
        return (spread[-1] - spread[0]) / 3.29 * SPREAD_SCALE if len(spread) > 1 else 0.0

    def _range(self, p_dec: float, if_dec: float, if_plain: float) -> tuple[float, float]:
        """Where he lands 8 times in 10: the 10th and 90th percentile of the two possible games, each spread as scores were."""
        values = np.concatenate(
            [if_dec + SPREAD_SCALE * np.array(self.spread_dec), if_plain + SPREAD_SCALE * np.array(self.spread_plain)]
        ).clip(0, 100)
        weights = np.concatenate(
            [
                np.full(len(self.spread_dec), p_dec / len(self.spread_dec)),
                np.full(len(self.spread_plain), (1 - p_dec) / len(self.spread_plain)),
            ]
        )
        order = np.argsort(values, kind="stable")
        middle = np.cumsum(weights[order]) - weights[order] / 2
        low, high = np.interp([0.10, 0.90], middle, values[order])
        return float(low), float(high)


def _ols(columns: list[np.ndarray], y: np.ndarray) -> np.ndarray:
    X = np.column_stack([np.ones(len(y)), *columns])
    beta, *_ = np.linalg.lstsq(X, y, rcond=None)
    return beta


def _correction(x: np.ndarray, y: np.ndarray) -> tuple[float, float]:
    """a + b * x on the log-odds, by Newton's method, pulled towards a = 0 and b = 1 by `RIDGE` starts' worth."""
    X = np.column_stack([np.ones(len(x)), x])
    prior = np.array([0.0, 1.0])
    beta = prior.copy()
    for _ in range(40):
        p = _sigmoid(X @ beta)
        gradient = X.T @ (y - p) - RIDGE * (beta - prior)
        hessian = X.T @ (X * (p * (1 - p))[:, None]) + RIDGE * np.eye(2)
        beta = beta + np.linalg.solve(hessian, gradient)
    return float(beta[0]), float(beta[1])


def fit(starts: Sequence[Start], through: str | None = None) -> KeeperModel | None:
    """The model of these starts, or None when there are too few of them (or of one kind) to mean anything."""
    if len(starts) < MIN_STARTS:
        return None
    adjusted_numbers = [adjusted(s.numbers) for s in starts]
    cs = np.array([a[0] for a in adjusted_numbers])
    xga = np.array([a[1] for a in adjusted_numbers])
    clean = np.array([s.clean_sheet for s in starts], dtype=float)
    dec = np.array([s.decisive for s in starts], dtype=bool)
    score = np.array([s.score for s in starts])
    proj = np.array([np.nan if s.proj is None else s.proj for s in starts])
    if dec.sum() < MIN_EACH or (~dec).sum() < MIN_EACH:
        return None
    a, b = _correction(_logit(cs), clean)
    p_save = float(dec[clean == 0].mean()) if (clean == 0).any() else 0.0
    dec0 = float(score[dec].mean())
    plain0 = _ols([xga[~dec]], score[~dec])
    with_dec, with_plain = dec & ~np.isnan(proj), ~dec & ~np.isnan(proj)
    dec_line = (dec0, 0.0)
    plain_line = (float(plain0[0]), float(plain0[1]), 0.0)
    if with_dec.sum() >= MIN_EACH:
        found = _ols([proj[with_dec]], score[with_dec])
        dec_line = (float(found[0]), float(found[1]))
    if with_plain.sum() >= MIN_EACH:
        found = _ols([xga[with_plain], proj[with_plain]], score[with_plain])
        plain_line = (float(found[0]), float(found[1]), float(found[2]))
    spread_dec = np.percentile(score[dec] - dec0, SPREAD)
    spread_plain = np.percentile(score[~dec] - (plain0[0] + plain0[1] * xga[~dec]), SPREAD)
    return KeeperModel(
        cs=(a, b),
        p_save=p_save,
        dec=dec_line,
        dec0=dec0,
        plain=plain_line,
        plain0=(float(plain0[0]), float(plain0[1])),
        spread_dec=tuple(float(v) for v in spread_dec),
        spread_plain=tuple(float(v) for v in spread_plain),
        starts=len(starts),
        through=through,
        typical=(float(cs.mean()), float(xga.mean())),
    )


def save(path: Path, model: KeeperModel) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(model.__dict__, indent=2) + "\n", "utf-8")


def load(path: Path = ARTIFACT) -> KeeperModel | None:
    """The fitted model, or None when there is no file (the numbers then stay as they were)."""
    if not path.exists():
        return None
    raw = json.loads(path.read_text("utf-8"))
    return KeeperModel(
        cs=(raw["cs"][0], raw["cs"][1]),
        p_save=raw["p_save"],
        dec=(raw["dec"][0], raw["dec"][1]),
        dec0=raw["dec0"],
        plain=(raw["plain"][0], raw["plain"][1], raw["plain"][2]),
        plain0=(raw["plain0"][0], raw["plain0"][1]),
        spread_dec=tuple(raw["spread_dec"]),
        spread_plain=tuple(raw["spread_plain"]),
        starts=raw["starts"],
        through=raw.get("through"),
        typical=None if raw.get("typical") is None else (raw["typical"][0], raw["typical"][1]),
    )


# --------------------------------------------------------------------------- walk-forward
@dataclass(frozen=True)
class Walked:
    """One start, predicted from the weeks before his and then scored."""

    week: str
    date: datetime
    player: str
    score: float
    decisive: bool
    clean_sheet: bool
    proj: float | None
    said: Outcome


def walk_forward(starts: Sequence[Start], min_train: int = MIN_STARTS) -> list[Walked]:
    """Each week's starts predicted by a model fitted on the starts of earlier weeks only; the first weeks only train."""
    by_week: dict[str, list[Start]] = defaultdict(list)
    for s in starts:
        by_week[s.week].append(s)
    out: list[Walked] = []
    for week in sorted(by_week, key=lambda w: min(s.date for s in by_week[w])):
        first = min(s.date for s in by_week[week])
        trained = [s for s in starts if s.date < first]
        model = fit(trained) if len(trained) >= min_train else None
        if model is None:
            continue
        out += [
            Walked(week, s.date, s.player, s.score, s.decisive, s.clean_sheet, s.proj, model.predict(s.numbers, s.proj))
            for s in sorted(by_week[week], key=lambda one: one.date)
        ]
    return out


# --------------------------------------------------------------------------- live
def _utc(moment: datetime) -> datetime:
    return moment if moment.tzinfo else moment.replace(tzinfo=UTC)


def numbers_for(
    db: Session, since: datetime, calibration: CleanSheetCalibration | None = None
) -> Callable[[str, str], GameNumbers | None]:
    """A finder of a game's numbers from what the app holds: the football model's predictions for each side and the bookmakers' goals
    line, for the games from `since` on. Ask it for a club (any spelling the registry knows) and the kick-off Sorare gives; it says
    None for a game it cannot tell (another competition, another week, a club it does not know)."""
    found = (
        calibration if calibration is not None else load_clean_sheet_calibration(settings.clean_sheet_calibration_path)
    )
    rows = db.execute(
        select(Fixture.kickoff_utc, Team.code, Prediction, MarketOdds.p_over_2_5)
        .join(Prediction, Prediction.fixture_id == Fixture.id)
        .join(Team, Team.id == Prediction.perspective_team_id)
        .outerjoin(MarketOdds, MarketOdds.fixture_id == Fixture.id)
        .where(Fixture.kickoff_utc >= since - timedelta(days=1))
        .order_by(Prediction.prediction_ts)
    ).all()
    latest: dict[
        tuple[str, datetime], GameNumbers
    ] = {}  # a later prediction of the same side and game replaces an earlier one
    for kickoff, code, prediction, p_over in rows:
        if prediction.p_clean_sheet is None or prediction.xg_for is None or prediction.xg_against is None:
            continue
        latest[(code, _utc(kickoff))] = GameNumbers(
            cs=raw_clean_sheet(prediction.p_clean_sheet, found),
            xga=float(prediction.xg_against),
            xgf=float(prediction.xg_for),
            p_over=None if p_over is None else float(p_over),
        )
    by_team: dict[str, list[tuple[datetime, GameNumbers]]] = defaultdict(list)
    for (code, kickoff), numbers in latest.items():
        by_team[code].append((kickoff, numbers))

    def find(club: str, kickoff: str) -> GameNumbers | None:
        team = team_registry.by_odds_name(club)
        if team is None:
            return None
        when = datetime.fromisoformat(kickoff.replace("Z", "+00:00")).astimezone(UTC)
        best = min(by_team.get(team.code, []), key=lambda item: abs(item[0] - when), default=None)
        return best[1] if best is not None and abs(best[0] - when) <= SAME_GAME else None

    return find


def outcomes_for(
    model: KeeperModel | None, find: Callable[[str, str], GameNumbers | None]
) -> Callable[[dict[str, Any], list[dict[str, Any]], float | None], tuple[Outcome, ...]]:
    """For a keeper's card and his games of the gameweek (as `publish.card_games` lists them): his game worked out, in kick-off order.

    Sorare's projection is for his next game, so it goes to the first. A game outside LaLiga, or one the numbers cannot be found for,
    leaves the whole week to the old number (a week half known is not guessed at).
    """

    def of(player: dict[str, Any], games: list[dict[str, Any]], projection: float | None) -> tuple[Outcome, ...]:
        if model is None or not games:
            return ()
        club = player.get("activeClub") or {}
        names = [name for name in (club.get("name"), club.get("shortName")) if name]
        out: list[Outcome] = []
        for i, game in enumerate(sorted(games, key=lambda g: g["kickoff"])):
            if game.get("competition") != LALIGA:
                return ()
            numbers = next((n for name in names if (n := find(name, game["kickoff"])) is not None), None)
            if numbers is None:
                return ()
            out.append(model.predict(numbers, projection if i == 0 else None))
        return tuple(out)

    return of
