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
from collections.abc import Callable, Mapping
from datetime import datetime, timedelta
from typing import Any

from app.sorare.client import SorareClient, SorareError
from app.sorare.model import CLASSIC, IN_SEASON, SLOT_POSITIONS, Card, Competition, Tier
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
