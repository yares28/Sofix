"""E1 · the all-around part of a score, stat by stat (plans/score-engine.md §3 step 3, §7 E1).

Every game of the export is read in kick-off order into a `Book`: for each player and each role (`roles.py`), each of Sorare's 50 stats
counted and the minutes it took, older games weighing less (each stat forgets at its own pace, `tau` days). His rate of a stat per 90
minutes is his count pulled towards his role's rate by `k` ninetieths:

    rate = (his count + k × role rate) / (his minutes / 90 + k)

His all-around if he starts is each rate × his usual minutes as a starter ÷ 90 × the stat's points for his position, summed. Two stats
come from the match instead of his record: goals conceded (his side's expected goals against × his minutes ÷ 90) and a defender's clean
sheet at 60 minutes (his side's clean-sheet chance × his chance of playing 60). The points are read from the games as they come (Sorare's
scoring version 7 until it changes), so a new table follows by itself.
"""

from __future__ import annotations

import json
import math
from collections import defaultdict, deque
from dataclasses import dataclass, field
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import numpy as np

from app.sorare.engine import roles
from app.sorare.keeper import GameNumbers, adjusted_goals

# Sorare's scoring version 7, read from all 38,850 appearances of the export on 28 Oct 2026 (each rebuilt to the point): the table
# used for a stat no game has shown yet. Stats worth 0 everywhere (goals, assists and the other decisive actions) count for the level.
TABLE_V7: dict[str, dict[str, float]] = {
    "GK": {
        "accurate_keeper_sweeper": 3.0, "accurate_long_balls": 0.2, "accurate_pass": 0.1, "adjusted_total_att_assist": 2.0,
        "big_chance_created": 3.0, "cross_not_claimed": -3.0, "dive_catch": 3.5, "dive_save": 3.0, "error_lead_to_shot": -5.0,
        "fouls": -1.0, "gk_smother": 5.0, "goals_conceded": -5.0, "good_high_claim": 1.5, "missed_pass": -0.2,
        "ontarget_scoring_att": 3.0, "poss_lost_ctrl": -0.3, "punches": 1.5, "saved_ibox": 2.0, "saves": 2.0,
        "successful_final_third_passes": 0.5, "yellow_card": -3.0,
    },
    "DEF": {
        "accurate_long_balls": 0.5, "accurate_pass": 0.08, "adjusted_total_att_assist": 3.0, "big_chance_created": 3.0,
        "big_chance_missed": -5.0, "blocked_cross": 1.0, "clean_sheet_60": 10.0, "double_double": 4.0, "duel_lost": -2.0,
        "duel_won": 1.5, "effective_clearance": 0.5, "error_lead_to_shot": -5.0, "fouls": -2.0, "goals_conceded": -4.0,
        "interception_won": 3.0, "long_pass_own_to_opp_success": 0.5, "missed_pass": -0.2, "ontarget_scoring_att": 3.0,
        "outfielder_block": 2.0, "pen_area_entries": 0.5, "penalty_kick_missed": -5.0, "penalty_won": 3.0, "poss_lost_ctrl": -0.6,
        "poss_won": 0.5, "successful_final_third_passes": 0.4, "triple_double": 6.0, "triple_triple": 12.0, "won_contest": 0.5,
        "won_tackle": 3.0, "yellow_card": -3.0,
    },
    "MID": {
        "accurate_long_balls": 0.5, "accurate_pass": 0.1, "adjusted_total_att_assist": 2.0, "big_chance_created": 3.0,
        "big_chance_missed": -5.0, "blocked_cross": 1.0, "double_double": 4.0, "duel_lost": -0.8, "duel_won": 0.8,
        "error_lead_to_shot": -3.0, "fouls": -1.0, "goals_conceded": -2.0, "interception_won": 3.0, "missed_pass": -0.3,
        "ontarget_scoring_att": 3.0, "outfielder_block": 1.0, "pen_area_entries": 0.5, "penalty_kick_missed": -5.0,
        "penalty_won": 3.0, "poss_lost_ctrl": -0.5, "poss_won": 0.5, "successful_final_third_passes": 0.3, "triple_double": 6.0,
        "triple_triple": 12.0, "was_fouled": 1.0, "won_contest": 0.5, "won_tackle": 3.0, "yellow_card": -3.0,
    },
    "FWD": {
        "accurate_pass": 0.1, "adjusted_total_att_assist": 2.0, "big_chance_created": 3.0, "big_chance_missed": -5.0,
        "double_double": 4.0, "duel_lost": -1.0, "duel_won": 1.0, "error_lead_to_shot": -3.0, "fouls": -0.5,
        "interception_won": 3.0, "ontarget_scoring_att": 3.0, "pen_area_entries": 0.5, "penalty_kick_missed": -5.0,
        "penalty_won": 3.0, "poss_lost_ctrl": -0.1, "successful_final_third_passes": 0.1, "triple_double": 6.0,
        "triple_triple": 12.0, "was_fouled": 1.0, "won_contest": 0.5, "yellow_card": -3.0,
    },
}  # fmt: skip
DECISIVE_STATS = (
    "goals", "goal_assist", "assist_penalty_won", "penalty_won", "clearance_off_line", "last_man_tackle", "penalty_save",
    "red_card", "own_goals", "penalty_conceded", "error_lead_to_goal",
)  # fmt: skip
STATS: tuple[str, ...] = tuple(sorted({s for table in TABLE_V7.values() for s in table} | set(DECISIVE_STATS)))
POSITIONS = ("GK", "DEF", "MID", "FWD")
MATCH = ("goals_conceded", "clean_sheet_60")  # from the match, not from his record
GC, CS60 = STATS.index("goals_conceded"), STATS.index("clean_sheet_60")
MINUTES_TAU = 180.0  # days: how fast his record of minutes as a starter forgets
K_MINUTES = 3.0  # starts' worth of his role's minutes while he has few starts
RECENT_ROLES = 5  # his usual role: the most frequent of his last five starts
EPOCH = datetime(2020, 1, 1, tzinfo=UTC)


def day_of(when: str | datetime) -> float:
    """Days since 2020, the clock records forget on."""
    moment = datetime.fromisoformat(when.replace("Z", "+00:00")) if isinstance(when, str) else when
    return (moment - EPOCH).total_seconds() / 86400.0


@dataclass(frozen=True)
class Settings:
    """`k` (ninetieths of his role's rate) and `tau` (days; inf never forgets) for each of `STATS`, in that order."""

    k: np.ndarray
    tau: np.ndarray
    level: dict[str, tuple[float, float]] = field(
        default_factory=dict
    )  # per position: score − all-around with and without a decisive action
    minutes_tau: float = MINUTES_TAU
    k_minutes: float = K_MINUTES

    def to_json(self) -> dict[str, Any]:
        return {
            "k": dict(zip(STATS, map(float, self.k), strict=True)),
            "tau": {s: (None if math.isinf(t) else float(t)) for s, t in zip(STATS, self.tau, strict=True)},
            "level": {pos: list(v) for pos, v in self.level.items()},
            "minutes_tau": None if math.isinf(self.minutes_tau) else self.minutes_tau,
            "k_minutes": self.k_minutes,
        }

    @staticmethod
    def from_json(raw: dict[str, Any]) -> Settings:
        return Settings(
            k=np.array([float(raw["k"].get(s, 4.0)) for s in STATS]),
            tau=np.array([math.inf if raw["tau"].get(s) is None else float(raw["tau"][s]) for s in STATS]),
            level={pos: (float(v[0]), float(v[1])) for pos, v in (raw.get("level") or {}).items()},
            minutes_tau=math.inf
            if raw.get("minutes_tau", MINUTES_TAU) is None
            else float(raw.get("minutes_tau", MINUTES_TAU)),
            k_minutes=float(raw.get("k_minutes", K_MINUTES)),
        )


def save(path: Path, settings: Settings) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(settings.to_json(), indent=2) + "\n", "utf-8")


def load(path: Path) -> Settings | None:
    return Settings.from_json(json.loads(path.read_text("utf-8"))) if path.exists() else None


class _Acc:
    """Counts and minutes so far, each stat's older games weighed down by its `tau`."""

    __slots__ = ("c", "m", "t")

    def __init__(self) -> None:
        self.c = np.zeros(len(STATS))
        self.m = np.zeros(len(STATS))
        self.t = -math.inf

    def now(self, t: float, tau: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
        if self.t == -math.inf:
            return self.c, self.m
        f = np.exp(-max(0.0, t - self.t) / tau)
        return self.c * f, self.m * f

    def add(self, t: float, tau: np.ndarray, counts: np.ndarray, mins: float) -> None:
        self.c, self.m = self.now(t, tau)
        self.c = self.c + counts
        self.m = self.m + mins
        self.t = t


class _Starts:
    """His starts so far, older ones weighing less: how many, their minutes and how many reached 60."""

    __slots__ = ("n", "mins", "full", "t", "tau")

    def __init__(self, tau: float = MINUTES_TAU) -> None:
        self.n = self.mins = self.full = 0.0
        self.t = -math.inf
        self.tau = tau

    def now(self, t: float) -> tuple[float, float, float]:
        f = 1.0 if self.t == -math.inf else math.exp(-max(0.0, t - self.t) / self.tau)
        return self.n * f, self.mins * f, self.full * f

    def add(self, t: float, mins: float) -> None:
        n, total, full = self.now(t)
        self.n, self.mins, self.full, self.t = n + 1, total + mins, full + (mins >= 60), t


def counts_of(row: dict[str, Any]) -> np.ndarray:
    out = np.zeros(len(STATS))
    for name, pair in (row.get("stats") or {}).items():
        if name in _INDEX:
            out[_INDEX[name]] = float(pair[0])
    return out


_INDEX = {s: i for i, s in enumerate(STATS)}


def starters(game: dict[str, Any]) -> dict[str, str]:
    """Each starter's role in this game, from both elevens."""
    found: dict[str, str] = {}
    for side in ("home", "away"):
        found.update(roles.roles_of(((game.get("xi") or {}).get(side) or {}).get("start") or []))
    return found


class Book:
    """Every game so far, player by player and role by role (see the module's doc)."""

    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        self.players: dict[str, _Acc] = defaultdict(_Acc)
        self.roles: dict[str, _Acc] = defaultdict(_Acc)
        self.starts: dict[str, _Starts] = defaultdict(lambda: _Starts(settings.minutes_tau))
        self.role_starts: dict[str, _Starts] = defaultdict(lambda: _Starts(settings.minutes_tau))
        self.recent: dict[str, deque[str]] = defaultdict(lambda: deque(maxlen=RECENT_ROLES))
        self.points = {pos: np.array([TABLE_V7[pos].get(s, 0.0) for s in STATS]) for pos in POSITIONS}
        self.last = -math.inf

    def add(self, game: dict[str, Any]) -> None:
        t = day_of(game["date"])
        tau = self.settings.tau
        role_of = starters(game)
        for slug, row in game["players"].items():
            mins = float(row.get("mins") or 0)
            if not row.get("played") or mins <= 0:
                continue
            counts = counts_of(row)
            self.players[slug].add(t, tau, counts, mins)
            pos = row.get("pos")
            if pos in self.points:
                for name, pair in (row.get("stats") or {}).items():
                    if name in _INDEX and pair[0]:
                        self.points[pos][_INDEX[name]] = float(pair[1]) / float(pair[0])
            if row.get("started"):
                role = role_of.get(slug) or self.usual_role(slug, pos or "")
                self.roles[role].add(t, tau, counts, mins)
                self.starts[slug].add(t, mins)
                self.role_starts[role].add(t, mins)
                self.recent[slug].append(role)
        self.last = max(self.last, t)

    def usual_role(self, slug: str, pos: str) -> str:
        seen = self.recent.get(slug)
        if not seen:
            return roles.DEFAULT.get(pos, "CM")
        return max(dict.fromkeys(reversed(seen)), key=list(seen).count)  # most frequent, the latest on a tie

    def role_rate(self, role: str, at: float | None = None) -> np.ndarray:
        c, m = self.roles[role].now(self.last if at is None else at, self.settings.tau)
        return np.divide(c * 90.0, m, out=np.zeros(len(STATS)), where=m > 0)

    def rate(self, slug: str, role: str, at: float | None = None) -> np.ndarray:
        """His rate of each stat per 90 minutes, pulled towards his role's."""
        t = self.last if at is None else at
        base = self.role_rate(role, t)
        acc = self.players.get(slug)
        if acc is None:
            return base
        c, m = acc.now(t, self.settings.tau)
        k = self.settings.k
        top, bottom = c + k * base, m / 90.0 + k
        return np.divide(top, bottom, out=base.copy(), where=bottom > 0)

    def minutes(self, slug: str, role: str, at: float | None = None) -> tuple[float, float]:
        """His usual minutes as a starter and his chance of playing 60, each pulled towards his role's by `k_minutes` starts."""
        t = self.last if at is None else at
        rn, rmins, rfull = self.role_starts[role].now(t)
        role_mins = rmins / rn if rn else 80.0
        role_full = rfull / rn if rn else 0.85
        n, mins, full = self.starts[slug].now(t) if slug in self.starts else (0.0, 0.0, 0.0)
        k = self.settings.k_minutes
        return (mins + k * role_mins) / (n + k), (full + k * role_full) / (n + k)


def expected_counts(
    slug: str,
    pos: str,
    book: Book,
    numbers: GameNumbers | None,
    role: str | None = None,
    at: float | None = None,
    factor: np.ndarray | None = None,
    clean_sheet: float | None = None,
) -> np.ndarray:
    """What he is expected to make of each stat if he starts. `factor` is this game's multiplier on each rate (E2's style, venue and
    game state); `clean_sheet` replaces his side's clean-sheet chance from the match (E4's corrected one)."""
    role = role or book.usual_role(slug, pos)
    mins, p60 = book.minutes(slug, role, at)
    counts = book.rate(slug, role, at) * mins / 90.0
    if factor is not None:
        counts = counts * factor
    if numbers is not None:
        cs, xga, _ = adjusted_goals(numbers)
        counts[GC] = xga * mins / 90.0
        counts[CS60] = p60 * (cs if clean_sheet is None else clean_sheet)
    return counts


def expected(
    slug: str, pos: str, book: Book, numbers: GameNumbers | None, role: str | None = None, at: float | None = None
) -> float:
    """His all-around if he starts."""
    return float(expected_counts(slug, pos, book, numbers, role, at) @ book.points[pos])


def points_from(games: list[dict[str, Any]]) -> dict[str, dict[str, float]]:
    """The points of each stat per position, as the latest of these games gave them."""
    book = Book(Settings(k=np.zeros(len(STATS)), tau=np.full(len(STATS), math.inf)))
    for g in sorted(games, key=lambda one: one["date"]):
        book.add(g)
    return {pos: {s: float(v) for s, v in zip(STATS, book.points[pos], strict=True)} for pos in POSITIONS}
