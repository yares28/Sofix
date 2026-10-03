"""What each of your players is expected to do in a gameweek.

His score if he plays, from two sources in this order:

1. **Sorare's own numbers**, published about two days before the lock: its projected score ("if he plays").
2. **The player's last five games**, when Sorare hasn't published yet: what he scored.

His chance of starting a game, and so of playing it, from three, game by game:

1. **Futbol Fantasy's expected lineup** for that game, when it has one (plans/futbolfantasy.md, S3);
2. **Sorare's** starting odds (the bookmakers' starter / substitute / not playing);
3. **The app's own**, from how he was used in his last five games.

All are only ever read from before the lock, so a replay of a played gameweek stays honest. A player with no Futbol
Fantasy number for any of his games is answered exactly as he was before it existed.
"""

from __future__ import annotations

import dataclasses
from dataclasses import dataclass, field
from typing import Any, NamedTuple

from app.sorare.model import Forecast, GameChance
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


@dataclass(frozen=True)
class GameStart:
    """What Futbol Fantasy says about one of his games: the only source that speaks game by game."""

    game: str  # Sorare's id for the game
    p_start: float  # 0 to 1: the chance it gives him of starting it
    out: bool = False  # injured or suspended: he will not play at all, so there is no coming on from the bench either
    info: dict[str, Any] = field(
        default_factory=dict
    )  # for the page, carried untouched: when it was read, status, link


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
    game_ids: list[str] = field(default_factory=list)  # his games in kickoff order; needed to use `game_starts`
    game_starts: list[GameStart] = field(default_factory=list)  # Futbol Fantasy's number, for the games it has


def _from_form(history: list[tuple[str, float, bool]]) -> tuple[float, float]:
    last = history[:5]
    played = [score for _, score, ok in last if ok]
    plays = (len(played) + 1.2) / (len(last) + 2.0) if last else PRIOR_PLAYS
    mu = (sum(played) + 2 * PRIOR_SCORE) / (len(played) + 2)
    return plays, mu


class Split(NamedTuple):
    start: float  # his score if he starts
    bench: float  # the old "benched" number: the chance he comes on if benched x what a substitute scores
    p_start: float
    p_on: float
    benched_on: (
        float  # of the games he does not start, how often he still plays (what another start chance is split with)
    )
    on: float = 0.0  # his score if he comes on: a score, not an expectation (P7)


def _split(week: PlayerWeek, base_mu: float, plays: float) -> Split:
    """His score if he starts and if he does not, and the chance of each, for one game.

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

    not_started = len(came_on) + sum(1 for _, _, ok in last if not ok)
    prior = PRIOR_ON.get(week.pos or "", PRIOR_ON_OUTFIELD)
    from_form = (len(came_on) + 2 * prior) / (not_started + 2.0)
    benched_on = from_form
    if have_odds:  # of the games he does not start, how many he still plays
        benched = 1.0 - p_start
        p_on_if_benched = p_on / benched if benched > 0 else 0.0
        benched_on = p_on_if_benched if benched > 0 else from_form  # with no bench in Sorare's odds, his form says
    else:
        p_on_if_benched = from_form
    score_on = (sum(came_on) + 2 * PRIOR_SUB_SCORE) / (len(came_on) + 2)
    return Split(start, p_on_if_benched * score_on, min(p_start, 1.0), min(p_on, 1.0), benched_on, score_on)


def _per_game(week: PlayerWeek, split: Split, plays: float) -> tuple[tuple[GameChance, ...], list[float]]:
    """Each game's chance of starting and of coming on, and of playing it, from the best source that has that game.

    A game Futbol Fantasy has is its number; the chance of coming on is what is left after it, at the rate Sorare's
    substitute odds give (his form's when Sorare has none), and nothing when he is out. Any other game keeps the
    numbers he had before Futbol Fantasy existed.
    """
    given = {start.game: start for start in week.game_starts}
    sorare = week.start_odds is not None and week.plays_odds is not None
    chances: list[GameChance] = []
    played: list[float] = []
    for game in week.game_ids:
        told = given.get(game)
        if told is None:
            chances.append(GameChance(game, split.p_start, split.p_on, "sorare" if sorare else "sofix"))
            played.append(plays)
        elif told.out:
            chances.append(GameChance(game, 0.0, 0.0, "futbolfantasy", told.info))
            played.append(0.0)
        else:
            p_start = min(1.0, max(0.0, told.p_start))
            p_on = (1.0 - p_start) * split.benched_on
            chances.append(GameChance(game, p_start, p_on, "futbolfantasy", told.info))
            played.append(min(1.0, p_start + p_on))
    return tuple(chances), played


def _own_start(week: PlayerWeek) -> float:
    """The app's own chance that he starts, from his form alone: Sorare's projection and odds and Futbol Fantasy taken away."""
    bare = dataclasses.replace(week, projection=None, plays_odds=None, start_odds=None, game_ids=[], game_starts=[])
    plays, mu = _from_form(bare.history)
    return _split(bare, mu, plays).p_start


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
    split = _split(week, mu, plays)
    start, bench, p_start, p_on = split.start, split.bench, split.p_start, split.p_on
    per_game: tuple[GameChance, ...] = ()
    has_odds = week.start_odds is not None and week.plays_odds is not None
    start_source = "sorare" if has_odds else "sofix"
    by_source = {"sofix": round(_own_start(week), 3)}
    if week.start_odds is not None:
        by_source["sorare"] = round(week.start_odds, 3)
    if week.game_starts and len(week.game_ids) == week.games:
        per_game, played = _per_game(week, split, plays)
        p_start, p_on = per_game[0].p_start, per_game[0].p_on
        start_source = per_game[0].source
        if start_source == "futbolfantasy":
            by_source["futbolfantasy"] = round(p_start, 3)
        p_any = 1.0
        for chance in played:
            p_any *= 1 - chance
        p_any = 1 - p_any
        best = sorted(played, reverse=True)[:2]
        both = best[0] * best[1] if len(best) > 1 else best[0]
    else:
        p_any = 1 - (1 - plays) ** week.games
        both = plays * plays
    # A double gameweek: he has to miss both to score nothing, and the better of the two games counts.
    if week.games > 1 and p_any > 0:
        mu += 0.56 * sd * both / p_any
    return Forecast(
        p_play=round(p_any, 4),
        mu=round(mu, 2),
        games=week.games,
        source=source,
        actual=week.actual,
        start=round(start, 1),
        bench=round(bench, 1),
        on=round(split.on, 1),
        p_start=round(p_start, 3),
        p_on=round(p_on, 3),
        per_game=per_game,
        start_source=start_source,
        by_source=by_source,
        benched_on=round(split.benched_on, 3),
    )


def forecasts(weeks: dict[str, PlayerWeek], sd: float = SCORE_SD) -> dict[str, Forecast]:
    return {player: forecast(week, sd) for player, week in weeks.items()}
