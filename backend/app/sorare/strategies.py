"""The strategy lab (plans/lineups-and-xscore.md Phase 2): the same cards, built into lineups by different ideas of what makes a good one.

Each strategy builds the best lineup it can for every competition of the week from the owner's cards, written down before the lock
(`publish.strategy_plans`, one read model per week) and scored after the games (`strategy_audit.py`). There is no second planner:
every strategy is `planner.best_starters` with the players' numbers moved (`forecasts`) or one more rule (`rule`), and the captain is
the starter with the best number *of that strategy*. A lineup is then priced with Sofix's own numbers, so its expected score, range
and reward chances mean the same thing for all of them. No bench is filled: that is the same for every strategy.

The replay on two seasons of games (`app.jobs.lineup_backtest`) builds its lineups with this module too, so a change here is judged
there before it ships.
"""

from __future__ import annotations

from collections.abc import Callable, Mapping
from dataclasses import dataclass, replace
from typing import Any

from app.sorare import planner
from app.sorare.model import Card, Competition, Forecast
from app.sorare.planner import SCORE_SD, Lineup

Rule = Callable[[list[Card | None]], bool]
Games = Mapping[str, list[dict[str, Any]]]
Numbers = Callable[[Mapping[str, Forecast], Games], dict[str, Forecast]]

CEILING_Z = 1.28  # the top of a range that holds 8 in 10 of a player's scores, in standard deviations
SCORER_WEIGHT = 1.5  # "favour likely scorers": his chance of a decisive action counts one and a half times over
SUREST = 0.90  # "surest starters only": the chance he plays, at least


# ------------------------------------------------------------------------------------------------ numbers
def _moved(forecasts: Mapping[str, Forecast], by: Callable[[Forecast], float]) -> dict[str, Forecast]:
    return {p: replace(f, mu=min(100.0, max(0.0, f.mu + by(f)))) for p, f in forecasts.items()}


def _same(forecasts: Mapping[str, Forecast], games: Games) -> dict[str, Forecast]:
    return dict(forecasts)


def _ceiling(forecasts: Mapping[str, Forecast], games: Games) -> dict[str, Forecast]:
    """The top of his range instead of its middle."""

    def by(f: Forecast) -> float:
        if f.shape is not None:
            return float(f.shape.high - f.shape.start)
        return CEILING_Z * (SCORE_SD if f.sd is None else f.sd)

    return _moved(forecasts, by)


def _usual(forecasts: Mapping[str, Forecast], games: Games) -> dict[str, Forecast]:
    """The score he gets in a plain game, with no goal or assist: what he usually does, not what he sometimes does."""
    return _moved(forecasts, lambda f: float(f.shape.if_plain - f.shape.start) if f.shape is not None else 0.0)


def _scorers(forecasts: Mapping[str, Forecast], games: Games) -> dict[str, Forecast]:
    """His chance of a goal or an assist counted more than it is, so the likely scorers come first."""

    def by(f: Forecast) -> float:
        s = f.shape
        if s is None:
            return 0.0
        boosted = s.if_plain + (s.if_decisive - s.if_plain) * min(1.0, SCORER_WEIGHT * s.p_decisive)
        return float(boosted - s.start)

    return _moved(forecasts, by)


def _surest(forecasts: Mapping[str, Forecast], games: Games) -> dict[str, Forecast]:
    return {p: f if f.p_play >= SUREST else replace(f, p_play=0.0) for p, f in forecasts.items()}


def favourite(player_games: list[dict[str, Any]]) -> bool:
    """His side is the likeliest to win every game he has this week, by Sorare's odds. No odds yet is not a favourite."""
    odds = [g.get("odds") for g in player_games]
    return bool(odds) and all(o and o["win"] > o["loss"] and o["win"] > o["draw"] for o in odds)


def _favourites(forecasts: Mapping[str, Forecast], games: Games) -> dict[str, Forecast]:
    return {p: f if favourite(games.get(p) or []) else replace(f, p_play=0.0) for p, f in forecasts.items()}


# ------------------------------------------------------------------------------------------------ rules
def _slots(comp: Competition, position: str) -> list[int]:
    return [i for i, slot in enumerate(comp.starters) if position in slot]


def _keeper_with_defender(comp: Competition, forecasts: Mapping[str, Forecast]) -> Rule:
    """A defender of the keeper's own club: both blank together, or both big (the owner's own way, 13 Oct 2026)."""
    keeper, defence = _slots(comp, "GK")[0], _slots(comp, "DEF")

    def ok(chosen: list[Card | None]) -> bool:
        gk = chosen[keeper]
        if gk is None:
            return True
        mine = [chosen[i] for i in defence]
        return any(c is None for c in mine) or any(c.positions[0] == "DEF" and c.club == gk.club for c in mine if c)

    return ok


def _facing(a: Card, b: Card, forecasts: Mapping[str, Forecast]) -> bool:
    return any(g == h and v != w for g, v in forecasts[a.player].links for h, w in forecasts[b.player].links)


def _no_attacker_facing_own_keeper(comp: Competition, forecasts: Mapping[str, Forecast]) -> Rule:
    """No midfielder or forward plays against the keeper: one of them scoring is the other conceding."""
    keeper = _slots(comp, "GK")[0]

    def ok(chosen: list[Card | None]) -> bool:
        gk = chosen[keeper]
        return gk is None or not any(
            c and c.positions[0] in ("MID", "FWD") and _facing(gk, c, forecasts) for c in chosen
        )

    return ok


def _club_stack(comp: Competition, forecasts: Mapping[str, Forecast]) -> Rule:
    """Three players of one club: they win or lose together."""

    def ok(chosen: list[Card | None]) -> bool:
        counts: dict[str | None, int] = {}
        for c in chosen:
            if c:
                counts[c.club] = counts.get(c.club, 0) + 1
        return max(counts.values(), default=0) + sum(1 for c in chosen if c is None) >= 3

    return ok


# ------------------------------------------------------------------------------------------------ the strategies
@dataclass(frozen=True)
class Strategy:
    key: str
    label: str
    note: str  # one plain line for the Audit
    numbers: Numbers = _same
    rule: Callable[[Competition, Mapping[str, Forecast]], Rule] | None = None
    source: str = "sofix"  # "sorare": the players' numbers are Sorare's own projections


STRATEGIES = (
    Strategy("xscore", "xScore", "The best xScore in every slot, captain the best xScore (what Sofix plans on)."),
    Strategy(
        "sorare",
        "Sorare's projection",
        "Sorare's own projection for every player instead of the xScore.",
        source="sorare",
    ),
    Strategy(
        "keeper-defender",
        "Keeper with his defender",
        "A defender of the keeper's own club: nothing, or win big.",
        rule=_keeper_with_defender,
    ),
    Strategy("club-stack", "Three from one club", "Three players of one club in the lineup.", rule=_club_stack),
    Strategy(
        "no-clash",
        "No attacker against the keeper",
        "No midfielder or forward plays against his own keeper.",
        rule=_no_attacker_facing_own_keeper,
    ),
    Strategy(
        "scorers",
        "Likely scorers",
        "Players with the best chance of a goal or an assist count for more.",
        numbers=_scorers,
    ),
    Strategy("ceiling", "Highest ceiling", "Each player at the top of his range, not the middle.", numbers=_ceiling),
    Strategy("usual", "Usual score", "Each player at what he usually scores, with no goal or assist.", numbers=_usual),
    Strategy("surest", "Surest starters", "Only players 90% or more likely to play.", numbers=_surest),
    Strategy("favourites", "Favourites only", "Only players whose side is the likeliest to win.", numbers=_favourites),
)
BY_KEY = {s.key: s for s in STRATEGIES}


def pick(
    strategy: Strategy,
    comp: Competition,
    cards: list[Card],
    forecasts: Mapping[str, Forecast],
    games: Games,
) -> Lineup | None:
    """The strategy's best lineup for one competition (starters and captain), or None when the cards cannot make one under its rule."""
    seen = strategy.numbers(forecasts, games)
    rule = strategy.rule(comp, seen) if strategy.rule else None
    found = planner.best_starters(comp, cards, seen, keep=1, rule=rule)
    if not found:
        return None
    starters = found[0]
    value = [seen[c.player].p_play * seen[c.player].mu for c in starters]
    return Lineup(
        comp=comp,
        starters=starters,
        subs=[None] * len(comp.subs),
        captain=max(range(len(starters)), key=value.__getitem__),
    )


def week(
    comps: list[Competition],
    cards: list[Card],
    forecasts: Mapping[str, Forecast],
    games: Games,
    sorare: Mapping[str, Forecast] | None = None,
) -> list[tuple[Strategy, list[Lineup]]]:
    """Every strategy's lineups for the week, each priced with Sofix's own numbers. `sorare` is the same players with Sorare's
    projections; without it that strategy is left out."""
    out: list[tuple[Strategy, list[Lineup]]] = []
    for strategy in STRATEGIES:
        if strategy.source == "sorare" and sorare is None:
            continue
        numbers = sorare if strategy.source == "sorare" and sorare is not None else forecasts
        lineups = []
        for comp in comps:
            lineup = pick(strategy, comp, cards, numbers, games)
            if lineup:
                lineups.append(planner.evaluate(lineup, dict(forecasts)))
        out.append((strategy, lineups))
    return out
