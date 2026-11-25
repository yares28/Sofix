"""Pro (Sorare's Hot Streaks): your boards, turned into competitions the planner weighs against everything else.

A board is a ladder of steps, each a fixed score to reach and a prize (plans/pro.md). Sorare's public API shows any manager's
boards, steps, targets, states, prizes and each step's rules, so the job reads them like the rest of the gameweek, no extension.

Every board becomes the competition its current step is: the step's own rules (the competitions its players come from, the
rarities, the slots, four in-season cards when it has the season bonus) and bonuses, no substitutes, one lineup, and a single
reward level whose bar is the step's target. Pro is entered any time before the lineup's first kickoff, so a Pro lineup is built
from games that all start within `WINDOW`: by its first kickoff every teamsheet is out, and a player who does not start is never
entered (the owner, 20 Oct 2026: no DNP risk for a slightly higher score). A board with a rule Sofix cannot check is left out.
Limits, said where they are shown: only the current step is valued, and one try a week.
"""

from __future__ import annotations

import logging
import zlib
from collections.abc import Callable, Mapping
from dataclasses import dataclass, replace
from datetime import datetime, timedelta
from typing import Any
from zoneinfo import ZoneInfo

import numpy as np

from app.sorare.client import SorareClient, SorareError
from app.sorare.model import CLASSIC, IN_SEASON, SLOT_POSITIONS, Card, Competition, Forecast, Tier
from app.sorare.planner import Lineup, best_starters, simulate
from app.sorare.rules import LEAGUE_NAMES

logger = logging.getLogger(__name__)

BOARDS = """query SofixProBoards($u: String!) { user(slug: $u) { boards(mode: CAREER, sport: FOOTBALL) {
  title ... on CareerBoard { configSlug }
  steps { level target state ... on CareerProStep {
    engineConfiguration { season captain grade }
    displayedTypedRules { key
      ... on So5ScarcityRule { rarities }
      ... on So5CompetitionsRule { competitions { slug } }
      ... on So5AppearancesRule { appearances(includeSubs: true) { name sub } } }
    rewardConfigs { __typename ... on MonetaryRewardConfig { amount { usdCents } } ... on CardShardRewardConfig { quantity rarity } }
    rewardMultiplierConfiguration { cardBoosts {
      rarity inSeasonBasisPoints captainInSeasonBasisPoints allSeasonsBasisPoints captainAllSeasonsBasisPoints } } } } } } }"""

DONE = frozenset({"CLAIMED", "CLAIMABLE"})  # a step already won; the next one is where the board stands
KNOWN = frozenset({"Scarcity", "CaptainScarcity", "SeasonBonus", "Competitions", "Appearances"})  # rules Sofix checks
WINDOW = timedelta(minutes=60)
"""Sorare shows the teams about an hour before kickoff: games that all start within this have every teamsheet out by the first."""


def boards(client: SorareClient, user: str) -> list[dict[str, Any]]:
    """Your Pro boards as Sorare sends them. Nothing when they cannot be read: the week is planned without Pro."""
    try:
        return (client.query(BOARDS, {"u": user}).get("user") or {}).get("boards") or []
    except SorareError as exc:
        logger.warning("sorare: Pro boards not read (%s)", exc)
        return []


def _prize(step: dict[str, Any], rarity: str) -> tuple[float, int]:
    """A step's cash and essence of the board's own rarity (as every competition's reward table is read, `rules.reward_tiers`)."""
    cash, essence = 0.0, 0
    for reward in step.get("rewardConfigs") or []:
        if reward.get("__typename") == "MonetaryRewardConfig":
            cash += ((reward.get("amount") or {}).get("usdCents") or 0) / 100
        elif reward.get("__typename") == "CardShardRewardConfig" and reward.get("rarity") == rarity:
            essence += int(reward.get("quantity") or 0)
    return cash, essence


def _boosts(step: dict[str, Any]) -> dict[str, tuple[float, float, float, float]]:
    rows = (step.get("rewardMultiplierConfiguration") or {}).get("cardBoosts") or []
    keys = (
        "inSeasonBasisPoints",
        "captainInSeasonBasisPoints",
        "allSeasonsBasisPoints",
        "captainAllSeasonsBasisPoints",
    )
    # Sorare gives the captain's whole share; the planner adds the captain's part to his card's
    return {
        row["rarity"]: tuple(int(row.get(k) or 0) / 10_000 for k in keys)  # type: ignore[misc]
        for row in rows
        if row.get("rarity")
    }


def competitions(raw: list[dict[str, Any]] | None) -> list[Competition]:
    """A competition for the step each board stands on, from that step's own rules."""
    out = []
    for board in raw or []:
        ahead = sorted(
            (s for s in board.get("steps") or [] if s.get("state") not in DONE and "rewardConfigs" in s),
            key=lambda s: int(s["level"]),
        )
        if not ahead:
            continue
        step, title = ahead[0], board.get("title") or "Pro"
        rules = {r.get("key"): r for r in step.get("displayedTypedRules") or []}
        if set(rules) - KNOWN or not {"Competitions", "Appearances", "Scarcity"} <= set(rules):
            logger.info("sorare: Pro board %s left out (rules %s)", board.get("configSlug"), sorted(set(rules) - KNOWN))
            continue
        rarities = frozenset(rules["Scarcity"].get("rarities") or ())
        rarity = "limited" if "limited" in rarities else "rare"
        slots = rules["Appearances"].get("appearances") or []
        engine = step.get("engineConfiguration") or {}
        in_season = "SeasonBonus" in rules
        tag = "" if rarity == "limited" else " Rare"
        ladder = tuple((int(s["level"]), int(s["target"]), *_prize(s, rarity)) for s in ahead)
        level, target, cash, essence = ladder[0]
        out.append(
            Competition(
                key=f"{title} | Pro{tag}",
                slug=board.get("configSlug") or "",
                name=f"{LEAGUE_NAMES.get(title, title)} Pro{tag}",
                group=IN_SEASON if in_season else CLASSIC,
                rarity=rarity,
                starters=[SLOT_POSITIONS[s["name"]] for s in slots if not s.get("sub")],
                subs=[],
                rarities=rarities,
                min_in_season=4 if in_season else 0,
                leagues=frozenset(c["slug"] for c in rules["Competitions"].get("competitions") or []),
                season_bonus=float(engine.get("season") or 0.0),
                level_bonus=float(engine.get("grade") or 0.0),
                captain_bonus=float(engine.get("captain") or 0.0),
                teams_cap=1,
                tiers=[Tier(1, 1, cash, essence)],
                reference={1: float(target)},
                reference_from=f"Step {level}",
                pro_steps=ladder,
                reward_boosts=_boosts(step),
            )
        )
    return out


def twins(comps: list[Competition]) -> dict[str, Competition]:
    """Each Pro competition and the Limited in-season Arena of the same competitions, both ways: a lineup of one is priced in the
    other."""
    out: dict[str, Competition] = {}
    for comp in comps:
        if not comp.pro_steps:
            continue
        arena = next(
            (
                c
                for c in comps
                if c.group == IN_SEASON and c.rarity == "limited" and not c.pro_steps and c.leagues == comp.leagues
            ),
            None,
        )
        if arena is not None:
            out[comp.key], out[arena.key] = arena, comp
    return out


def kickoff(card: Card, comp: Competition, games: Mapping[str, list[dict[str, Any]]]) -> datetime | None:
    """When the card's game for this board starts: his first game of the week in one of its competitions."""
    for game in games.get(card.player) or []:
        if game.get("kickoff") and (comp.leagues is None or game.get("competition") in comp.leagues):
            return datetime.fromisoformat(game["kickoff"])
    return None


Rule = Callable[[list[Card | None]], bool]


def rules_for(
    games: Mapping[str, list[dict[str, Any]]], other: Callable[[Competition], Rule | None] | None = None
) -> Callable[[Competition], Rule | None]:
    """The planner's per-competition rule: a Pro lineup's games all start within `WINDOW`, on top of `other` (a strategy's)."""

    def for_comp(comp: Competition) -> Rule | None:
        theirs = other(comp) if other else None
        if not comp.pro_steps:
            return theirs

        def rule(picked: list[Card | None]) -> bool:
            times = [kickoff(c, comp, games) for c in picked if c is not None]
            if None in times:
                return False
            known = [t for t in times if t is not None]
            return (not known or max(known) - min(known) <= WINDOW) and (theirs is None or theirs(picked))

        return rule

    return for_comp


TEAMSHEETS = 200
"""Teamsheets drawn for each group of games: who of yours starts, each with his chance."""
STEP_DRAWS = 1000
WINDOWS_SHOWN = 4


@dataclass
class Window:
    """One group of this board's games that all start within `WINDOW`, and what waiting for its teamsheets can win."""

    start: datetime
    end: datetime
    lineup: Lineup  # the best five there if they all start
    expected: float  # their expected score if they do
    all_start: float  # the chance they do
    if_start: list[float]  # each step's chance if they all start
    wait: list[float]  # each step's chance entering the best five who do start, once the teamsheets are out


def starts(forecast: Forecast) -> float:
    """His chance of starting, what a Pro lineup is entered on; his chance of playing where no source gives one."""
    return forecast.p_play if forecast.p_start is None else forecast.p_start


def starting(forecast: Forecast) -> Forecast:
    """His forecast once the teamsheet says he starts: he plays, and scores what he does when he starts."""
    return replace(forecast, p_play=1.0, mu=forecast.mu if forecast.start is None else forecast.start)


def _five(comp: Competition, pool: list[Card], started: Mapping[str, Forecast]) -> Lineup | None:
    found = best_starters(comp, pool, started, keep=1)
    if not found:
        return None
    starters = found[0]
    # ponytail: the captain is the best score if he plays, not the planner's simulated pick; that one costs 5 x 3,000 draws a try
    captain = max(range(len(starters)), key=lambda i: started[starters[i].player].mu * comp.multiplier(starters[i]))
    return Lineup(comp=comp, starters=starters, subs=[], captain=captain)


def _reach(lineup: Lineup, started: dict[str, Forecast], rng: np.random.Generator) -> tuple[np.ndarray, float]:
    scores = simulate(lineup, started, rng, STEP_DRAWS)
    return np.array([float((scores >= target).mean()) for _, target, _, _ in lineup.comp.pro_steps]), float(
        scores.mean()
    )


def windows(
    comp: Competition, cards: list[Card], forecasts: Mapping[str, Forecast], games: Mapping[str, list[dict[str, Any]]]
) -> list[Window]:
    """The board's steps played on each group of its games that start within `WINDOW`, the best first (the owner, 29 Oct 2026: "if
    I know who starts and input them in Pro, can I get the next step?"). A group inside a bigger one is left out: the bigger one has
    every card it has."""
    timed = [
        (t, c)
        for c in cards
        if comp.allows(c) and (f := forecasts.get(c.player)) and starts(f) > 0 and (t := kickoff(c, comp, games))
    ]
    groups: list[list[Card]] = []
    for start in sorted({t for t, _ in timed}):
        pool = [c for t, c in timed if start <= t <= start + WINDOW]
        if not any({c.slug for c in pool} <= {c.slug for c in g} for g in groups):
            groups.append(pool)
    out = []
    for pool in groups:
        started = {c.player: starting(forecasts[c.player]) for c in pool}
        best = _five(comp, pool, started)
        if best is None:
            continue
        rng = np.random.default_rng(zlib.crc32("|".join([comp.key, *sorted(c.slug for c in pool)]).encode()))
        players = sorted(started)
        chance = np.array([starts(forecasts[p]) for p in players])
        seen: dict[bytes, np.ndarray] = {}
        wait = np.zeros(len(comp.pro_steps))
        for sheet in rng.random((TEAMSHEETS, len(players))) < chance:
            key = sheet.tobytes()
            if key not in seen:
                on = {p for p, s in zip(players, sheet, strict=True) if s}
                five = _five(comp, [c for c in pool if c.player in on], started)
                seen[key] = np.zeros(len(comp.pro_steps)) if five is None else _reach(five, started, rng)[0]
            wait += seen[key]
        times = [t for t, c in timed if c in best.starters]
        if_start, expected = _reach(best, started, rng)
        out.append(
            Window(
                start=min(times),
                end=max(times),
                lineup=best,
                expected=expected,
                all_start=float(np.prod([starts(forecasts[c.player]) for c in best.starters])),
                if_start=[round(float(p), 4) for p in if_start],
                wait=[round(float(p), 4) for p in wait / TEAMSHEETS],
            )
        )
    out.sort(key=lambda w: (-w.wait[0], w.start))
    return out[:WINDOWS_SHOWN]


# ---------------------------------------------------------------------------------------------------------------------------------
# The Pro page's week plan (plans/pro-page.md). A lineup is entered once its first batch's teams are out and locks at that batch's
# first kickoff, so players from later games go in on their chance (no subs in Pro: one who does not play scores 0). Research on
# GW35 (25 Nov 2026): a legal five rarely survives its own teamsheet, and borrowing from later games turned dead batches into the
# week's best shots; a wider span is kept only when it beats the narrower one by SPAN_TIE (Arcade's LEG_TIE).

SPAN_TIE = 0.02
PLAN_SHEETS = 60
"""Teamsheets drawn for each candidate lineup: enough to tell spans 2 points apart on the owner's week, cheap enough for the refresh."""
PLAN_DRAWS = 600
PLAN_LIVES = 4
"""A step has four lives: the plan holds at most this many lineups."""
MIN_CHANCE = 0.01
MADRID = ZoneInfo("Europe/Madrid")


@dataclass
class Planned:
    """One lineup of the week plan: its first batch, how far it reaches into later games, and its chance at every step."""

    start: datetime
    span: str  # "batch", "3h", "day", "26h", or "any" (best five, kickoff ignored)
    lineup: Lineup
    late: dict[str, datetime]  # the players entered before their own teamsheet, with their kickoff
    reach: list[float]  # the chance of each step's target, teamsheets drawn
    expected: float


def batches_of(times: list[datetime]) -> list[tuple[datetime, datetime]]:
    """Kickoffs grouped as Sorare's slots fall: a game within WINDOW of a batch's first one joins it."""
    out: list[tuple[datetime, datetime]] = []
    for t in sorted(set(times)):
        if out and t - out[-1][0] <= WINDOW:
            out[-1] = (out[-1][0], t)
        else:
            out.append((t, t))
    return out


def _spans(first: datetime, last: datetime, any_time: bool, end: datetime) -> list[tuple[str, datetime]]:
    if any_time:
        return [("any", end)]
    day_end = first.astimezone(MADRID).replace(hour=23, minute=59, second=59).astimezone(first.tzinfo)
    return [("batch", last), ("3h", first + timedelta(hours=3)), ("day", day_end), ("26h", first + timedelta(hours=26))]


def _plan_chance(
    comp: Competition, early: list[Card], late: list[Card], forecasts: Mapping[str, Forecast], key: str
) -> tuple[np.ndarray, Lineup | None, float]:
    """The chance of every step averaged over drawn teamsheets of the first batch (only its starters are picked), and the lineup
    shown: the best five from its likely starters (or all of them) with the later players."""
    view = {**{c.player: forecasts[c.player] for c in late}, **{c.player: starting(forecasts[c.player]) for c in early}}
    rng = np.random.default_rng(zlib.crc32(key.encode()))
    chance = np.array([starts(forecasts[c.player]) for c in early])
    cache: dict[frozenset[str], np.ndarray] = {}
    total = np.zeros(len(comp.pro_steps))
    for sheet in rng.random((PLAN_SHEETS, len(early))) < chance:
        on = frozenset(c.player for c, s in zip(early, sheet, strict=True) if s)
        if on not in cache:
            lineup = _five(comp, [c for c in early if c.player in on] + late, view)
            cache[on] = np.zeros(len(comp.pro_steps)) if lineup is None else _plan_reach(lineup, view, rng)[0]
        total += cache[on]
    likely = [c for c in early if starts(forecasts[c.player]) >= 0.5]
    shown = _five(comp, likely + late, view) or _five(comp, early + late, view)
    expected = _plan_reach(shown, view, rng)[1] if shown else 0.0
    return total / PLAN_SHEETS, shown, expected


def _plan_reach(
    lineup: Lineup, forecasts: Mapping[str, Forecast], rng: np.random.Generator
) -> tuple[np.ndarray, float]:
    scores = simulate(lineup, dict(forecasts), rng, PLAN_DRAWS)
    return np.array([float((scores >= target).mean()) for _, target, _, _ in lineup.comp.pro_steps]), float(
        scores.mean()
    )


def week_plan(
    comp: Competition,
    cards: list[Card],
    forecasts: Mapping[str, Forecast],
    games: Mapping[str, list[dict[str, Any]]],
    *,
    any_time: bool = False,
) -> list[Planned]:
    """The board's lineups for the week, every card used once, best chance first, shown in kick-off order.

    By batch (the default) a lineup starts on a batch's own games and reaches into later ones (3 hours, the rest of the Madrid day,
    26 hours) only when that is SPAN_TIE better; `any_time` takes any games of the week (the page's "Best five")."""
    timed = {
        c.slug: (t, c)
        for c in cards
        if comp.allows(c) and (f := forecasts.get(c.player)) and starts(f) > 0 and (t := kickoff(c, comp, games))
    }
    if not timed:
        return []
    groups = batches_of([t for t, _ in timed.values()])
    end = max(t for t, _ in timed.values())
    used: set[str] = set()
    out: list[Planned] = []
    while len(out) < PLAN_LIVES:
        best: Planned | None = None
        for first, last in groups:
            early = [c for t, c in timed.values() if first <= t <= last and c.player not in used]
            if not early:
                continue
            options: list[Planned] = []
            seen_late: set[frozenset[str]] = set()
            for name, until in _spans(first, last, any_time, end):
                late = [c for t, c in timed.values() if last < t <= until and c.player not in used]
                if any_time:
                    late = [c for t, c in timed.values() if (t < first or t > last) and c.player not in used]
                signature = frozenset(c.slug for c in late)
                if name != "batch" and signature in seen_late:
                    continue  # the same players as a narrower span: nothing new
                seen_late.add(signature)
                key = "|".join([comp.key, name, *sorted(c.slug for c in early), *sorted(signature)])
                reach, shown, expected = _plan_chance(comp, early, late, forecasts, key)
                if shown is None:
                    continue
                late_in = {c.player: timed[c.slug][0] for c in shown.starters if c in late}
                options.append(Planned(first, name, shown, late_in, [round(float(p), 4) for p in reach], expected))
            if not options:
                continue
            top = max(o.reach[0] for o in options)
            pick = next(o for o in options if o.reach[0] >= top - SPAN_TIE)  # the narrowest span within the tie
            if best is None or pick.reach[0] > best.reach[0]:
                best = pick
        if best is None or best.reach[0] < MIN_CHANCE:
            break
        out.append(best)
        used |= {c.player for c in best.lineup.starters}
    return sorted(out, key=lambda p: p.start)
