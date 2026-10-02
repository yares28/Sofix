"""The xScore backtest: today's model and simple baselines, each scored on games it had not seen (plans/xscore.md, P2).

Track A of the plan, from the owner's players' game history (`app.jobs.export_history`): for every scored game the history holds,
what would the model have said about it knowing only what came before? The prediction goes through the production code path
(`forecast.forecast` on a `PlayerWeek` built from the games before), then is set against what he scored, with a game he did not
play counting as zero, as in the expected score the page shows.

What is known when a game is predicted is what is known when a gameweek locks: the games before the week it is in. The week is
the Monday it starts, and its lock is the earliest of his own games in it, so the second game of a week is predicted without the
first, as the plan for a double gameweek is.

Sorare's own projection is not in the history (it only serves the next game's), so these are the numbers of the form formula alone;
whether it beats Sorare's projection is Track B, on what was recorded before each lock (`start_chances`, `sorare_forecasts`).

Nothing here touches the network or the database.
"""

from __future__ import annotations

import dataclasses
from collections import defaultdict
from collections.abc import Callable
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Any

import numpy as np

from app.sorare.forecast import NATIONAL, PlayerWeek, forecast

FLAT = 45.0  # the score the flat baseline says for everyone
MIN_RANKED = 6  # players needed in one position and week for an order to mean anything
DEPTHS = (("0-4 games", 0, 5), ("5-9 games", 5, 10), ("10+ games", 10, 10**9))


def klass(competition: str | None) -> str:
    """A game for his country ("national") or for his club."""
    return "national" if competition in NATIONAL else "club"


@dataclass(frozen=True)
class Row:
    """One game of one player, as one model predicted it before it, and what happened."""

    model: str
    player: str
    pos: str | None
    date: datetime
    week: str  # the Monday of its week, "2026-10-05"
    competition: str
    klass: str
    before: int  # games of his the model had seen
    score: float  # what he scored; zero when he did not play
    played: bool
    started: bool
    expected: float  # what the model expected him to score, the chance of not playing included
    p_play: float | None = None
    p_start: float | None = None
    start: float | None = None  # his score if he starts, today's model only
    mu: float | None = None  # his score if he plays
    period: str = "tuning"

    @property
    def role(self) -> str:
        return "start" if self.started else "sub" if self.played else "dnp"

    @property
    def depth(self) -> str:
        return next(name for name, low, high in DEPTHS if low <= self.before < high)


# ---------------------------------------------------------------------------------------------------- the history
def _when(value: str) -> datetime:
    return datetime.fromisoformat(value.replace("Z", "+00:00")).astimezone(UTC)


def read_history(raw: Any) -> dict[str, dict[str, Any]]:
    """The exporter's file as players keyed by slug; anything of another shape is left out rather than guessed at."""
    players = (raw or {}).get("players") if isinstance(raw, dict) else None
    if not isinstance(players, dict):
        return {}
    return {
        slug: entry
        for slug, entry in players.items()
        if isinstance(entry, dict) and isinstance(entry.get("games"), list)
    }


def _monday(moment: datetime) -> datetime:
    day = moment.replace(hour=0, minute=0, second=0, microsecond=0)
    return day - timedelta(days=day.weekday())


@dataclass(frozen=True)
class _Game:
    when: datetime
    raw_date: str
    competition: str
    score: float
    played: bool
    started: bool
    week: datetime

    @property
    def counted(self) -> float:
        return self.score if self.played else 0.0


def _games(entry: dict[str, Any]) -> list[_Game]:
    """The scored games of a player, oldest first: one still to be played (PENDING) is not a result."""
    found = []
    for raw in entry.get("games") or []:
        if not isinstance(raw, dict) or raw.get("status") == "PENDING" or not raw.get("date"):
            continue
        when = _when(raw["date"])
        found.append(
            _Game(
                when,
                raw["date"],
                raw.get("competition") or "",
                float(raw.get("score") or 0.0),
                bool(raw.get("played")),
                bool(raw.get("started")),
                _monday(when),
            )
        )
    return sorted(found, key=lambda game: game.when)


# ---------------------------------------------------------------------------------------------------- the models
Prediction = dict[str, float | None]
Model = Callable[[list[_Game], _Game, str | None], Prediction]


def _flat(seen: list[_Game], target: _Game, pos: str | None) -> Prediction:
    return {"expected": FLAT}


def _mean_last(games: list[_Game]) -> float:
    last = games[-5:]
    return sum(game.counted for game in last) / len(last) if last else FLAT


def _last5(seen: list[_Game], target: _Game, pos: str | None) -> Prediction:
    return {"expected": _mean_last(seen)}


def _last5_class(seen: list[_Game], target: _Game, pos: str | None) -> Prediction:
    same = [game for game in seen if klass(game.competition) == klass(target.competition)]
    return {"expected": _mean_last(same if same else seen)}


def _today(seen: list[_Game], target: _Game, pos: str | None) -> Prediction:
    """What the page would have said: the form formula on his last games, one game, no Sorare projection."""
    newest_first = list(reversed(seen))
    week = PlayerWeek(
        games=1,
        history=[(game.raw_date, game.counted, game.played) for game in newest_first],
        starts={game.raw_date: game.started for game in newest_first if game.played},
        pos=pos,
    )
    made = forecast(week)
    return {
        "expected": made.p_play * made.mu,
        "p_play": made.p_play,
        "p_start": made.p_start,
        "start": made.start,
        "mu": made.mu,
    }


MODELS: dict[str, Model] = {"flat45": _flat, "last5": _last5, "last5_class": _last5_class, "today": _today}


# ---------------------------------------------------------------------------------------------------- walking forward
def walk_forward(players: dict[str, dict[str, Any]], since: datetime | None = None) -> list[Row]:
    """Every scored game from `since` on, predicted by every model from the games before its week."""
    out: list[Row] = []
    for slug, entry in players.items():
        games = _games(entry)
        pos = entry.get("pos")
        first_in_week: dict[datetime, datetime] = {}
        for game in games:
            first_in_week.setdefault(game.week, game.when)
        for target in games:
            if since is not None and target.when < since:
                continue
            seen = [game for game in games if game.when < first_in_week[target.week]]
            for name, model in MODELS.items():
                said = model(seen, target, pos)
                out.append(
                    Row(
                        model=name,
                        player=slug,
                        pos=pos,
                        date=target.when,
                        week=target.week.date().isoformat(),
                        competition=target.competition,
                        klass=klass(target.competition),
                        before=len(seen),
                        score=target.counted,
                        played=target.played,
                        started=target.started,
                        expected=float(said["expected"] or 0.0),
                        p_play=said.get("p_play"),
                        p_start=said.get("p_start"),
                        start=said.get("start"),
                        mu=said.get("mu"),
                    )
                )
    return out


def with_period(rows: list[Row], holdout_from: datetime) -> list[Row]:
    """Mark each row as tuning, or held out when its game is on or after the day the held-out weeks begin."""
    return [dataclasses.replace(row, period="held out" if row.date >= holdout_from else "tuning") for row in rows]


# ---------------------------------------------------------------------------------------------------- the scores
def _brier(pairs: list[tuple[float, bool]]) -> float | None:
    return sum((p - float(happened)) ** 2 for p, happened in pairs) / len(pairs) if pairs else None


def scores(rows: list[Row], by: list[str]) -> list[dict[str, Any]]:
    """Error of the expected score against what he scored, and how right the chances were, for each group of `by`.

    `bias` is the expected score minus the real one on average, so below zero is a model that says too little.
    """
    groups: dict[tuple[Any, ...], list[Row]] = defaultdict(list)
    for row in rows:
        groups[tuple(getattr(row, key) for key in by)].append(row)
    table = []
    for key, group in sorted(groups.items(), key=lambda item: tuple(str(part) for part in item[0])):
        errors = np.array([row.expected - row.score for row in group], dtype=float)
        table.append(
            {
                **dict(zip(by, key, strict=True)),
                "n": len(group),
                "mae": float(np.mean(np.abs(errors))),
                "rmse": float(np.sqrt(np.mean(errors**2))),
                "bias": float(np.mean(errors)),
                "brier_play": _brier([(row.p_play, row.played) for row in group if row.p_play is not None]),
                "brier_start": _brier([(row.p_start, row.started) for row in group if row.p_start is not None]),
            }
        )
    return table


# ---------------------------------------------------------------------------------------------------- better or not
def compare(rows: list[Row], a: str, b: str, *, seed: int = 0, draws: int = 2000) -> dict[str, Any]:
    """Is model `a` closer than model `b`? The mean of |error of a| - |error of b| over the games both predicted, with a 95%
    interval from resampling whole weeks (a week's games move together), so below zero with an interval under zero means closer."""
    by_game: dict[tuple[str, datetime], dict[str, Row]] = defaultdict(dict)
    for row in rows:
        if row.model in (a, b):
            by_game[(row.player, row.date)][row.model] = row
    weeks: dict[str, list[float]] = defaultdict(list)
    for pair in by_game.values():
        if a in pair and b in pair:
            weeks[pair[a].week].append(abs(pair[a].expected - pair[a].score) - abs(pair[b].expected - pair[b].score))
    if not weeks:
        return {"a": a, "b": b, "weeks": 0, "n": 0, "diff": None, "lo": None, "hi": None}
    sums = np.array([sum(v) for v in weeks.values()])
    counts = np.array([len(v) for v in weeks.values()], dtype=float)
    diff = float(sums.sum() / counts.sum())
    rng = np.random.default_rng(seed)
    picks = rng.integers(0, len(sums), size=(draws, len(sums)))
    means = sums[picks].sum(axis=1) / counts[picks].sum(axis=1)
    lo, hi = np.percentile(means, [2.5, 97.5])
    return {"a": a, "b": b, "weeks": len(weeks), "n": int(counts.sum()), "diff": diff, "lo": float(lo), "hi": float(hi)}


def _spearman(x: np.ndarray, y: np.ndarray) -> float:
    if np.ptp(x) == 0 or np.ptp(y) == 0:
        return 0.0  # a column that says the same for everyone orders nobody
    rx = np.argsort(np.argsort(x, kind="stable"), kind="stable").astype(float)
    ry = np.argsort(np.argsort(y, kind="stable"), kind="stable").astype(float)
    return float(np.corrcoef(rx, ry)[0, 1])


def rank_correlation(rows: list[Row], model: str) -> float | None:
    """How well the model orders players within a position and week (Spearman, averaged), which is what a plan chooses by.
    None when no position has enough players in any week to mean anything."""
    groups: dict[tuple[str, str | None], list[Row]] = defaultdict(list)
    for row in rows:
        if row.model == model:
            groups[(row.week, row.pos)].append(row)
    found = [
        _spearman(np.array([r.expected for r in group]), np.array([r.score for r in group]))
        for group in groups.values()
        if len(group) >= MIN_RANKED
    ]
    return float(np.mean(found)) if found else None


# ---------------------------------------------------------------------------------------------------- the report
def _fmt(value: float | None, digits: int = 1) -> str:
    return "–" if value is None else f"{value:.{digits}f}"


def _table(table: list[dict[str, Any]], keys: list[str]) -> list[str]:
    head = [*keys, "games", "MAE", "RMSE", "bias", "Brier plays", "Brier starts"]
    lines = ["| " + " | ".join(head) + " |", "|" + "---|" * len(head)]
    for row in table:
        cells = [str(row[key]) for key in keys]
        cells += [
            str(row["n"]),
            _fmt(row["mae"]),
            _fmt(row["rmse"]),
            f"{row['bias']:+.1f}",
            _fmt(row["brier_play"], 3),
            _fmt(row["brier_start"], 3),
        ]
        lines.append("| " + " | ".join(cells) + " |")
    return lines


def report(rows: list[Row], holdout_from: datetime) -> str:
    """The backtest as Markdown: each model overall, then by the slices the plan asks for, tuning weeks and held-out weeks apart."""
    rows = with_period(rows, holdout_from)
    out = [
        f"The weeks held out begin on {holdout_from.date().isoformat()}: games on or after it are scored apart and were not looked at while tuning.",
        "",
    ]
    for period in ("tuning", "held out"):
        part = [row for row in rows if row.period == period]
        out += [
            f"### {period.capitalize()} · {len({r.week for r in part})} weeks, {len({(r.player, r.date) for r in part})} games",
            "",
        ]
        if not part:
            out += ["Nothing in this period yet.", ""]
            continue
        out += _table(scores(part, ["model"]), ["model"]) + [""]
        if period == "tuning":
            for key, label in (
                ("klass", "club or national"),
                ("role", "what he did"),
                ("depth", "how much history"),
                ("pos", "position"),
            ):
                out += [f"**By {label}**", ""] + _table(scores(part, ["model", key]), ["model", key]) + [""]
    tuning = [row for row in rows if row.period == "tuning"]
    out += ["### Order within a position and week (tuning weeks)", ""]
    for name in MODELS:
        out.append(f"- {name}: {_fmt(rank_correlation(tuning, name), 2)}")
    out += [
        "",
        "### Is today's model closer than each baseline? (tuning weeks, mean |error| difference, 95% interval over weeks)",
        "",
    ]
    for name in MODELS:
        if name == "today":
            continue
        result = compare(tuning, "today", name)
        if result["weeks"]:
            verdict = "closer" if result["hi"] < 0 else "further" if result["lo"] > 0 else "no clear difference"
            out.append(
                f"- today against {name}: {result['diff']:+.2f} points [{result['lo']:+.2f}, {result['hi']:+.2f}] over {result['weeks']} weeks: {verdict}"
            )
    return "\n".join(out) + "\n"
