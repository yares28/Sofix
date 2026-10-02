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

from app.sorare.forecast import NATIONAL, REGULAR_STARTER, PlayerWeek, forecast

FLAT = 45.0  # the score the flat baseline says for everyone
RARE_STARTER = 0.25  # below this share of his last five games started, he is a rare starter
MIN_RANKED = 6  # players needed in one position and week for an order to mean anything
DEPTHS = (("0-4 games", 0, 5), ("5-9 games", 5, 10), ("10+ games", 10, 10**9))
BASELINES = ("flat45", "last5", "last5_class")
NO_FORM = (
    "unknown"  # the starter group of a game with nothing before it: the first of the history, not a player nobody knows
)
# The slices the report cuts the games by: the Row attribute, how the report names it, and whether it is known before the
# lock (what he did in the game is not, so it is shown but never ranked: no model can be fixed for it).
SLICES = (
    ("klass", "club or national", True),
    ("role", "what he did", False),
    ("depth", "how much history", True),
    ("pos", "position", True),
    ("starter", "how often he had started", True),
    ("games_that_week", "games in the week", True),
)


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
    form_games: int = 0  # of his last five games before the week, how many there were...
    form_starts: int = 0  # ...and in how many he started (a game he missed is one he did not start)
    week_games: int = 1  # his games in the week: the fixture list says so before the lock

    @property
    def role(self) -> str:
        return "start" if self.started else "sub" if self.played else "dnp"

    @property
    def starter(self) -> str:
        """How he had been used going into the week."""
        if not self.form_games:
            return NO_FORM
        share = self.form_starts / self.form_games
        return "regular" if share >= REGULAR_STARTER else "rotation" if share >= RARE_STARTER else "rare"

    @property
    def games_that_week(self) -> str:
        return "2+ games" if self.week_games > 1 else "1 game"

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


def read_fixtures(raw: Any) -> list[dict[str, str]]:
    """Sorare's gameweeks from the exporter's file (slug, start, end), anything unreadable left out rather than guessed at."""
    listed = raw.get("fixtures") if isinstance(raw, dict) else None
    if not isinstance(listed, list):
        return []
    found = []
    for item in listed:
        if not isinstance(item, dict) or not item.get("slug"):
            continue
        try:
            _when(item["start"])
            _when(item["end"])
        except (KeyError, TypeError, ValueError, AttributeError):
            continue
        found.append(item)
    return found


Window = tuple[datetime, datetime, str]


def _windows(fixtures: list[dict[str, str]] | None) -> list[Window]:
    return sorted(
        (_when(item["start"]), _when(item["end"]), str(item["slug"])) for item in read_fixtures({"fixtures": fixtures})
    )


def _monday(moment: datetime) -> datetime:
    day = moment.replace(hour=0, minute=0, second=0, microsecond=0)
    return day - timedelta(days=day.weekday())


def _week_of(when: datetime, windows: list[Window]) -> str:
    """The gameweek of Sorare that holds this moment, else the Monday of its calendar week."""
    for start, end, slug in windows:
        if start <= when < end:
            return slug
    return _monday(when).date().isoformat()


@dataclass(frozen=True)
class _Game:
    when: datetime
    raw_date: str
    competition: str
    score: float
    played: bool
    started: bool
    week: str  # the gameweek's slug, or the Monday of the week when Sorare's gameweeks are not known

    @property
    def counted(self) -> float:
        return self.score if self.played else 0.0


def _games(entry: dict[str, Any], windows: list[Window] | None = None) -> list[_Game]:
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
                _week_of(when, windows or []),
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


def _formula(seen: list[_Game], pos: str | None, games: int) -> Prediction:
    """The form formula on his last games, for a week with `games` games and no Sorare projection."""
    newest_first = list(reversed(seen))
    week = PlayerWeek(
        games=games,
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


def _today(seen: list[_Game], target: _Game, pos: str | None) -> Prediction:
    """What the page would have said for one game."""
    return _formula(seen, pos, 1)


MODELS: dict[str, Model] = {"flat45": _flat, "last5": _last5, "last5_class": _last5_class, "today": _today}


# ---------------------------------------------------------------------------------------------------- walking forward
def walk_forward(
    players: dict[str, dict[str, Any]], since: datetime | None = None, fixtures: list[dict[str, str]] | None = None
) -> list[Row]:
    """Every scored game from `since` on, predicted by every model from the games before its week.

    A week is Sorare's own gameweek when `fixtures` (the file's gameweeks) say which one holds the game, else the Monday to
    Sunday week it falls in. Its lock is the earliest of his own games in it, so a second game never sees the first.
    """
    out: list[Row] = []
    windows = _windows(fixtures)
    for slug, entry in players.items():
        games = _games(entry, windows)
        pos = entry.get("pos")
        first_in_week: dict[str, datetime] = {}
        in_week: dict[str, int] = defaultdict(int)
        for game in games:
            first_in_week.setdefault(game.week, game.when)
            in_week[game.week] += 1
        for target in games:
            if since is not None and target.when < since:
                continue
            seen = [game for game in games if game.when < first_in_week[target.week]]
            recent = seen[-5:]
            for name, model in MODELS.items():
                said = model(seen, target, pos)
                out.append(
                    Row(
                        model=name,
                        player=slug,
                        pos=pos,
                        date=target.when,
                        week=target.week,
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
                        form_games=len(recent),
                        form_starts=sum(game.started for game in recent),
                        week_games=in_week[target.week],
                    )
                )
    return out


def walk_gameweeks(
    players: dict[str, dict[str, Any]], fixtures: list[dict[str, str]] | None, since: datetime | None = None
) -> list[Row]:
    """One row per player, Sorare gameweek and model: the expected score of the gameweek against the best of his games in it.

    Sorare counts the best score of a player's games in a gameweek (`multiGameScoreAggregator` is `max` on its competitions),
    zero when he played none. `one_game` is today's formula told he has one game, so what `today` adds to it is what knowing
    about the second game does. The prediction is made from the games before the first of the gameweek's.
    """
    windows = _windows(fixtures)
    out: list[Row] = []
    for slug, entry in players.items():
        games = _games(entry, windows)
        pos = entry.get("pos")
        by_week: dict[str, list[_Game]] = defaultdict(list)
        for game in games:
            by_week[game.week].append(game)
        for week, inside in by_week.items():
            first = inside[0].when
            if since is not None and first < since:
                continue
            seen = [game for game in games if game.when < first]
            recent = seen[-5:]
            said: dict[str, Prediction] = {
                "flat45": {"expected": FLAT},
                "last5": {"expected": _mean_last(seen)},
                "one_game": _formula(seen, pos, 1),
                "today": _formula(seen, pos, len(inside)),
            }
            for name, made in said.items():
                out.append(
                    Row(
                        model=name,
                        player=slug,
                        pos=pos,
                        date=first,
                        week=week,
                        competition=inside[0].competition,
                        klass="national" if any(klass(game.competition) == "national" for game in inside) else "club",
                        before=len(seen),
                        score=max(game.counted for game in inside),
                        played=any(game.played for game in inside),
                        started=any(game.started for game in inside),
                        expected=float(made["expected"] or 0.0),
                        p_play=made.get("p_play"),
                        p_start=made.get("p_start"),
                        start=made.get("start"),
                        mu=made.get("mu"),
                        form_games=len(recent),
                        form_starts=sum(game.started for game in recent),
                        week_games=len(inside),
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


def rank_slices(rows: list[Row]) -> list[dict[str, Any]]:
    """The groups of games, cut by something known before the lock, where today's model loses most to the best simple baseline.

    For each group: the squared error today's model makes against the least of the three baselines' (the mean of squared misses,
    the number that rewards a right average), the difference (`excess`, below zero where today's model is the closest) and that
    difference times the games in the group (`total`, how much squared error would go if today's model were as close as the best
    baseline there). Largest `total` first, so it says where a fix would pay most, and with how many games behind it.
    """
    out: list[dict[str, Any]] = []
    for key, label, known in SLICES:
        if not known:
            continue
        by_value: dict[Any, dict[str, dict[str, Any]]] = defaultdict(dict)
        for row in scores(rows, ["model", key]):
            by_value[row[key]][row["model"]] = row
        for value, models in by_value.items():
            rivals = {name: models[name] for name in BASELINES if name in models}
            if value == NO_FORM or "today" not in models or not rivals:
                continue  # the first game of the history has nothing to go on for any model: it says nothing to fix
            best = min(rivals, key=lambda name: rivals[name]["rmse"])
            today = models["today"]
            excess = today["rmse"] ** 2 - rivals[best]["rmse"] ** 2
            out.append(
                {
                    "slice": label,
                    "value": value,
                    "n": today["n"],
                    "best": best,
                    "today_rmse": today["rmse"],
                    "best_rmse": rivals[best]["rmse"],
                    "bias": today["bias"],
                    "excess": excess,
                    "total": excess * today["n"],
                }
            )
    return sorted(out, key=lambda item: item["total"], reverse=True)


# ---------------------------------------------------------------------------------------------------- better or not
def _miss(row: Row, metric: str) -> float:
    miss = row.expected - row.score
    return miss * miss if metric == "squared" else abs(miss)


def compare(
    rows: list[Row], a: str, b: str, *, seed: int = 0, draws: int = 2000, metric: str = "absolute"
) -> dict[str, Any]:
    """Is model `a` closer than model `b`? The mean of (miss of a) - (miss of b) over the games both predicted, with a 95%
    interval from resampling whole weeks (a week's games move together), so below zero with an interval under zero means closer.

    The miss is the size of the error ("absolute") or its square ("squared"). They can disagree: a score is zero or about
    sixty, so the number that misses least on a typical game is the median, not the average, and an expected score is an
    average. Squared error is the one that rewards getting that right.
    """
    by_game: dict[tuple[str, datetime], dict[str, Row]] = defaultdict(dict)
    for row in rows:
        if row.model in (a, b):
            by_game[(row.player, row.date)][row.model] = row
    weeks: dict[str, list[float]] = defaultdict(list)
    for pair in by_game.values():
        if a in pair and b in pair:
            weeks[pair[a].week].append(_miss(pair[a], metric) - _miss(pair[b], metric))
    if not weeks:
        return {"a": a, "b": b, "metric": metric, "weeks": 0, "n": 0, "diff": None, "lo": None, "hi": None}
    sums = np.array([sum(v) for v in weeks.values()])
    counts = np.array([len(v) for v in weeks.values()], dtype=float)
    diff = float(sums.sum() / counts.sum())
    rng = np.random.default_rng(seed)
    picks = rng.integers(0, len(sums), size=(draws, len(sums)))
    means = sums[picks].sum(axis=1) / counts[picks].sum(axis=1)
    lo, hi = np.percentile(means, [2.5, 97.5])
    return {
        "a": a,
        "b": b,
        "metric": metric,
        "weeks": len(weeks),
        "n": int(counts.sum()),
        "diff": diff,
        "lo": float(lo),
        "hi": float(hi),
    }


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


def _ranking(tuning: list[Row], top: int = 10) -> list[str]:
    ranked = rank_slices(tuning)
    if not ranked:
        return []
    lines = [
        "### Where today's model loses most to the best simple baseline (tuning weeks)",
        "",
        "Slices known before the lock, by the squared error that would go if today's model were as close as the best baseline "
        "there (the difference of mean squared misses times the games). Below zero today's model is the closest.",
        "",
        "| slice | group | games | today RMSE | best baseline | its RMSE | today's bias | squared error to gain |",
        "|---|---|---|---|---|---|---|---|",
    ]
    for item in ranked[:top]:
        lines.append(
            f"| {item['slice']} | {item['value']} | {item['n']} | {_fmt(item['today_rmse'])} | {item['best']} | "
            f"{_fmt(item['best_rmse'])} | {item['bias']:+.1f} | {item['total']:+,.0f} |"
        )
    return [*lines, ""]


def _gameweeks(weeks: list[Row], holdout_from: datetime) -> list[str]:
    """The gameweek-level section: the expected score of a gameweek against the best of his games in it."""
    tuning = [row for row in with_period(weeks, holdout_from) if row.period == "tuning"]
    if not tuning:
        return []
    out = [
        f"### Gameweeks: the expected score of a gameweek against the best of his games in it (tuning, {len({r.week for r in tuning})} gameweeks)",
        "",
        "Sorare's own gameweeks. The best score of his games in one counts (`multiGameScoreAggregator` is `max`), zero if he "
        "played none. `one_game` is today's formula told he has one game, so what `today` adds to it is what knowing about the "
        "second game does.",
        "",
    ]
    out += _table(scores(tuning, ["model"]), ["model"]) + [""]
    out += (
        ["**By games in the gameweek**", ""]
        + _table(scores(tuning, ["model", "games_that_week"]), ["model", "games_that_week"])
        + [""]
    )
    for metric, label in (("absolute", "absolute error"), ("squared", "squared error")):
        result = compare(tuning, "today", "one_game", metric=metric)
        if result["weeks"]:
            verdict = "closer" if result["hi"] < 0 else "further" if result["lo"] > 0 else "no clear difference"
            out.append(
                f"- today against one_game, by {label}: {result['diff']:+.2f} [{result['lo']:+.2f}, {result['hi']:+.2f}] over {result['weeks']} gameweeks: {verdict}"
            )
    return [*out, ""]


def report(rows: list[Row], holdout_from: datetime, weeks: list[Row] | None = None) -> str:
    """The backtest as Markdown: each model overall, then by the slices the plan asks for, tuning weeks and held-out weeks apart.

    `weeks` are the gameweek-level rows (`walk_gameweeks`); with them the report ends with how the gameweek's expected score did.
    """
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
            for key, label, _ in SLICES:
                out += [f"**By {label}**", ""] + _table(scores(part, ["model", key]), ["model", key]) + [""]
    tuning = [row for row in rows if row.period == "tuning"]
    out += _ranking(tuning)
    out += ["### Order within a position and week (tuning weeks)", ""]
    for name in MODELS:
        out.append(f"- {name}: {_fmt(rank_correlation(tuning, name), 2)}")
    out += [
        "",
        "### Is today's model closer than each baseline? (tuning weeks, mean difference of the miss, 95% interval over weeks)",
        "",
        "Below zero with an interval under zero is closer. Absolute error is in points; squared error in points squared, and it is "
        "the one that rewards an average that is right.",
        "",
    ]
    for name in MODELS:
        if name == "today":
            continue
        for metric, label in (("absolute", "absolute error"), ("squared", "squared error")):
            result = compare(tuning, "today", name, metric=metric)
            if result["weeks"]:
                verdict = "closer" if result["hi"] < 0 else "further" if result["lo"] > 0 else "no clear difference"
                out.append(
                    f"- today against {name}, by {label}: {result['diff']:+.2f} [{result['lo']:+.2f}, {result['hi']:+.2f}] over {result['weeks']} weeks: {verdict}"
                )
    if weeks:
        out += ["", *_gameweeks(weeks, holdout_from)]
    return "\n".join(out) + "\n"
