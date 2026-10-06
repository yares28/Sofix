"""Turn a Sorare snapshot into the finished page data the app reads.

The app does no work of its own: this builds the gameweek timeline, the competitions you can and cannot play
(with the reason), the five whole-gameweek plans and, for the gameweek just played, the same plans replayed
against what really happened.
"""

from __future__ import annotations

import logging
import math
from collections.abc import Callable, Mapping
from dataclasses import replace
from datetime import UTC, date, datetime, timedelta
from typing import Any

import numpy as np

from app.services.scoring import difficulty_label, difficulty_score, label_bucket
from app.sorare import expected, projection, rules, xg
from app.sorare.forecast import GameStart, PlayerWeek
from app.sorare.forecast import forecasts as build_forecasts
from app.sorare.model import SORARE_POSITION, Card, Competition, Forecast
from app.sorare.planner import DRAWS, Lineup, Plan, build, fill_bench, plans, replay_rewards, score_at_rank
from app.sorare.scores import Made

logger = logging.getLogger(__name__)

POSITION_WORDS = {"GK": "goalkeeper", "DEF": "defender", "MID": "midfielder", "FWD": "forward"}
PAYLOAD_VERSION = 7
"""The shape of the published page. A run only keeps a finished gameweek's replay from the payload the app is
already showing when that payload was built by this same version."""
LIVE_STATES = {"started", "live"}
ARCHIVE_PREFIX = "sorare_week:"
"""A finished gameweek is kept whole under `sorare_week:<its slug>` in `read_models`, apart from the main page."""
EARLY_DRAWS = 600
"""Simulated weeks per lineup in an early plan: a fifth of a real plan's, which keeps each under a few seconds. It is a first
guess anyway, and Sorare's own numbers replace it the moment the week opens."""
AHEAD_PREFIX = "sorare_ahead:"
"""An early plan for a LaLiga round Sorare has not opened is kept whole under `sorare_ahead:<round>`, rewritten every run."""
SETTLE = timedelta(hours=24)
"""How long after a gameweek ends its scores can still move (Sorare reviews some for a while). A replay built earlier
is rebuilt; one built later is final, kept as it is, and written to the archive."""
GIVE_UP = timedelta(days=7)
"""A replay built from everything Sorare was asked is final once SETTLE has passed. One that still lacks something (a call
that got no answer) is rebuilt on every run until it has it; if that has not happened this long after the week ended,
waiting will not bring it, and the replay is kept as it is."""


# A player's score if he starts, worked out from each game itself: (his card, his games, Sorare's projection, his past games) -> one score a game (scores.py)
ScoresOf = Callable[[dict[str, Any], list[dict[str, Any]], float | None, list[dict[str, Any]]], Made]


def _dt(value: str) -> datetime:
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


def is_final(week: dict[str, Any], at: datetime) -> bool:
    """Whether a replay built at `at` is the last word on its week: its scores have settled, and nothing it was built from
    was missing (`complete`), unless it has lacked something for so long that it is kept as it is."""
    ended = _dt(week["gameweek"]["end"])
    if at < ended + SETTLE:
        return False
    return bool(week.get("complete", True)) or at >= ended + GIVE_UP


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
                l5=_score(player.get("l5")),
                l40=_score(player.get("l40")),
                started5=_started(player.get("lastFiveSo5Appearances"), 5),
                started10=_started(player.get("lastTenSo5Appearances"), 10),
                started40=_started(player.get("lastFortySo5Appearances"), 40),
                stars=_STARS.get(player.get("gameplayTier") or ""),
            )
        )
    return usable, left_out


def _expected(forecast: Forecast | None) -> float:
    """What a player is expected to score, counting the chance he does not play at all."""
    return forecast.p_play * forecast.mu if forecast else 0.0


def _goals(price: Any) -> float | None:
    """The goals a clean-sheet price implies. The chance a side keeps a clean sheet is the chance the other scores none,
    e^-goals for a Poisson count, so a price of 1.80 (56%) means the other side scores 0.59 a game. Its margin makes the
    chance a little high and the goals a little low."""
    if isinstance(price, int | float) and not isinstance(price, bool) and price > 1:
        return round(math.log(price), 2)
    return None


def game_odds(game: dict[str, Any], at_home: bool) -> dict[str, Any] | None:
    """Sorare's own odds for the side the player is on, read the way the board reads a game.

    Win, draw and loss are Sorare's basis points; the clean sheet is the chance behind its decimal price (so a
    point or two high, the bookmaker's margin is in it). `goalsFor` and `goalsAgainst` are the goals each side's clean-sheet
    price implies, which the overlay uses to say how many goals his side is expected to score. Difficulty and label use the board's formula and its
    home/away cut points, so a 35 here is the 35 on /difficulty. A game Sorare has not priced yet (it fills the
    odds only in the last few days) has no block at all: an absent number, never a zero.
    """
    stats = game.get("homeStats" if at_home else "awayStats") or {}
    basis = [stats.get(key) for key in ("winOddsBasisPoints", "drawOddsBasisPoints", "loseOddsBasisPoints")]
    if not all(isinstance(value, int | float) and not isinstance(value, bool) for value in basis):
        return None
    win, draw, loss = (float(value) / 10000 for value in basis)  # type: ignore[arg-type]
    if win + draw + loss <= 0:
        return None
    score = difficulty_score(win, draw, loss)
    label = difficulty_label(score, "H" if at_home else "A")
    price = stats.get("cleanSheetOdds")
    clean = (
        round(1 / price, 3) if isinstance(price, int | float) and not isinstance(price, bool) and price > 1 else None
    )
    other = game.get("awayStats" if at_home else "homeStats") or {}
    return {
        "win": round(win, 4),
        "draw": round(draw, 4),
        "loss": round(loss, 4),
        "cleanSheet": clean,
        "goalsFor": _goals(other.get("cleanSheetOdds")),
        "goalsAgainst": _goals(price),
        "difficulty": round(score, 1),
        "label": label,
        "bucket": label_bucket(label),
        "source": "sorare",
    }


def _with_chances(games: list[dict[str, Any]], forecast: Forecast | None) -> list[dict[str, Any]]:
    """His games, each with its own chance of starting, where it is told game by game (Futbol Fantasy speaks about one).

    `pStart` and `pOn` are that game's, `startSource` whose number the start chance is (futbolfantasy, sorare or sofix), and
    the rest (`startAt`, `ffStatus`, `ffMatch`, `ffPlayer`, `ffChanged`) what Futbol Fantasy said and when. A player it
    has nothing on keeps his games as they were: one chance for the week, as before.
    """
    if not forecast or not forecast.per_game:
        return games
    told = {chance.game: chance for chance in forecast.per_game}
    return [
        {**game, "pStart": round(c.p_start, 3), "pOn": round(c.p_on, 3), "startSource": c.source, **c.info}
        if (c := told.get(game["id"]))
        else game
        for game in games
    ]


def _shape_out(shape: Any) -> dict[str, Any] | None:
    """The picture of a game for the panel: the chance of a decisive action, the score with and without one, how far each spreads, where he
    lands 8 times in 10 and what moves the number, in whole points (the three biggest, none under a point)."""
    if shape is None:
        return None
    why = [[name, round(points)] for name, points in shape.why if round(points) != 0][:3]
    return {
        "p": round(shape.p_decisive, 3),
        "dec": round(shape.if_decisive, 1),
        "plain": round(shape.if_plain, 1),
        "sdDec": round(shape.sd_decisive, 1),
        "sdPlain": round(shape.sd_plain, 1),
        "low": round(shape.low),
        "high": round(shape.high),
        "why": why,
    }


def _split_out(forecast: Forecast | None) -> dict[str, Any]:
    """His score if he starts and if he does not, and the chance of each (O9). For the overlay; plans never use it."""
    if not forecast or forecast.start is None or forecast.bench is None:
        return {}
    shape, on_shape = _shape_out(forecast.shape), _shape_out(forecast.on_shape)
    return {
        **({"shape": shape} if shape else {}),
        **({"onShape": on_shape} if on_shape else {}),
        "start": forecast.start,
        "bench": forecast.bench,
        **({"on": forecast.on} if forecast.on is not None else {}),
        "pStart": forecast.p_start if forecast.p_start is not None else 0.0,
        "pOn": forecast.p_on if forecast.p_on is not None else 0.0,
        "startSource": forecast.start_source,
        "sources": forecast.by_source,
        **({"benchedOn": forecast.benched_on} if forecast.benched_on is not None else {}),
    }


def card_games(rows: list[dict[str, Any]], key: str) -> dict[str, list[dict[str, Any]]]:
    """Each player's games inside one gameweek, with the opponent as the app shows it (and Sorare's odds, if priced)."""
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
            team = home if at_home else away
            other = away if at_home else home
            odds = game_odds(game, at_home)
            listed.append(
                {
                    "id": game["id"],
                    "kickoff": game["date"],
                    "competition": game["competition"]["slug"],
                    "team": team.get("shortName") or team["name"],
                    "teamCrest": team.get("pictureUrl"),
                    "opponent": other.get("shortName") or other["name"],
                    "opponentCrest": other.get("pictureUrl"),
                    "venue": "H" if at_home else "A",
                    **({"odds": odds} if odds else {}),
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
    ff: Callable[[str, list[dict[str, Any]]], list[GameStart]] | None = None,
    scores: ScoresOf | None = None,
) -> dict[str, PlayerWeek]:
    """What is known about each player before the lock (and, for a played gameweek, what he scored).

    `ff` answers, for a player and his games in kickoff order, Futbol Fantasy's chance for each game it has one for. It is
    only passed for a week still to come, the one being planned or the early plan of the round it has: it knows each
    team's next game and nothing further, so it has nothing to say about the games of any other round.

    `scores` works his score if he starts out from each game itself (the football model's numbers and the goals line, `scores.py`);
    without it, or for a game it cannot tell, his number is what it was.
    """
    weeks: dict[str, PlayerWeek] = {}
    for row in rows:
        player = row["player"]
        slug = player["slug"]
        if slug in weeks:
            continue
        mine = games.get(slug) or []
        # A game Sorare has not scored yet comes back as a PENDING row (no score, playedInGame false): it is a game to
        # come, not one he missed, so it is no part of his form. DID_NOT_PLAY is the real miss and stays.
        past = [h for h in history.get(slug, []) if _dt(h["date"]) < lock and h.get("status") != "PENDING"]
        past.sort(key=lambda h: h["date"], reverse=True)
        odds = player.get("nextClassicFixturePlayingStatusOdds") or {}
        plays = None
        start_odds = None
        if use_sorare and odds:
            plays = (odds.get("starterOddsBasisPoints", 0) + odds.get("substituteOddsBasisPoints", 0)) / 10000
            start_odds = odds.get("starterOddsBasisPoints", 0) / 10000
        actual = None
        if window:
            played = [
                h["score"]
                for h in history.get(slug, [])
                if window[0] <= _dt(h["date"]) < window[1] and h["played"] and h["score"] is not None
            ]
            actual = max(played) if played else None
        ordered = sorted(mine, key=lambda g: _dt(g["kickoff"])) if ff else mine
        told = ff(slug, ordered) if ff else []
        pos = SORARE_POSITION.get(player.get("position") or "")
        made = (
            scores(player, mine, player.get("nextClassicFixtureProjectedScore") if use_sorare else None, past)
            if scores
            else Made((), None)
        )
        weeks[slug] = PlayerWeek(
            games=len(mine),
            projection=player.get("nextClassicFixtureProjectedScore") if use_sorare else None,
            plays_odds=plays,
            history=[(h["date"], h["score"] or 0.0, h["played"]) for h in past],
            actual=actual,
            start_odds=start_odds,
            # Only games he played have a role worth recording; a snapshot from before O9 has none.
            starts={h["date"]: bool(h["started"]) for h in past if h["played"] and "started" in h},
            pos=pos,
            game_ids=[g["id"] for g in ordered] if told else [],
            game_starts=told,
            game_scores=tuple(o.start for o in made.outcomes),
            shape=made.outcomes[0] if made.outcomes else None,
            sub=made.sub,
        )
    return weeks


# --------------------------------------------------------------------------- competitions
def read_competitions(
    raw: list[dict[str, Any]], references: dict[str, Any], expected_from: str | None = None
) -> list[Competition]:
    """The competitions of one gameweek with the scores that paid in a finished one.

    `expected_from` marks them as the ones Sorare is going to open, copied from that finished gameweek (`GW15`).
    """
    comps = []
    for payload in raw:
        if payload.get("skipped") or not payload.get("appearances"):
            continue
        comp = rules.competition(payload)
        reference = references.get(comp.key) or {}
        comp.reference = {int(k): float(v) for k, v in (reference.get("cuts") or {}).items()}
        comp.reference_rooms = [float(v) for v in (reference.get("rooms") or [])]
        comp.reference_from = f"GW{reference['gameweek']}" if reference.get("gameweek") else ""
        if expected_from:
            comp.expected, comp.expected_from = True, expected_from
        comps.append(comp)
    return comps


def official_laliga(comps: list[Competition]) -> bool:
    """Whether Sorare lists a competition that counts LaLiga games for this gameweek."""
    return any(expected.LALIGA in (comp.leagues or ()) for comp in comps)


def expected_competitions(snapshot: dict[str, Any], laliga_games: int) -> list[Competition]:
    """The LaLiga competitions Sorare is going to open for a week with this many LaLiga games, from the finished week of its kind.

    Nothing when the week holds no LaLiga game, or when no finished week of its kind has been read yet (`expected`).
    """
    if not expected.gets_laliga(laliga_games):
        return []
    template = (snapshot.get("expected") or {}).get(expected.band(laliga_games))
    if not template:
        return []
    reference = (snapshot.get("references") or {}).get(template["slug"], {})
    return read_competitions(template["competitions"], reference, expected_from=f"GW{template['number']}")


def reference_of_week(snapshot: dict[str, Any], week: dict[str, Any], plan_reference: dict[str, Any]) -> dict[str, Any]:
    """The reward cut-offs a gameweek opened ahead is judged by.

    The week being planned is judged by the finished week with about as much football in it; a week further ahead can be of
    another kind (the weekend round after an international break), and that finished week had no LaLiga competition at all. A
    week holding LaLiga games takes the cut-offs of the finished week of its kind (`expected`) for its LaLiga competitions.
    """
    laliga = int(week.get("laliga") or 0)
    template = (snapshot.get("expected") or {}).get(expected.band(laliga)) if expected.gets_laliga(laliga) else None
    if not template:
        return plan_reference
    return {**plan_reference, **(snapshot.get("references") or {}).get(template["slug"], {})}


def with_expected(snapshot: dict[str, Any], comps: list[Competition], week: dict[str, Any]) -> list[Competition]:
    """A gameweek Sorare has opened, plus the LaLiga competitions it has not listed for it yet.

    Only when the week holds a LaLiga game and Sorare lists none for it: once it lists them they are the week's own, and the
    expected ones are not added, so no competition is ever shown twice.
    """
    if official_laliga(comps):
        return comps
    return [*comps, *expected_competitions(snapshot, int(week.get("laliga") or 0))]


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


def _expected_flags(comp: Competition) -> dict[str, Any]:
    """What marks a competition Sorare has not opened: it is copied from a finished gameweek and cannot be entered."""
    return {"expected": True, "expectedFrom": comp.expected_from} if comp.expected else {}


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
def _start_of(forecast: Forecast) -> dict[str, Any]:
    """A card's chance of starting, whose number it is, and what the site says is wrong with him when it says anything."""
    if forecast.p_start is None or forecast.start_source is None:
        return {}
    out: dict[str, Any] = {"pStart": round(forecast.p_start, 3), "startSource": forecast.start_source}
    kind = ((forecast.per_game[0].info.get("ffStatus") or {}).get("kind")) if forecast.per_game else None
    if kind in ("out", "doubt", "suspended"):
        out["ffKind"] = kind
    return out


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
        "player": card.player,
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
        **_start_of(forecast),
        "mu": round(forecast.mu, 1),
        "x": round(forecast.p_play * forecast.mu, 1),
        "average": card.average,
        "actual": forecast.actual,
        "fixture": {
            "team": game.get("team"),
            "teamCrest": game.get("teamCrest"),
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
        "board": comp.slug,  # Sorare reaches a leaderboard by slug, and enters one by id: Apply needs both
        "boardId": comp.board_id,
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
        **_expected_flags(comp),
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


def hindsight_forecasts(forecasts: dict[str, Forecast]) -> dict[str, Forecast]:
    """What the planner would have known with the results in: who played, and exactly what each scored.

    A player who did not play cannot be picked, and one who did scores what he scored, with no spread left to
    guess. Feeding these to the planner gives the best lineups of a week that is already over.
    """
    return {
        player: Forecast(
            p_play=1.0 if f.actual is not None else 0.0,
            mu=f.actual if f.actual is not None else 0.0,
            games=f.games,
            source="hindsight",
            actual=f.actual,
            sd=0.0,
        )
        for player, f in forecasts.items()
    }


def hindsight_plan(
    comps: list[Competition],
    cards: list[Card],
    forecasts: dict[str, Forecast],
    games: dict[str, list[dict[str, Any]]],
    actual_references: dict[str, dict[int, float]],
    *,
    runs: int,
    seed: int = 11,
) -> dict[str, Any] | None:
    """The best way to spread your cards over a finished week's competitions, knowing every score.

    Competitions are priced by the scores that really paid that week, and a Room is left out: what it pays depends on
    nine other managers' lineups, which is not known here. None when no lineup can be filled.
    """
    oracle = hindsight_forecasts(forecasts)
    ready = [c for c in comps if not c.is_room and c.reference and lineups_possible(c, cards, oracle)]
    found = plans(ready, cards, oracle, count=1, runs=runs, seed=seed, draws=4) if ready else []
    if not found:
        return None
    for lineup in found[0].lineups:
        replay_rewards(lineup, oracle, actual_references.get(lineup.comp.key, {}))
    payload = plan_payload(found[0], 1, oracle, games, len(cards), actual_references)
    payload["hindsight"] = True
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
    xg_rates: dict[str, dict[str, Any]] | None = None,
    actual_references: dict[str, dict[int, float]] | None = None,
    hindsight_comps: list[Competition] | None = None,
    count: int = 5,
    runs: int = 30,
    draws: int = DRAWS,
    seed: int = 11,
) -> dict[str, Any]:
    """One gameweek: who plays, what can be entered, and the plans (replayed when it is already played)."""
    rng = np.random.default_rng(seed)
    # Players of one game score together (links.py): the planner needs to know who plays whom.
    forecasts = {
        slug: replace(f, links=tuple((g["id"], g["venue"]) for g in games.get(slug, []) if g.get("venue")))
        for slug, f in forecasts.items()
    }
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
                    **_expected_flags(comp),
                }
            )
            if comp in with_reference:
                ready.append(comp)
        elif any(comp.allows(c) and forecasts.get(c.player, Forecast(0, 0)).p_play > 0 for c in cards):
            blocked.append(
                {
                    "name": comp.name,
                    "rarity": comp.rarity,
                    "group": comp.group,
                    "why": why_not(comp, cards, forecasts),
                    **_expected_flags(comp),
                }
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

    # Every player of yours with a game this week. In a week LaLiga is away, this is the whole board: the
    # app has nothing else to show, so the card, the chance he plays and what he is expected to score go with it.
    rates = xg_rates or {}
    players = [
        {
            "player": card.player,
            "name": card.name,
            "pos": card.positions[0],
            "avatar": card.avatar,
            "pic": card.picture,
            "club": card.club_name,
            "crest": card.club_crest,
            "rarity": card.rarity,
            "inSeason": card.in_season,
            "cards": sum(1 for c in cards if c.player == card.player),
            "p": round(forecasts.get(card.player, Forecast(0, 0)).p_play, 3),
            "x": round(_expected(forecasts.get(card.player)), 1),
            "average": card.average,
            "games": _with_chances(games.get(card.player) or [], forecasts.get(card.player)),
            **_split_out(forecasts.get(card.player)),
            **({"xg": rates[card.player]} if card.player in rates else {}),
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
    out: dict[str, Any] = {
        "gameweek": {
            "id": str(week.get("id", week["number"])),
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
    if played and hindsight_comps is not None:
        hindsight = hindsight_plan(
            hindsight_comps, cards, forecasts, games, actual_references or {}, runs=max(4, runs // 2), seed=seed
        )
        if hindsight:
            out["hindsight"] = hindsight
    return out


def settled_replay(previous: dict[str, Any] | None) -> dict[str, Any] | None:
    """The replay of the gameweek last played in the page the app is showing, when it is final and can be kept.

    Final means the page was built by this same version, at least SETTLE after that gameweek ended (before that some of
    its scores can still move), from everything Sorare was asked (`is_final`). Anything else is rebuilt from the snapshot.
    """
    if not previous or previous.get("version") != PAYLOAD_VERSION:
        return None
    last = week_of(previous, "last")
    if not last or not last.get("played"):
        return None
    return last if is_final(last, _dt(previous["generatedAt"])) else None


def kept_replay(previous: dict[str, Any] | None, past_week: dict[str, Any] | None) -> dict[str, Any] | None:
    """That replay, if it is for the gameweek this run treats as the one just played."""
    last = settled_replay(previous)
    return last if last and past_week and last["gameweek"]["slug"] == past_week["slug"] else None


def archive_of(payload: dict[str, Any]) -> tuple[str, dict[str, Any]] | None:
    """The gameweek just played, with the key it is kept under, once its scores are final. None before that."""
    last = week_of(payload, "last")
    if not last or not is_final(last, _dt(payload["generatedAt"])):
        return None
    return f"{ARCHIVE_PREFIX}{last['gameweek']['slug']}", last


def projected_weeks(
    snapshot: dict[str, Any],
    rounds: list[projection.Round],
    *,
    runs: int = 30,
    draws: int = EARLY_DRAWS,
    ff: Callable[[str, list[dict[str, Any]]], list[GameStart]] | None = None,
    scores: ScoresOf | None = None,
) -> list[dict[str, Any]]:
    """An early plan for each LaLiga round Sorare has not opened a gameweek for.

    Which cards play comes from the LaLiga calendar; the competitions are the LaLiga ones Sorare is going to open for a round
    of that size, copied from the latest finished gameweek of its kind (`expected`), with that week's rewards and cut-offs; the
    forecasts stand on form, since Sorare projects only a player's next game.
    The one exception is `ff`, Futbol Fantasy's chance game by game: it has each club's next game, so it speaks for the
    round about to be played and for no round after it. A player it has out or suspended is in no lineup.
    One plan is enough this far out: the numbers will move before the week opens, and Sorare's own replace all of it.
    """
    cards, _ = read_cards(snapshot["cards"])
    out = []
    for round_ in rounds:
        start, end, lock = projection.window(round_.first)
        games = projection.games_for(cards, round_)
        comps = expected_competitions(snapshot, len(round_.matches))
        forecasts = build_forecasts(
            player_weeks(
                snapshot["cards"], games, snapshot["history"], lock, None, use_sorare=False, ff=ff, scores=scores
            )
        )
        week = {
            "id": f"md{round_.number}",
            "number": 0,
            "slug": f"projected-md{round_.number}",
            "name": f"LaLiga GW{round_.number}",
            "start": start.isoformat(),
            "end": end.isoformat(),
            "lock": lock.isoformat(),
        }
        early = gameweek_payload(
            snapshot,
            week,
            comps if games else [],
            cards,
            forecasts,
            games,
            played=False,
            count=1,
            runs=max(4, runs // 4),
            draws=draws,
        )
        early["projected"] = {
            "round": round_.number,
            "basedOn": comps[0].expected_from if comps else "",
            "expected": bool(comps),
        }
        out.append(early)
    return out


def projected_heads(weeks: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """What the main page says about each early week: enough for the week picker, never the whole week."""
    return [
        {
            "round": week["projected"]["round"],
            "id": week["gameweek"]["id"],
            "from": week["gameweek"]["start"],
            "to": week["gameweek"]["end"],
            "cards": week["playing"]["cards"],
            "plans": len(week["plans"]),
            "expected": bool(week["projected"].get("expected")),
        }
        for week in weeks
    ]


def build_payload(
    snapshot: dict[str, Any],
    *,
    runs: int = 30,
    draws: int = DRAWS,
    previous: dict[str, Any] | None = None,
    projected: list[dict[str, Any]] | None = None,
    ff: Callable[[str, list[dict[str, Any]]], list[GameStart]] | None = None,
    scores: ScoresOf | None = None,
) -> dict[str, Any]:
    """The whole `sorare` read model, from one snapshot.

    `previous` is the payload the app is already showing: when it holds the replay of the same finished
    gameweek, that part is kept as it is instead of being planned again. `ff` is Futbol Fantasy's chance game by game
    for the gameweek being planned (`ff_use.Lineups.starts`); without it the page is what it was. `scores` works each player's
    score if he starts out from his games, for the week being planned and those after it (a played week's replay keeps what was known then).
    """
    now = _dt(snapshot["fetchedAt"])
    cards, left_out = read_cards(snapshot["cards"])
    plan_week = snapshot["planGameweek"]
    past_week = snapshot.get("pastGameweek")

    plan_games = card_games(snapshot["cards"], "plan")
    # Understat's numbers (when the job could read them) turned into each midfielder's and forward's xG for a game he starts
    xg_rates = xg.build(snapshot["cards"], snapshot["history"], snapshot.get("understat") or {})
    reference_for = snapshot.get("referenceFor") or {}
    references = snapshot.get("references") or {}
    plan_reference = references.get(reference_for.get("plan", ""), {})
    plan_comps = with_expected(
        snapshot, read_competitions(snapshot["competitions"].get(plan_week["slug"], []), plan_reference), plan_week
    )
    plan_forecasts = build_forecasts(
        player_weeks(
            snapshot["cards"],
            plan_games,
            snapshot["history"],
            _dt(plan_week["lock"]),
            None,
            use_sorare=True,
            ff=ff,
            scores=scores,
        )
    )
    next_gw = gameweek_payload(
        snapshot,
        plan_week,
        plan_comps,
        cards,
        plan_forecasts,
        plan_games,
        played=False,
        xg_rates=xg_rates,
        runs=runs,
        draws=draws,
    )

    last_gw = kept_replay(previous, past_week)
    if past_week and not last_gw:
        past_games = card_games(snapshot["cards"], "past")
        # a replay may only use the gameweek before it, and is scored against that gameweek's own results
        past_comps = read_competitions(
            snapshot["competitions"].get(past_week["slug"], []), references.get(reference_for.get("pastBefore", ""), {})
        )
        actual_reference = {
            key: {int(r): float(v) for r, v in (entry.get("cuts") or {}).items()}
            for key, entry in (references.get(reference_for.get("pastActual", "")) or {}).items()
        }
        # the same competitions priced by what really paid that week, for the best lineups in hindsight
        hindsight_comps = read_competitions(
            snapshot["competitions"].get(past_week["slug"], []), references.get(reference_for.get("pastActual", ""), {})
        )
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
            xg_rates=xg_rates,
            actual_references=actual_reference,
            hindsight_comps=hindsight_comps,
            runs=runs,
            draws=draws,
        )
        # Whether Sorare answered everything this week was built from; if not, it is rebuilt next run, not kept as final.
        last_gw["complete"] = not snapshot.get("pastGaps")

    # The gameweeks after the next one: Sorare has opened them and the cards are known, but it publishes a
    # projection only for a player's next fixture, so these stand on form and the payload says so.
    ahead: list[dict[str, Any]] = []
    for i, week in enumerate(snapshot.get("aheadGameweeks") or []):
        comps = with_expected(
            snapshot,
            read_competitions(
                snapshot["competitions"].get(week["slug"], []), reference_of_week(snapshot, week, plan_reference)
            ),
            week,
        )
        games = card_games(snapshot["cards"], f"a{i}")
        # Futbol Fantasy has each club's next game, which can sit in a week Sorare has opened but is not planning yet (the weekend
        # round during an international break): it speaks for those games and for no other.
        forecasts = build_forecasts(
            player_weeks(
                snapshot["cards"],
                games,
                snapshot["history"],
                _dt(week["lock"]),
                None,
                use_sorare=False,
                ff=ff,
                scores=scores,
            )
        )
        ahead.append(
            gameweek_payload(
                snapshot,
                week,
                comps if games else [],
                cards,
                forecasts,
                games,
                played=False,
                xg_rates=xg_rates,
                count=1,  # one plan is enough this far out: the numbers will change before it locks
                runs=max(4, runs // 4),
                draws=draws,
            )
        )

    timeline = []
    keep = {
        plan_week["slug"],
        (past_week or {}).get("slug"),
        *[w["slug"] for w in (snapshot.get("aheadGameweeks") or [])],
    }
    # What the page before said about the weeks it kept apart: the picker still needs their headline once they are
    # no longer the week just played, and reading them back from the archive would be a whole page each.
    carried = {
        entry["slug"]: entry
        for entry in (previous or {}).get("timeline") or []
        if entry.get("kept") and "slug" in entry
    }
    for week in snapshot["gameweeks"]:
        # Every week of the season so far stays: a finished week is still a week you can open. Only the far future
        # is left out, until Sorare has opened it.
        if _dt(week["start"]) > now + _week_window(days=24) and week["slug"] not in keep:
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
        before = carried.get(week["slug"])
        if before:
            item.update({key: before[key] for key in ("playing", "won", "kept") if key in before})
        if week["slug"] == plan_week["slug"]:
            item["playing"] = next_gw["playing"]["cards"]
        elif last_gw and past_week and week["slug"] == past_week["slug"]:
            item["playing"] = last_gw["playing"]["cards"]
            item["won"] = last_gw["plans"][0]["actual"]["essence"] if last_gw["plans"] else 0
            if is_final(last_gw, now):
                item["kept"] = True  # the job writes it to the archive in this run, once
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
        "weeks": [w for w in [last_gw, next_gw, *ahead] if w],
        "nextId": next_gw["gameweek"]["id"],
        "lastId": last_gw["gameweek"]["id"] if last_gw else None,
        # LaLiga rounds Sorare has not opened: each early plan is a read model of its own, this is its headline
        "projected": projected or [],
        "cards": {
            "total": len(snapshot["cards"]),
            "usable": len(cards),
            "excluded": left_out,
            "byRarity": by_rarity,
            "byPosition": by_position,
            "inSeason": sum(1 for c in cards if c.in_season),
            "rareGoalkeepers": sum(1 for c in cards if c.rarity == "rare" and c.positions[0] == "GK"),
        },
        # S5: the whole collection card by card, and the LaLiga players priced right now.
        "collection": collection_out(cards),
        "market": market_out(snapshot.get("market") or []),
    }


# Sorare's gameplay tier, drawn as one to five stars. Five is the top, which the page calls Icon.
_STARS = {"DNP": 1, "ROSTER": 2, "IMPACT": 3, "STAR": 4, "GOAT": 5}


def _score(value: Any) -> float | None:
    return None if value is None else round(float(value), 1)


def _started(appeared: Any, window: int) -> float | None:
    """How often he played in that window, as a percentage. `appeared` is a count out of `window` games."""
    return None if appeared is None else round(100 * float(appeared) / window, 1)


def collection_out(cards: list[Card]) -> list[dict[str, Any]]:
    """Every usable card, in the shape the My cards page (S5) draws. The page groups and sorts them itself.

    L5 and L40 are Sorare's average scores over those windows; L10 is the last-ten-played average the rest of
    the app already uses. `started` is the share of games in that window he actually played. `stars` is his
    gameplay tier (Star, Icon, and the rest).
    """
    return [
        {
            "slug": c.slug,
            "player": c.player,
            "name": c.name,
            "pos": c.positions[0],
            "rarity": c.rarity,
            "inSeason": c.in_season,
            "level": c.level,
            "average": round(c.average, 1),
            "club": c.club_name,
            "pic": c.picture,
            "scores": [
                {"window": "L5", "score": c.l5, "started": c.started5},
                {"window": "L10", "score": round(c.average, 1) if c.average else None, "started": c.started10},
                {"window": "L40", "score": c.l40, "started": c.started40},
            ],
            "stars": c.stars,
        }
        for c in cards
    ]


def with_card_art(market: list[dict[str, Any]], urls: Mapping[str, str]) -> list[dict[str, Any]]:
    """Each player of the price index drawn as a real Sorare card (`card_art`), where one is known; else his picture as it was.

    The market's own `pic` is Sorare's cut-out photo; the owner's rule is a card wherever possible (2 Oct 2026).
    """
    return [{**row, "pic": urls.get(row["slug"]) or row.get("pic") or ""} for row in market]


def market_out(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """The LaLiga price index for the Player search page (S5), one row per player, keyed the app's way."""
    out: list[dict[str, Any]] = []
    for row in rows:
        eur = row.get("eur")
        if eur is None:
            continue
        out.append(
            {
                "slug": row["slug"],
                "name": row["name"],
                "pos": row["pos"],
                "club": row.get("club"),
                "crest": row.get("crest"),
                "average": round(float(row.get("average") or 0.0), 1),
                "projection": row.get("projection"),
                "eur": round(float(eur), 2),
                "pic": row.get("pic") or "",
            }
        )
    out.sort(key=lambda p: -p["average"])
    return out


def week_of(payload: dict[str, Any], which: str = "next") -> dict[str, Any] | None:
    """The gameweek being planned (`next`) or the last one played (`last`), out of the payload's `weeks`."""
    wanted = payload.get("nextId") if which == "next" else payload.get("lastId")
    return next((w for w in payload.get("weeks", []) if w["gameweek"]["id"] == wanted), None) if wanted else None


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
