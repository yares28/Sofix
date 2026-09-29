"""What each of your players is expected to do in a gameweek.

Two sources, in this order:

1. **Sorare's own numbers**, published about two days before the lock: its projected score ("if he plays") and
   the bookmakers' starting chances it shows (starter / substitute / not playing).
2. **The player's last five games**, when Sorare hasn't published yet: how often he played, and what he scored.

Both are only ever read from before the lock, so a replay of a played gameweek stays honest. S4 replaces this with
a fitted model that has to beat Sorare's projection.
"""

from __future__ import annotations

from dataclasses import dataclass, field

from app.sorare.model import Forecast
from app.sorare.planner import SCORE_SD

PRIOR_SCORE = 45.0  # a Sorare score around which players without a record sit
PRIOR_PLAYS = 0.6
# The two-score split (O9). Measured on 8 LaLiga clubs' squads, 20 Jul to 29 Sep 2026 (plans/overlay.md, O9): a start
# scored 51.0 on average (206 starts), a substitute appearance 41.9 in about 22 minutes (87), and an outfield player
# came on in 30% of the games he did not start, a goalkeeper in 1% (72). They only pull a short record towards the
# norm; a player's own games and Sorare's odds override them.
PRIOR_START_SCORE = 51.0
PRIOR_SUB_SCORE = 42.0
PRIOR_ON = {"GK": 0.02}
PRIOR_ON_OUTFIELD = 0.30
REGULAR_STARTER = 0.75  # of the games he plays, the share he starts, above which Sorare's projection is his start score
NATIONAL = {
    "uefa-nations-league",
    "fifa-world-cup",
    "international-friendlies",
    "uefa-euro",
    "copa-america",
    "africa-cup-of-nations",
    "world-cup-qualification-uefa",
    "global-cup",
}


@dataclass
class PlayerWeek:
    """Everything known about one player for one gameweek, before its lock."""

    games: int = 0  # his games inside the gameweek
    projection: float | None = None  # Sorare's projected score, "if he plays"
    plays_odds: float | None = None  # starter + substitute chance, 0–1
    history: list[tuple[str, float, bool]] = field(default_factory=list)  # (date, score, played), newest first
    actual: float | None = None  # what he really scored (a played gameweek only)
    start_odds: float | None = None  # Sorare's starter chance alone, 0-1 (`plays_odds` is starter + substitute)
    starts: dict[str, bool] = field(default_factory=dict)  # date -> he started, for the games in `history` he played
    pos: str | None = None  # "GK", "DEF", "MID" or "FWD"


def _from_form(history: list[tuple[str, float, bool]]) -> tuple[float, float]:
    last = history[:5]
    played = [score for _, score, ok in last if ok]
    plays = (len(played) + 1.2) / (len(last) + 2.0) if last else PRIOR_PLAYS
    mu = (sum(played) + 2 * PRIOR_SCORE) / (len(played) + 2)
    return plays, mu


def _split(week: PlayerWeek, base_mu: float, plays: float) -> tuple[float, float, float, float]:
    """(start, bench, p_start, p_on) for one game: his score if he starts, if he does not, and the chance of each.

    His last five games say how he is used: a start, a substitute appearance or a miss. Sorare's starter and
    substitute odds replace that for the chances when it has published them. A regular starter's start score is
    Sorare's projection (which is "if he plays"); for anyone who often comes on it is his own starts, smoothed.
    """
    last = week.history[:5]
    started = [score for date, score, ok in last if ok and week.starts.get(date) is True]
    came_on = [score for date, score, ok in last if ok and week.starts.get(date) is False]
    n = len(last)
    have_odds = week.start_odds is not None and week.plays_odds is not None
    if have_odds:
        p_start = float(week.start_odds or 0.0)
        p_on = max(0.0, float(week.plays_odds or 0.0) - p_start)
    elif week.starts:
        p_start = (len(started) + 0.8) / (n + 2.0)  # the prior chance of playing, 0.6, split two to one
        p_on = (len(came_on) + 0.4) / (n + 2.0)
    else:  # roles were never recorded for these games: split the chance of playing as the prior does
        p_start, p_on = plays * 2 / 3, plays / 3

    share_start = p_start / (p_start + p_on) if p_start + p_on > 0 else 0.0
    if not started or (week.projection is not None and share_start >= REGULAR_STARTER):
        start = base_mu
    else:
        start = (sum(started) + 2 * PRIOR_START_SCORE) / (len(started) + 2)

    if have_odds:  # of the games he does not start, how many he still plays
        benched = 1.0 - p_start
        p_on_if_benched = p_on / benched if benched > 0 else 0.0
    else:
        not_started = len(came_on) + sum(1 for _, _, ok in last if not ok)
        prior = PRIOR_ON.get(week.pos or "", PRIOR_ON_OUTFIELD)
        p_on_if_benched = (len(came_on) + 2 * prior) / (not_started + 2.0)
    score_on = (sum(came_on) + 2 * PRIOR_SUB_SCORE) / (len(came_on) + 2)
    return start, p_on_if_benched * score_on, min(p_start, 1.0), min(p_on, 1.0)


def forecast(week: PlayerWeek, sd: float = SCORE_SD) -> Forecast:
    if week.games <= 0:
        return Forecast(p_play=0.0, mu=PRIOR_SCORE, games=0, source="no game", actual=week.actual)
    plays, mu = _from_form(week.history)
    source = "form"
    if week.projection is not None:
        mu = week.projection
        source = "sorare"
    if week.plays_odds is not None:
        plays = week.plays_odds
        source = "sorare"
    start, bench, p_start, p_on = _split(week, mu, plays)
    # A double gameweek: he has to miss both to score nothing, and the better of the two games counts.
    p_any = 1 - (1 - plays) ** week.games
    if week.games > 1 and p_any > 0:
        mu += 0.56 * sd * plays * plays / p_any
    return Forecast(
        p_play=round(p_any, 4),
        mu=round(mu, 2),
        games=week.games,
        source=source,
        actual=week.actual,
        start=round(start, 1),
        bench=round(bench, 1),
        p_start=round(p_start, 3),
        p_on=round(p_on, 3),
    )


def forecasts(weeks: dict[str, PlayerWeek], sd: float = SCORE_SD) -> dict[str, Forecast]:
    return {player: forecast(week, sd) for player, week in weeks.items()}
