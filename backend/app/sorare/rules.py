"""Turn Sorare's own rule payloads into `Competition`s.

Nothing here is guessed: the slots (substitutes included), the minimum of in-season cards, the caps, the
bonuses and the reward table all come from the leaderboard's `rules`, `engineConfiguration`,
`displayedTypedRules` and `rewardsConfig`. Sorare's 2026/27 season has three shapes:

- in-season: 5 cards + 2 substitutes, at least 4 in-season cards, up to 4 lineups, cash and essence by rank;
- classic (All Star, Champion, U23): 7 cards + 2 substitutes, any season;
- rooms of 10: 5 cards, no substitutes, an entry fee in essence, the top 3 paid.
"""

from __future__ import annotations

from typing import Any

from app.sorare.model import CLASSIC, IN_SEASON, ROOM, SLOT_POSITIONS, Competition, Tier

# Sorare's league names are long; the app shows these.
LEAGUE_NAMES = {
    "LALIGA EA SPORTS": "LaLiga",
    "Under 23": "U23",
    "English League Players": "Premier League",
    "English 2nd Division Players": "Championship",
    "Jupiler Pro League": "Jupiler",
    "Liga Portugal": "Portugal",
    "European Nations": "Nations",
    "Italian League": "Serie A",
    "Turkish League": "Süper Lig",
    "SPFL": "Scotland",
}


def simple_name(league: str, track: str, group: str, fmt: str = "") -> str:
    name = LEAGUE_NAMES.get(league, league)
    if group == ROOM:
        return f"{name} · {track}"
    if fmt == "Hot Streak":
        return f"{name} Hot Streak"
    if track == "In-Season":
        return f"{name} Arena"
    return name


def reward_tiers(ranking: list[dict[str, Any]] | None) -> list[Tier]:
    """A competition's reward table. XP-only rows stay in the list but pay nothing."""
    tiers = []
    for row in ranking or []:
        cash, essence, card = 0.0, 0, False
        for reward in row.get("rewardConfigs") or []:
            kind = reward.get("__typename")
            if kind == "MonetaryRewardConfig":
                cash += (reward.get("amount", {}).get("usdCents") or 0) / 100
            elif kind == "CardShardRewardConfig" and reward.get("rarity") == "limited":
                essence += int(reward.get("quantity") or 0)
            elif kind == "CardRewardConfig":
                card = True
        tiers.append(Tier(int(row["fromRank"]), int(row["toRank"]), cash, essence, card))
    return sorted(tiers, key=lambda t: t.lo)


def competition(payload: dict[str, Any]) -> Competition:
    """Build one competition from a Sorare leaderboard payload (plus the league and track names)."""
    rules = payload.get("rules") or {}
    engine = payload.get("engineConfiguration") or {}
    fmt = (payload.get("format") or {}).get("title") or ""
    entry = (payload.get("format") or {}).get("entryItem") or {}
    fee = int(entry.get("quantity") or 0) if entry.get("__typename") == "So5CardShardsEntryItem" else 0
    rooms = payload.get("roomsConfig") or {}
    typed = {rule.get("key") for rule in payload.get("displayedTypedRules") or []}
    min_in_season = 4 if "SeasonBonus" in typed else 0
    group = ROOM if (rooms or fee) else (IN_SEASON if min_in_season else CLASSIC)
    league, track = payload["league"], payload["track"]

    slots = payload.get("appearances") or rules.get("appearances") or []
    starters = [SLOT_POSITIONS[s["name"]] for s in slots if not s.get("sub")]
    subs = [SLOT_POSITIONS[s["name"]] for s in slots if s.get("sub")]

    club = engine.get("sameActiveClub") or None
    average = engine.get("averageScores") or None
    age = rules.get("age") or {}
    leagues = {c["slug"] for c in rules.get("competitions") or []}

    return Competition(
        key=f"{league} | {track}",
        slug=payload["slug"],
        name=simple_name(league, track, group, fmt),
        group=group,
        rarity=payload.get("rarity") or payload.get("mainRarityType") or "limited",
        starters=starters,
        subs=subs,
        rarities=frozenset(rules.get("rarities") or ()),
        min_in_season=min_in_season,
        leagues=frozenset(leagues) if leagues else None,
        age_max=age.get("max"),
        age_on=age.get("cutOffDate"),
        cap=float(rules["sumOfAverageScores"]) if group == ROOM and rules.get("sumOfAverageScores") else None,
        season_bonus=float(engine.get("season") or 0.0),
        level_bonus=float(engine.get("grade") or 0.0),
        captain_bonus=float(engine.get("captain") or 0.0),
        scarcity_bonus={k: float(v) for k, v in (engine.get("scarcity") or {}).items()},
        club_bonus=(int(club["number_players_per_club"]["max"]), float(club["bonus"])) if club else None,
        average_bonus=(float(average["max"]), float(average["bonus"])) if average else None,
        teams_cap=int(payload.get("teamsCap") or 4),
        fee=fee,
        room_size=int(rooms.get("roomsSize") or 0) or (10 if group == ROOM else 0),
        tiers=reward_tiers((payload.get("rewardsConfig") or {}).get("ranking")),
        entries=int(payload.get("so5LineupsCount") or 0),
        lock_type=rules.get("lockType") or "",
    )
