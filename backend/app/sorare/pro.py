"""Pro (Sorare's Hot Streaks): your boards, turned into competitions the planner weighs against the Arena.

A board is a ladder of steps, each a fixed score to reach and a prize (plans/pro.md). Sorare's public API shows any manager's
boards, steps, targets, states and prizes, so the job reads them like the rest of the gameweek, no extension needed.

A step becomes one competition: the rules of the league's in-season Arena (slots, at least four in-season cards, the season,
level and captain bonuses) without what Pro leaves out (substitutes, Multi-Club, the Cap, scarcity), one lineup, and a single
reward level whose bar is the step's target. Limits, said where they are shown: the step is valued alone (clearing it also opens
the next, which is not counted), one try a week (Sorare allows four a step), and only boards of a league with an Arena this week.
"""

from __future__ import annotations

import logging
from dataclasses import replace
from typing import Any

from app.sorare.client import SorareClient, SorareError
from app.sorare.model import IN_SEASON, Competition, Tier
from app.sorare.rules import LEAGUE_NAMES

logger = logging.getLogger(__name__)

BOARDS = """query SofixProBoards($u: String!) { user(slug: $u) { boards(mode: CAREER, sport: FOOTBALL) {
  title ... on CareerBoard { configSlug rarities so5Competition { slug } }
  steps { level target state ... on CareerProStep {
    rewardConfigs { __typename ... on MonetaryRewardConfig { amount { usdCents } } ... on CardShardRewardConfig { quantity rarity } }
    rewardMultiplierConfiguration { cardBoosts {
      rarity inSeasonBasisPoints captainInSeasonBasisPoints allSeasonsBasisPoints captainAllSeasonsBasisPoints } } } } } } }"""

DONE = frozenset({"CLAIMED", "CLAIMABLE"})  # a step already won; the next one is where the board stands


def boards(client: SorareClient, user: str) -> list[dict[str, Any]]:
    """Your Pro boards as Sorare sends them. Nothing when they cannot be read: the week is planned without Pro."""
    try:
        return (client.query(BOARDS, {"u": user}).get("user") or {}).get("boards") or []
    except SorareError as exc:
        logger.warning("sorare: Pro boards not read (%s)", exc)
        return []


def _prize(step: dict[str, Any]) -> tuple[float, int]:
    """A step's cash and Limited essence (essence counts Limited only, as everywhere in the plans)."""
    cash, essence = 0.0, 0
    for reward in step.get("rewardConfigs") or []:
        if reward.get("__typename") == "MonetaryRewardConfig":
            cash += ((reward.get("amount") or {}).get("usdCents") or 0) / 100
        elif reward.get("__typename") == "CardShardRewardConfig" and reward.get("rarity") == "limited":
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


def _arena(comps: list[Competition], league: str) -> Competition | None:
    """The league's Limited in-season Arena (`league` as Sorare names it: "LALIGA EA SPORTS")."""
    return next(
        (
            c
            for c in comps
            if c.group == IN_SEASON and c.rarity == "limited" and not c.pro_steps and c.key.split(" | ")[0] == league
        ),
        None,
    )


def competitions(raw: list[dict[str, Any]] | None, comps: list[Competition]) -> list[Competition]:
    """A competition for the step each board stands on, for a league whose Limited in-season Arena is among `comps`."""
    out = []
    for board in raw or []:
        title = board.get("title") or ""
        ahead = sorted(
            (s for s in board.get("steps") or [] if s.get("state") not in DONE and "rewardConfigs" in s),
            key=lambda s: int(s["level"]),
        )
        arena = _arena(comps, title)
        if not ahead or arena is None or not (board.get("so5Competition") or {}).get("slug"):
            continue
        ladder = tuple((int(s["level"]), int(s["target"]), *_prize(s)) for s in ahead)
        level, target, cash, essence = ladder[0]
        out.append(
            replace(
                arena,
                key=f"{title} | Pro",
                slug=board.get("configSlug") or "",
                board_id="",  # entered on Sorare's Pro board, never by Apply
                name=f"{LEAGUE_NAMES.get(title, title)} Pro",
                rarities=frozenset(board.get("rarities") or ("limited",)),
                subs=[],
                scarcity_bonus={},
                club_bonus=None,
                average_bonus=None,
                teams_cap=1,
                entries=0,
                fee=0,
                tiers=[Tier(1, 1, cash, essence)],
                reference={1: float(target)},
                reference_rooms=[],
                reference_from=f"Step {level}",
                pro_steps=ladder,
                reward_boosts=_boosts(ahead[0]),
            )
        )
    return out


def twins(comps: list[Competition]) -> dict[str, Competition]:
    """Each Pro competition and its league's Arena, both ways: a lineup of one is priced in the other."""
    out: dict[str, Competition] = {}
    for comp in comps:
        if comp.pro_steps:
            arena = _arena(comps, comp.key.split(" | ")[0])
            if arena is not None:
                out[comp.key], out[arena.key] = arena, comp
    return out
