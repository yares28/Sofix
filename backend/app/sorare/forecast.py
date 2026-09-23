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


def _from_form(history: list[tuple[str, float, bool]]) -> tuple[float, float]:
    last = history[:5]
    played = [score for _, score, ok in last if ok]
    plays = (len(played) + 1.2) / (len(last) + 2.0) if last else PRIOR_PLAYS
    mu = (sum(played) + 2 * PRIOR_SCORE) / (len(played) + 2)
    return plays, mu


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
    # A double gameweek: he has to miss both to score nothing, and the better of the two games counts.
    p_any = 1 - (1 - plays) ** week.games
    if week.games > 1 and p_any > 0:
        mu += 0.56 * sd * plays * plays / p_any
    return Forecast(p_play=round(p_any, 4), mu=round(mu, 2), games=week.games, source=source, actual=week.actual)


def forecasts(weeks: dict[str, PlayerWeek], sd: float = SCORE_SD) -> dict[str, Forecast]:
    return {player: forecast(week, sd) for player, week in weeks.items()}
