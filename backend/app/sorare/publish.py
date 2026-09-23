"""Turn a Sorare snapshot into the finished page data the app reads.

The app does no work of its own: this builds the gameweek timeline, the competitions you can and cannot play
(with the reason), the five whole-gameweek plans and, for the gameweek just played, the same plans replayed
against what really happened.
"""

from __future__ import annotations

import logging
from datetime import UTC, date, datetime
from typing import Any

import numpy as np

from app.sorare import rules
from app.sorare.forecast import PlayerWeek
from app.sorare.forecast import forecasts as build_forecasts
from app.sorare.model import SORARE_POSITION, Card, Competition, Forecast
from app.sorare.planner import DRAWS, Lineup, Plan, build, fill_bench, plans, replay_rewards, score_at_rank

logger = logging.getLogger(__name__)

POSITION_WORDS = {"GK": "goalkeeper", "DEF": "defender", "MID": "midfielder", "FWD": "forward"}
PAYLOAD_VERSION = 2
"""The shape of the published page. A run only keeps a finished gameweek's replay from the payload the app is
already showing when that payload was built by this same version."""
LIVE_STATES = {"started", "live"}


def _dt(value: str) -> datetime:
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


# --------------------------------------------------------------------------- cards
def read_cards(rows: list[dict[str, Any]]) -> tuple[list[Card], list[dict[str, str]]]:
    """Your cards, minus the ones Sorare will not let you play: sealed, for sale, or inside an offer."""
    usable: list[Card] = []
    left_out: list[dict[str, str]] = []
    for row in rows:
        player = row["player"]
        reason = (
            "sealed"
            if row.get("sealed")
            else "for sale"
            if row.get("liveSingleSaleOffer")
            else "in an offer"
            if row.get("sentInLiveOffers")
            else None
        )
        if reason:
            left_out.append({"name": player["displayName"], "why": reason, "rarity": row["rarityTyped"]})
            continue
        club = player.get("activeClub") or {}
        usable.append(
            Card(
                slug=row["slug"],
                player=player["slug"],
                name=player["displayName"],
                positions=tuple(SORARE_POSITION[p] for p in (row.get("anyPositions") or [player["position"]])),
                rarity=row["rarityTyped"],
                in_season=bool(row["inSeasonEligible"]),
                level=int(row.get("grade") or 0),
                average=float(player.get("average") or 0.0),
                birth_day=player.get("birthDay"),
                league=(club.get("domesticLeague") or {}).get("slug"),
                club=club.get("slug"),
                club_name=club.get("shortName") or club.get("name"),
                club_crest=club.get("pictureUrl"),
                picture=row.get("pictureUrl") or "",
                avatar=player.get("avatarPictureUrl") or "",
            )
        )
    return usable, left_out


def card_games(rows: list[dict[str, Any]], key: str) -> dict[str, list[dict[str, Any]]]:
    """Each player's games inside one gameweek, with the opponent as the app shows it."""
    out: dict[str, list[dict[str, Any]]] = {}
    for row in rows:
        player = row["player"]
        games = player.get(key) or []
        if not games or player["slug"] in out:
            continue
        club = (player.get("activeClub") or {}).get("slug")
        nation = (player.get("activeNationalTeam") or {}).get("slug")
        mine = {club, nation}
        listed = []
        for game in games:
            home, away = game["homeTeam"], game["awayTeam"]
            at_home = home["slug"] in mine
            other = away if at_home else home
            listed.append(
                {
                    "id": game["id"],
                    "kickoff": game["date"],
                    "competition": game["competition"]["slug"],
                    "opponent": other.get("shortName") or other["name"],
                    "opponentCrest": other.get("pictureUrl"),
                    "venue": "H" if at_home else "A",
                }
            )
        out[player["slug"]] = listed
    return out


def player_weeks(
    rows: list[dict[str, Any]],
    games: dict[str, list[dict[str, Any]]],
    history: dict[str, list[dict[str, Any]]],
    lock: datetime,
    window: tuple[datetime, datetime] | None,
    use_sorare: bool,
) -> dict[str, PlayerWeek]:
    """What is known about each player before the lock (and, for a played gameweek, what he scored)."""
    weeks: dict[str, PlayerWeek] = {}
    for row in rows:
        player = row["player"]
        slug = player["slug"]
        if slug in weeks:
            continue
        mine = games.get(slug) or []
        past = [h for h in history.get(slug, []) if _dt(h["date"]) < lock]
        past.sort(key=lambda h: h["date"], reverse=True)
        odds = player.get("nextClassicFixturePlayingStatusOdds") or {}
        plays = None
        if use_sorare and odds:
            plays = (odds.get("starterOddsBasisPoints", 0) + odds.get("substituteOddsBasisPoints", 0)) / 10000
        actual = None
        if window:
            played = [
                h["score"]
                for h in history.get(slug, [])
                if window[0] <= _dt(h["date"]) < window[1] and h["played"] and h["score"] is not None
            ]
            actual = max(played) if played else None
        weeks[slug] = PlayerWeek(
            games=len(mine),
            projection=player.get("nextClassicFixtureProjectedScore") if use_sorare else None,
            plays_odds=plays,
            history=[(h["date"], h["score"] or 0.0, h["played"]) for h in past],
            actual=actual,
        )
    return weeks


# --------------------------------------------------------------------------- competitions
def read_competitions(raw: list[dict[str, Any]], references: dict[str, Any]) -> list[Competition]:
    comps = []
    for payload in raw:
        if payload.get("skipped") or not payload.get("appearances"):
            continue
        comp = rules.competition(payload)
        reference = references.get(comp.key) or {}
        comp.reference = {int(k): float(v) for k, v in (reference.get("cuts") or {}).items()}
        comp.reference_rooms = [float(v) for v in (reference.get("rooms") or [])]
        comp.reference_from = f"GW{reference['gameweek']}" if reference.get("gameweek") else ""
        comps.append(comp)
    return comps


def why_not(comp: Competition, cards: list[Card], forecasts: dict[str, Forecast]) -> str:
    """Why a competition can't be entered, in the words the app shows."""
    playable = [c for c in cards if comp.allows(c) and (forecasts.get(c.player) or Forecast(0, 0)).p_play > 0]
    league = rules.LEAGUE_NAMES.get(comp.key.split(" | ")[0], comp.key.split(" | ")[0])
    rare = "Rare " if comp.rarity == "rare" else ""
    if comp.rarity == "rare" and not any(c.rarity == "rare" for c in cards):
        return "No Rare cards"
    if not playable:
        if comp.leagues:
            return f"No {rare}{league} cards" if len(comp.leagues) == 1 else f"No {rare}cards from its leagues"
        if comp.age_max:
            return f"No players aged {comp.age_max} or under"
        return "None of your cards play"
    need: dict[str, int] = {}
    for slot in comp.starters:
        if len(slot) == 1:
            need[slot[0]] = need.get(slot[0], 0) + 1
    have: dict[str, int] = {}
    for card in playable:
        have[card.positions[0]] = have.get(card.positions[0], 0) + 1
    for position, count in need.items():
        if have.get(position, 0) < count:
            word = POSITION_WORDS[position]
            who = f"a {rare}{word}" if count == 1 else f"{count} {rare}{word}s"
            if comp.age_max:
                who += f" aged {comp.age_max} or under"
            elif comp.leagues and len(comp.leagues) == 1:
                who += f" from {league}"
            elif comp.leagues:
                who += " from its leagues"
            return f"Needs {who}"
    people = len({c.player for c in playable})
    if people < comp.size:
        return f"Needs {comp.size} players · you have {people}"
    if comp.min_in_season:
        in_season = len({c.player for c in playable if c.in_season})
        if in_season < comp.min_in_season:
            return f"Needs {comp.min_in_season} in-season cards · you have {in_season}"
    if comp.cap:
        return f"No {comp.size} under the {int(comp.cap)} cap"
    return "No lineup fits its rules"


def lineups_possible(comp: Competition, cards: list[Card], forecasts: dict[str, Forecast]) -> int:
    """How many lineups your cards could fill in this competition, up to its own limit."""
    pool = list(cards)
    made = 0
    while made < comp.teams_cap:
        from app.sorare.planner import best_starters

        found = best_starters(comp, pool, forecasts, keep=1)
        if not found:
            break
        made += 1
        used = {c.slug for c in found[0]}
        pool = [c for c in pool if c.slug not in used]
    return made


# --------------------------------------------------------------------------- payload
def card_payload(
    card: Card,
    comp: Competition,
    forecast: Forecast,
    games: dict[str, list[dict[str, Any]]],
    extra: dict[str, Any] | None = None,
) -> dict[str, Any]:
    game = (games.get(card.player) or [{}])[0]
    out: dict[str, Any] = {
        "slug": card.slug,
        "name": card.name,
        "pos": card.positions[0],
        "rarity": card.rarity,
        "inSeason": card.in_season,
        "level": card.level,
        "pic": card.picture,
        "avatar": card.avatar,
        "club": card.club_name,
        "crest": card.club_crest,
        "mult": round(comp.multiplier(card), 3),
        "p": round(forecast.p_play, 3),
        "mu": round(forecast.mu, 1),
        "x": round(forecast.p_play * forecast.mu, 1),
        "average": card.average,
        "actual": forecast.actual,
        "fixture": {
            "opponent": game.get("opponent"),
            "opponentCrest": game.get("opponentCrest"),
            "venue": game.get("venue"),
            "kickoff": game.get("kickoff"),
            "games": len(games.get(card.player) or []),
        }
        if game
        else None,
    }
    if extra:
        out.update(extra)
    return out


def lineup_payload(
    lineup: Lineup,
    forecasts: dict[str, Forecast],
    games: dict[str, list[dict[str, Any]]],
    actual_reference: dict[int, float] | None = None,
) -> dict[str, Any]:
    comp = lineup.comp
    came_in = {starter: sub for sub, starter in lineup.came_in}
    entered = {sub for sub, _ in lineup.came_in}
    starters = [
        card_payload(
            card,
            comp,
            forecasts[card.player],
            games,
            {
                "slot": "EXT" if len(comp.starters[i]) > 1 else comp.starters[i][0],
                "captain": i == lineup.captain,
                "subbedBy": came_in.get(card.slug),
            },
        )
        for i, card in enumerate(lineup.starters)
    ]
    subs = [
        card_payload(
            card,
            comp,
            forecasts[card.player],
            games,
            {"slot": "GK" if comp.subs[slot] == ("GK",) else "OUT", "cameIn": card.slug in entered},
        )
        for slot, card in enumerate(lineup.subs)
        if card is not None
    ]
    paying = comp.paying_tiers
    need = score_at_rank(comp.reference, paying[-1].hi) if paying and not comp.is_room else None
    if comp.is_room and comp.reference_rooms:
        third = sorted(comp.reference_rooms, reverse=True)
        need = float(np.percentile(comp.reference_rooms, 100 * (1 - 3 / max(comp.room_size, 4)))) if third else None
    tiers: list[dict[str, Any]] = []
    if comp.is_room:
        pay = {t.lo: t.essence for t in comp.tiers}
        for place, chance in zip((1, 2, 3), lineup.tier_probs, strict=False):
            tiers.append(
                {
                    "label": f"{place}{'st' if place == 1 else 'nd' if place == 2 else 'rd'}",
                    "essence": pay.get(place, 0),
                    "p": round(chance, 4),
                }
            )
    else:
        for tier, chance in zip(paying, lineup.tier_probs, strict=False):
            tiers.append(
                {
                    "lo": tier.lo,
                    "hi": tier.hi,
                    "cash": tier.cash,
                    "essence": tier.essence,
                    "card": tier.card,
                    "p": round(chance, 4),
                }
            )
    payload = {
        "comp": comp.name,
        "key": comp.key,
        "group": comp.group,
        "fee": comp.fee,
        "rarity": comp.rarity,
        "size": comp.size,
        "subSlots": len(comp.subs),
        "minInSeason": comp.min_in_season,
        "cap": comp.cap,
        "captainBonus": comp.captain_bonus,
        "entries": comp.entries,
        "x": round(lineup.expected),
        "lo": round(lineup.low),
        "hi": round(lineup.high),
        "pReturn": round(lineup.p_return, 4),
        "eEss": round(lineup.e_essence),
        "eCash": round(lineup.e_cash, 2),
        "pCard": round(lineup.p_card, 4),
        "need": round(need) if need else None,
        "needFrom": comp.reference_from,
        "tiers": tiers,
        "starters": starters,
        "subs": subs,
        "average": round(sum(c.average for c in lineup.starters)),
    }
    if lineup.actual is not None:
        actual_need = score_at_rank(actual_reference or {}, paying[-1].hi) if paying and actual_reference else None
        payload["actual"] = {
            "total": round(lineup.actual),
            "cash": lineup.actual_cash,
            "essence": round(lineup.actual_essence),
            "card": lineup.actual_card,
            "need": round(actual_need) if actual_need else None,
            "bonusLost": lineup.bonus_lost,
            "cameIn": [{"sub": sub, "for": starter} for sub, starter in lineup.came_in],
        }
    return payload


def plan_payload(
    plan: Plan,
    rank: int,
    forecasts: dict[str, Forecast],
    games: dict[str, list[dict[str, Any]]],
    usable: int,
    actual_references: dict[str, dict[int, float]] | None = None,
) -> dict[str, Any]:
    order = {"In-season": 0, "Classic": 1, "Room": 2}
    lineups = sorted(plan.lineups, key=lambda lu: (order[lu.comp.group], -(lu.e_essence + 1000 * lu.e_cash)))
    payload = {
        "rank": rank,
        "essence": round(plan.essence),
        "cash": round(plan.cash, 2),
        "pAny": round(plan.chance_of_any(), 4),
        "rewards": round(plan.rewards_expected, 2),
        "cardsUsed": plan.cards_used,
        "cardsAvailable": usable,
        "lineups": [lineup_payload(lu, forecasts, games, (actual_references or {}).get(lu.comp.key)) for lu in lineups],
    }
    if any(lu.actual is not None for lu in plan.lineups):
        payload["actual"] = {
            "essence": round(sum(lu.actual_essence for lu in plan.lineups)),
            "cash": round(sum(lu.actual_cash for lu in plan.lineups), 2),
            "cards": sum(1 for lu in plan.lineups if lu.actual_card),
            "paid": sum(1 for lu in plan.lineups if lu.actual_essence > 0 or lu.actual_cash or lu.actual_card),
            "inRange": sum(1 for lu in plan.lineups if lu.actual is not None and lu.low <= lu.actual <= lu.high),
        }
    return payload


def gameweek_payload(
    snapshot: dict[str, Any],
    week: dict[str, Any],
    comps: list[Competition],
    cards: list[Card],
    forecasts: dict[str, Forecast],
    games: dict[str, list[dict[str, Any]]],
    *,
    played: bool,
    actual_references: dict[str, dict[int, float]] | None = None,
    count: int = 5,
    runs: int = 30,
    draws: int = DRAWS,
    seed: int = 11,
) -> dict[str, Any]:
    """One gameweek: who plays, what can be entered, and the plans (replayed when it is already played)."""
    rng = np.random.default_rng(seed)
    with_reference = [c for c in comps if c.reference or c.reference_rooms]
    playable: list[dict[str, Any]] = []
    blocked: list[dict[str, Any]] = []
    ready: list[Competition] = []
    for comp in comps:
        possible = lineups_possible(comp, cards, forecasts)
        if possible:
            playable.append(
                {
                    "name": comp.name,
                    "key": comp.key,
                    "group": comp.group,
                    "rarity": comp.rarity,
                    "fee": comp.fee,
                    "size": comp.size,
                    "subs": len(comp.subs),
                    "cap": comp.cap,
                    "max": possible,
                    "entries": comp.entries,
                    "tiers": [
                        {"lo": t.lo, "hi": t.hi, "cash": t.cash, "essence": t.essence, "card": t.card}
                        for t in comp.paying_tiers
                    ],
                }
            )
            if comp in with_reference:
                ready.append(comp)
        elif any(comp.allows(c) and forecasts.get(c.player, Forecast(0, 0)).p_play > 0 for c in cards):
            blocked.append(
                {"name": comp.name, "rarity": comp.rarity, "group": comp.group, "why": why_not(comp, cards, forecasts)}
            )

    found = plans(ready, cards, forecasts, count=count, runs=runs, seed=seed, draws=draws) if ready else []
    if played:
        for plan in found:
            for lineup in plan.lineups:
                replay_rewards(lineup, forecasts, (actual_references or {}).get(lineup.comp.key, {}))

    in_plans = {lu.comp.key for plan in found for lu in plan.lineups}
    not_worth = []
    for comp in ready:
        if comp.key in in_plans:
            continue
        best = build(comp, cards, forecasts, rng, keep=1, draws=draws)
        if best:
            lineup = best[0]
            not_worth.append(
                {
                    "name": comp.name,
                    "group": comp.group,
                    "fee": comp.fee,
                    "eEss": round(lineup.e_essence),
                    "pReturn": round(lineup.p_return, 4),
                    "x": round(lineup.expected),
                }
            )

    players = [
        {
            "name": card.name,
            "pos": card.positions[0],
            "avatar": card.avatar,
            "club": card.club_name,
            "inSeason": card.in_season,
            "cards": sum(1 for c in cards if c.player == card.player),
            "games": games.get(card.player) or [],
        }
        for card in {c.player: c for c in cards if games.get(c.player)}.values()
    ]
    order = ["GK", "DEF", "MID", "FWD"]
    players.sort(key=lambda p: (order.index(str(p["pos"])), str(p["name"])))
    projections = next(
        (c.get("projectionsAt") for c in snapshot["competitions"].get(week["slug"], []) if c.get("projectionsAt")),
        None,
    )
    source = "sorare" if any(f.source == "sorare" for f in forecasts.values()) else "form"
    state = "none" if not players else ("ready" if found else "waiting")
    return {
        "gameweek": {
            "id": str(week["number"]),
            "slug": week["slug"],
            "number": week["number"],
            "name": week["name"],
            "start": week["start"],
            "end": week["end"],
            "lock": week["lock"],
        },
        "state": state,
        "played": played,
        "projectionsAt": projections,
        "source": source,
        "playing": {"cards": sum(1 for c in cards if games.get(c.player)), "players": players},
        "playable": sorted(playable, key=lambda o: (o["group"] != "In-season", o["group"] != "Classic", o["name"])),
        "blocked": blocked,
        "notWorth": not_worth,
        "plans": [
            plan_payload(plan, i + 1, forecasts, games, len(cards), actual_references if played else None)
            for i, plan in enumerate(found)
        ],
    }


def build_payload(
    snapshot: dict[str, Any], *, runs: int = 30, draws: int = DRAWS, previous: dict[str, Any] | None = None
) -> dict[str, Any]:
    """The whole `sorare` read model, from one snapshot.

    `previous` is the payload the app is already showing: when it holds the replay of the same finished
    gameweek, that part is kept as it is instead of being planned again.
    """
    now = _dt(snapshot["fetchedAt"])
    cards, left_out = read_cards(snapshot["cards"])
    plan_week = snapshot["planGameweek"]
    past_week = snapshot.get("pastGameweek")

    plan_games = card_games(snapshot["cards"], "plan")
    reference_for = snapshot.get("referenceFor") or {}
    references = snapshot.get("references") or {}
    plan_reference = references.get(reference_for.get("plan", ""), {})
    plan_comps = read_competitions(snapshot["competitions"].get(plan_week["slug"], []), plan_reference)
    plan_forecasts = build_forecasts(
        player_weeks(snapshot["cards"], plan_games, snapshot["history"], _dt(plan_week["lock"]), None, use_sorare=True)
    )
    next_gw = gameweek_payload(
        snapshot, plan_week, plan_comps, cards, plan_forecasts, plan_games, played=False, runs=runs, draws=draws
    )

    last_gw = None
    kept = (previous or {}).get("last") if (previous or {}).get("version") == PAYLOAD_VERSION else None
    if past_week and kept and kept.get("gameweek", {}).get("slug") == past_week["slug"] and kept.get("played"):
        last_gw = kept
    elif past_week:
        past_games = card_games(snapshot["cards"], "past")
        # a replay may only use the gameweek before it, and is scored against that gameweek's own results
        past_comps = read_competitions(
            snapshot["competitions"].get(past_week["slug"], []), references.get(reference_for.get("pastBefore", ""), {})
        )
        actual_reference = {
            key: {int(r): float(v) for r, v in (entry.get("cuts") or {}).items()}
            for key, entry in (references.get(reference_for.get("pastActual", "")) or {}).items()
        }
        past_forecasts = build_forecasts(
            player_weeks(
                snapshot["cards"],
                past_games,
                snapshot["history"],
                _dt(past_week["lock"]),
                (_dt(past_week["start"]), _dt(past_week["end"])),
                use_sorare=False,  # a replay may only know what was known before the lock
            )
        )
        last_gw = gameweek_payload(
            snapshot,
            past_week,
            past_comps,
            cards,
            past_forecasts,
            past_games,
            played=True,
            actual_references=actual_reference,
            runs=runs,
            draws=draws,
        )

    timeline = []
    keep = {plan_week["slug"], (past_week or {}).get("slug")}
    for week in snapshot["gameweeks"]:
        outside = _dt(week["end"]) < now - _week_window() or _dt(week["start"]) > now + _week_window(days=24)
        if outside and week["slug"] not in keep:
            continue
        status = "done" if _dt(week["end"]) < now else "live" if _dt(week["lock"]) <= now else "later"
        if week["slug"] == plan_week["slug"]:
            status = "next"
        item: dict[str, Any] = {
            "id": str(week["number"]),
            "slug": week["slug"],
            "number": week["number"],
            "start": week["start"],
            "end": week["end"],
            "lock": week["lock"],
            "status": status,
        }
        if week["slug"] == plan_week["slug"]:
            item["playing"] = next_gw["playing"]["cards"]
        elif last_gw and past_week and week["slug"] == past_week["slug"]:
            item["playing"] = last_gw["playing"]["cards"]
            item["won"] = last_gw["plans"][0]["actual"]["essence"] if last_gw["plans"] else 0
        timeline.append(item)

    by_rarity: dict[str, int] = {}
    by_position: dict[str, dict[str, int]] = {}
    for card in cards:
        by_rarity[card.rarity] = by_rarity.get(card.rarity, 0) + 1
        by_position.setdefault(card.rarity, {})
        by_position[card.rarity][card.positions[0]] = by_position[card.rarity].get(card.positions[0], 0) + 1

    return {
        "version": PAYLOAD_VERSION,
        "generatedAt": snapshot["fetchedAt"],
        "user": snapshot["user"],
        "timeline": timeline,
        "next": next_gw,
        "last": last_gw,
        "cards": {
            "total": len(snapshot["cards"]),
            "usable": len(cards),
            "excluded": left_out,
            "byRarity": by_rarity,
            "byPosition": by_position,
            "inSeason": sum(1 for c in cards if c.in_season),
            "rareGoalkeepers": sum(1 for c in cards if c.rarity == "rare" and c.positions[0] == "GK"),
        },
    }


def with_status(
    payload: dict[str, Any],
    *,
    where: str,
    moved: int,
    kept: dict[str, int],
    previous: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Add how this payload came to be, so the app can say whether it is worth trusting.

    `where` is "cloud" or "pc". A run only knows who wrote *it*, so the last cloud write is carried forward from
    the payload before it: that is what makes "the scheduled job is not syncing Sorare" visible at all.
    """
    before = ((previous or {}).get("status") or {}) if previous else {}
    last_cloud = payload["generatedAt"] if where == "cloud" else before.get("lastCloudAt")
    return {
        **payload,
        "status": {
            "builtAt": payload["generatedAt"],
            "where": where,
            "lastCloudAt": last_cloud,
            "moved": moved,
            "kept": kept,
        },
    }


def _week_window(days: int = 10):
    from datetime import timedelta

    return timedelta(days=days)


def today(now: datetime | None = None) -> date:
    return (now or datetime.now(UTC)).date()


__all__ = [
    "build_payload",
    "with_status",
    "read_cards",
    "read_competitions",
    "why_not",
    "lineups_possible",
    "fill_bench",
]
