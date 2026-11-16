"""The engine tuned and walked forward (plans/score-engine.md §5, §7 E1-E4).

`tune` fits every setting on the games before `data.TUNE_UNTIL` (2023/24 and 2024/25, the first three months only filling the record):
each stat's pull towards its role (`k`) and memory (`tau`), the minutes record, the clubs' and venues' pull towards 1, the game state's
coefficients, the clean-sheet correction and the decisive actions' correction per position. Nothing is tuned on 2025/26 or later.

`walk` then reads every game in kick-off order and, for each LaLiga start from `since`, says what each phase would have said from the
games before that day only:

- `e1` his all-around from his rates (his usual role, his usual minutes);
- `e2` the same moved by the opponent's style, home or away and the game state;
- `e3` the same with tonight's role from the official eleven and the tuned minutes record;
- `e4` his own decisive level from each kind's chance, and his whole expected score on top of `e3`'s all-around; `e4_usual` the same
  with his usual role (before the eleven is out, as the refresh runs).

E1 to E3 are all-around parts: the ruler (`app.jobs.engine_check`) adds the shipped line's decisive part to them (its chance × the level
points a start with and without one gives, `levels`), as E1.4 says. E4 is a whole score.
"""

from __future__ import annotations

import json
import math
from collections import defaultdict
from collections.abc import Callable, Iterator
from dataclasses import dataclass, field, replace
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import numpy as np

from app.sorare.engine import allround, data, decisive, style
from app.sorare.engine.allround import STATS, Book, Settings
from app.sorare.engine.style import Style, StyleSettings
from app.sorare.keeper import GameNumbers, adjusted_goals

ARTIFACT = Path(__file__).resolve().parents[3] / "artifacts" / "score_engine.json"
WARM_UP = "2023-11-01"  # the first games only fill the record
TAUS = (45.0, 90.0, 180.0, 365.0, math.inf)
KS = (0.25, 0.5, 1.0, 2.0, 4.0, 8.0, 16.0, 32.0, 64.0, 128.0, 256.0, 1024.0)
MINUTE_TAUS = (90.0, 180.0, 365.0, math.inf)
MINUTE_KS = (1.0, 2.0, 4.0, 8.0)
STYLE_MS = (1.0, 2.0, 5.0, 10.0, 20.0, 50.0, 100.0, 1e9)
_N = len(STATS)


@dataclass(frozen=True)
class EngineSettings:
    rates: Settings  # E1 (minutes at their first defaults)
    style: StyleSettings  # E2
    minutes_tau: float = allround.MINUTES_TAU  # E3
    k_minutes: float = allround.K_MINUTES
    clean_sheet: tuple[float, float] = (0.0, 1.0)  # E4: a + b × logit(the football model's chance)
    scale: dict[str, float] = field(default_factory=dict)  # E4: per position, the decisive counts' correction
    through: str = data.TUNE_UNTIL

    def tuned_rates(self) -> Settings:
        return replace(self.rates, minutes_tau=self.minutes_tau, k_minutes=self.k_minutes)

    def to_json(self) -> dict[str, Any]:
        return {
            "through": self.through,
            "rates": self.rates.to_json(),
            "style": self.style.to_json(),
            "minutes_tau": None if math.isinf(self.minutes_tau) else self.minutes_tau,
            "k_minutes": self.k_minutes,
            "clean_sheet": list(self.clean_sheet),
            "scale": self.scale,
        }

    @staticmethod
    def from_json(raw: dict[str, Any]) -> EngineSettings:
        return EngineSettings(
            rates=Settings.from_json(raw["rates"]),
            style=StyleSettings.from_json(raw["style"]),
            minutes_tau=math.inf if raw.get("minutes_tau") is None else float(raw["minutes_tau"]),
            k_minutes=float(raw["k_minutes"]),
            clean_sheet=(float(raw["clean_sheet"][0]), float(raw["clean_sheet"][1])),
            scale={pos: float(v) for pos, v in (raw.get("scale") or {}).items()},
            through=str(raw.get("through") or data.TUNE_UNTIL),
        )


def save(path: Path, settings: EngineSettings) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(settings.to_json(), indent=2) + "\n", "utf-8")


def load(path: Path = ARTIFACT) -> EngineSettings | None:
    return EngineSettings.from_json(json.loads(path.read_text("utf-8"))) if path.exists() else None


# --------------------------------------------------------------------------- reading the games in order
@dataclass(frozen=True)
class Seat:
    """One start, as known before the game: who, where, against whom, the match's numbers."""

    slug: str
    row: dict[str, Any]
    pos: str
    home: bool
    team: str
    opponent: str
    role: str | None  # tonight's, from the official eleven
    numbers: GameNumbers
    t: float
    when: datetime
    conceded: int  # what his side conceded (known only after: for the checks)


def _seats(game: dict[str, Any]) -> Iterator[Seat]:
    forecast = (game.get("ctx") or {}).get("forecast")
    if not forecast:
        return
    price = ((game.get("ctx") or {}).get("ou") or {}).get("p_over")
    when = datetime.fromisoformat(game["date"].replace("Z", "+00:00")).astimezone(UTC)
    t = allround.day_of(when)
    role_of = allround.starters(game)
    home_slug, away_slug = game["home"]["slug"], game["away"]["slug"]
    for slug, row in game["players"].items():
        if not row.get("started") or row.get("pos") not in allround.POSITIONS:
            continue
        home = row["team"] == home_slug
        yield Seat(
            slug=slug,
            row=row,
            pos=row["pos"],
            home=home,
            team=home_slug if home else away_slug,
            opponent=away_slug if home else home_slug,
            role=role_of.get(slug),
            numbers=GameNumbers(
                cs=float(forecast["cs_h" if home else "cs_a"]),
                xga=float(forecast["lam_a" if home else "lam_h"]),
                xgf=float(forecast["lam_h" if home else "lam_a"]),
                p_over=float(price) if price is not None and price == price else None,
            ),
            t=t,
            when=when,
            conceded=int(game["awayGoals"] if home else game["homeGoals"]),
        )


def _days(games: list[dict[str, Any]], until: str | None = None) -> Iterator[list[dict[str, Any]]]:
    by_day: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for g in games:
        if until is None or g["date"] < until:
            by_day[g["date"][:10]].append(g)
    for day in sorted(by_day):
        yield by_day[day]


def _read(
    games: list[dict[str, Any]],
    books: list[Book],
    styles: list[Style],
    visit: Callable[[Seat], None],
    since: str,
    until: str | None,
) -> None:
    """Each day: every start from `since` visited from the record before that day, then the day's games added."""
    for day in _days(games, until):
        if day[0]["date"] >= since:
            for g in day:
                for seat in _seats(g):
                    visit(seat)
        for g in day:
            for s in styles:
                s.observe(g, books[0])
        for g in day:
            for b in books:
                b.add(g)


def _deviance(y: np.ndarray, mu: np.ndarray) -> np.ndarray:
    mu = np.maximum(mu, 1e-6)
    return (2 * (np.where(y > 0, y * np.log(np.maximum(y, 1e-12) / mu), 0.0) - (y - mu))).sum(axis=0)


# --------------------------------------------------------------------------- tuning
def _rate_inputs(games: list[dict[str, Any]], tau: float) -> tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray]:
    """For each tuning start, with every stat forgetting at `tau`: his counts and minutes so far, his role's rate, what he made, his
    minutes."""
    book = Book(Settings(k=np.zeros(_N), tau=np.full(_N, tau)))
    mine: list[np.ndarray] = []
    role_rate: list[np.ndarray] = []
    made: list[np.ndarray] = []
    minutes: list[float] = []

    def visit(seat: Seat) -> None:
        mins = float(seat.row.get("mins") or 0)
        if mins <= 0:
            return
        role = seat.role or book.usual_role(seat.slug, seat.pos)
        acc = book.players.get(seat.slug)
        c, m = acc.now(seat.t, book.settings.tau) if acc else (np.zeros(_N), np.zeros(_N))
        mine.append(np.concatenate([c, m]))
        role_rate.append(book.role_rate(role, seat.t))
        made.append(allround.counts_of(seat.row))
        minutes.append(mins)

    _read(games, [book], [], visit, WARM_UP, data.TUNE_UNTIL)
    return np.array(mine), np.array(role_rate), np.array(made), np.array(minutes)[:, None]


def _tune_rates(games: list[dict[str, Any]]) -> Settings:
    """Per stat, the (tau, k) whose rates best foretold each start's counts (Poisson deviance, his real minutes and role)."""
    loss = np.zeros((len(TAUS), len(KS), _N))
    for ti, tau in enumerate(TAUS):
        p, r, y, mn = _rate_inputs(games, tau)
        c, m = p[:, :_N], p[:, _N:]
        for ki, k in enumerate(KS):
            loss[ti, ki] = _deviance(y, (c + k * r) / (m / 90 + k) * mn / 90)
    best = [np.unravel_index(np.argmin(loss[:, :, j]), loss.shape[:2]) for j in range(_N)]
    return Settings(k=np.array([KS[b[1]] for b in best]), tau=np.array([TAUS[b[0]] for b in best]))


def _tune_minutes(games: list[dict[str, Any]], rates: Settings) -> tuple[float, float]:
    """The minutes record's memory and pull with the smallest typical miss of minutes as a starter (tonight's role)."""
    best, best_miss = (allround.MINUTES_TAU, allround.K_MINUTES), math.inf
    for tau in MINUTE_TAUS:
        for k in MINUTE_KS:
            book = Book(replace(rates, minutes_tau=tau, k_minutes=k))
            misses: list[float] = []

            def visit(seat: Seat, book: Book = book, misses: list[float] = misses) -> None:
                role = seat.role or book.usual_role(seat.slug, seat.pos)
                misses.append(abs(book.minutes(seat.slug, role, seat.t)[0] - float(seat.row.get("mins") or 0)))

            _read(games, [book], [], visit, WARM_UP, data.TUNE_UNTIL)
            if float(np.mean(misses)) < best_miss:
                best, best_miss = (tau, k), float(np.mean(misses))
    return best


def _tune_style(games: list[dict[str, Any]], rates: Settings) -> StyleSettings:
    """Per stat, the clubs' and the venues' pull (games' worth), then the game state's coefficients per position."""
    book = Book(rates)
    looker = Style(style.neutral())
    base: list[np.ndarray] = []
    clubs: list[np.ndarray] = []
    venues: list[np.ndarray] = []
    made: list[np.ndarray] = []
    state_x: list[list[float]] = []
    positions: list[str] = []

    def snapshot(found: Any, t: float) -> np.ndarray:
        if found is None:
            return np.zeros(2 * _N + 1)
        a, e, n = found.now(t)
        return np.concatenate([a, e, [n]])

    def visit(seat: Seat) -> None:
        mins = float(seat.row.get("mins") or 0)
        if mins <= 0 or seat.slug not in book.players:
            return
        role = seat.role or book.usual_role(seat.slug, seat.pos)
        base.append(book.rate(seat.slug, role, seat.t) * mins / 90)
        clubs.append(snapshot(looker.clubs.get((seat.opponent, role)), seat.t))
        venues.append(snapshot(looker.venues.get((seat.home, role)), seat.t))
        made.append(allround.counts_of(seat.row))
        usual_for, usual_against = looker.usual(seat.team, seat.t)
        state_x.append([seat.numbers.xgf - usual_for, seat.numbers.xga - usual_against])
        positions.append(seat.pos)

    _read(games, [book], [looker], visit, WARM_UP, data.TUNE_UNTIL)
    b, c, v, y = np.array(base), np.array(clubs), np.array(venues), np.array(made)
    x, pos = np.array(state_x), np.array(positions)

    def factor(snap: np.ndarray, m: np.ndarray) -> np.ndarray:
        a, e, n = snap[:, :_N], snap[:, _N : 2 * _N], snap[:, 2 * _N :]
        prior = np.divide(m * e, n, out=np.zeros_like(e), where=n > 0)
        return np.divide(a + prior, e + prior, out=np.ones_like(e), where=(e + prior) > 0)

    def pick(offset: np.ndarray, snap: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
        losses = np.array([_deviance(y, offset * factor(snap, np.full(_N, m))) for m in STYLE_MS])
        chosen = np.array([STYLE_MS[i] for i in losses.argmin(axis=0)])
        return chosen, factor(snap, chosen)

    m_club, f_club = pick(b, c)
    m_venue, f_venue = pick(b * f_club, v)
    offset = np.maximum(b * f_club * f_venue, 1e-9)
    state = {p: style.fit_state(x[pos == p], offset[pos == p], y[pos == p]) for p in allround.POSITIONS}
    for coefficients in state.values():
        coefficients[:, ~style.FREE] = 0.0
    return StyleSettings(m_club=m_club, m_venue=m_venue, state=state)


def _logistic1(x: np.ndarray, y: np.ndarray) -> tuple[float, float]:
    """a, b of log-odds(y) = a + b x, by Newton's method."""
    beta = np.array([0.0, 1.0])
    x1 = np.column_stack([np.ones(len(x)), x])
    for _ in range(30):
        p = 1 / (1 + np.exp(-(x1 @ beta)))
        beta = beta + np.linalg.solve(x1.T @ (x1 * (p * (1 - p))[:, None]) + 1e-6 * np.eye(2), x1.T @ (y - p))
    return float(beta[0]), float(beta[1])


def tune(games: list[dict[str, Any]]) -> EngineSettings:
    """Every setting from the tuning seasons (see the module's doc)."""
    rates = _tune_rates(games)
    tau_m, k_m = _tune_minutes(games, rates)
    style_settings = _tune_style(games, rates)
    settings = EngineSettings(rates=rates, style=style_settings, minutes_tau=tau_m, k_minutes=k_m)
    # the clean-sheet correction, on every side of the tuning games (one row per side, from its keeper's start)
    logits: list[float] = []
    kept: list[float] = []
    for g in games:
        if not (WARM_UP <= g["date"] < data.TUNE_UNTIL):
            continue
        for seat in _seats(g):
            if seat.pos == "GK":
                cs = min(max(adjusted_goals(seat.numbers)[0], 1e-4), 1 - 1e-4)
                logits.append(math.log(cs / (1 - cs)))
                kept.append(float(seat.conceded == 0))
    settings = replace(settings, clean_sheet=_logistic1(np.array(logits), np.array(kept)))
    # the decisive correction per position, on E4's own counts
    lam: dict[str, list[tuple[float, float]]] = defaultdict(list)
    hit: dict[str, list[bool]] = defaultdict(list)

    def visit(case: Case) -> None:
        lam[case.pos].append((case.lam_positive, case.p_clean_sheet))
        hit[case.pos].append(case.level >= 1)

    walk(games, settings, WARM_UP, data.TUNE_UNTIL, on_case=visit)
    scale = {p: decisive.fit_scale(lam[p], hit[p]) for p in allround.POSITIONS if lam[p]}
    return replace(settings, scale=scale)


# --------------------------------------------------------------------------- walking forward
@dataclass(frozen=True)
class Case:
    """One start: what each phase said from the games before that day, and what happened."""

    player: str
    pos: str
    when: datetime
    score: float
    all_around: float  # what he made
    level: int  # his decisive level (−3 to 5)
    minutes: int
    said: dict[str, float]  # e1, e2, e3: all-around parts; e4: his whole expected score; e4_aa its all-around part
    levels: tuple[
        float, float
    ]  # score − all-around, on earlier starts of his position, with and without a decisive action
    minutes_said: float  # E3's minutes as a starter
    p_decisive: float  # E4
    p_negative: float
    kinds: dict[str, float]  # E4's chance of each kind
    happened: dict[str, bool]  # whether each kind happened
    lam_positive: float  # E4's expected count of positive decisive actions (before its correction)
    p_clean_sheet: float  # E4's keeper's clean sheet (0 for the others)


def _level(row: dict[str, Any]) -> int:
    for level, pts in decisive.POINTS.items():
        if abs(float(row.get("level") or 0.0) - pts) < 0.5:
            return level
    return 0


def walk(
    games: list[dict[str, Any]],
    settings: EngineSettings,
    since: str,
    until: str | None = None,
    on_case: Callable[[Case], None] | None = None,
) -> list[Case]:
    """Every start from `since` to `until`, each phase's number from the games before that day."""
    first = Book(settings.rates)  # E1, E2: his usual minutes as first set
    book = Book(settings.tuned_rates())  # E3, E4
    looker = Style(settings.style)
    totals: dict[str, list[list[float]]] = defaultdict(lambda: [[0.0, 0.0], [0.0, 0.0]])
    out: list[Case] = []
    stat = {s: i for i, s in enumerate(STATS)}
    a, b = settings.clean_sheet

    def visit(seat: Seat) -> None:
        usual = first.usual_role(seat.slug, seat.pos)
        tonight = seat.role or book.usual_role(seat.slug, seat.pos)
        num, t = seat.numbers, seat.t
        f_usual = looker.factor(seat.opponent, seat.team, seat.home, usual, seat.pos, num.xgf, num.xga, t)
        f_tonight = looker.factor(seat.opponent, seat.team, seat.home, tonight, seat.pos, num.xgf, num.xga, t)
        points = book.points[seat.pos]
        e1 = allround.expected_counts(seat.slug, seat.pos, first, num, usual, t)
        e2 = allround.expected_counts(seat.slug, seat.pos, first, num, usual, t, f_usual)
        e3 = allround.expected_counts(seat.slug, seat.pos, book, num, tonight, t, f_tonight)
        cs = decisive.correct_clean_sheet(adjusted_goals(num)[0], a, b)
        e4 = allround.expected_counts(seat.slug, seat.pos, book, num, tonight, t, f_tonight, clean_sheet=cs)
        keeper_cs = cs if seat.pos == "GK" else 0.0
        level = decisive.level_of(e4, keeper_cs, settings.scale.get(seat.pos, 1.0))
        aa4 = float(e4 @ points)
        # the same before the eleven is out: his usual role (what the refresh knows)
        e4u = allround.expected_counts(
            seat.slug, seat.pos, book, num, book.usual_role(seat.slug, seat.pos), t, f_usual, clean_sheet=cs
        )
        level_u = decisive.level_of(e4u, keeper_cs, settings.scale.get(seat.pos, 1.0))
        (sum_dec, n_dec), (sum_plain, n_plain) = totals[seat.pos]
        stats = seat.row.get("stats") or {}
        happened = {k: float((stats.get(k) or (0, 0))[0]) > 0 for k in decisive.POSITIVE}
        happened["clean_sheet"] = seat.pos == "GK" and seat.conceded == 0
        actual_level = _level(seat.row)
        case = Case(
            player=seat.slug,
            pos=seat.pos,
            when=seat.when,
            score=float(seat.row["score"]),
            all_around=float(seat.row.get("aa") or 0.0),
            level=actual_level,
            minutes=int(seat.row.get("mins") or 0),
            said={
                "e1": float(e1 @ points),
                "e2": float(e2 @ points),
                "e3": float(e3 @ points),
                "e4": level.score(aa4),
                "e4_aa": aa4,
                "e4_usual": level_u.score(float(e4u @ points)),
            },
            levels=(sum_dec / n_dec if n_dec else 30.0, sum_plain / n_plain if n_plain else 35.0),
            minutes_said=book.minutes(seat.slug, tonight, t)[0],
            p_decisive=level.p_decisive,
            p_negative=level.p_negative,
            kinds=level.kinds,
            happened=happened,
            lam_positive=float(sum(e4[stat[k]] for k in decisive.POSITIVE)),
            p_clean_sheet=keeper_cs,
        )
        if on_case is not None:
            on_case(case)
        else:
            out.append(case)

    for day in _days(games, until):
        if day[0]["date"] >= since:
            for g in day:
                for seat in _seats(g):
                    visit(seat)
        for g in day:
            looker.observe(g, first)
        for g in day:
            first.add(g)
            book.add(g)
            for row in g["players"].values():
                if row.get("started") and row.get("pos") in allround.POSITIONS and row.get("played"):
                    side = totals[row["pos"]][0 if float(row.get("level") or 0) >= 60 else 1]
                    side[0] += float(row["score"]) - float(row.get("aa") or 0.0)
                    side[1] += 1
    return out
