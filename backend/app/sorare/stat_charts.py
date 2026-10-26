"""The Stats page's charts (owner's ask, 26 Oct 2026): every player of the five big leagues with five starts, his card, club and
league, and his mean count per start of every stat-sheet action over four windows: this season and his last 5, 10 and 40 starts.

Built once a day by the league-history job from the same saved starts as the stat sheets (`sheets.kept_games`), and published
as the read model `stat_charts`. Who each player is (name, club, crest, league and a real Limited card, his or anyone's) comes
from Sorare's public API, twenty players to a question, and is kept in `stat_chart_people` so a player is asked again only
after a week (two days when Sorare had no card for him). A player Sorare has not described yet waits for the next run.

An action a position's stat sheet does not have (Sorare scores no "possession won" for forwards) is None, never 0: a forward
is missing from that chart, not at the bottom of it. An action the sheet has but the player never did is 0.
"""

from __future__ import annotations

import logging
import re
from collections.abc import Mapping, Sequence
from datetime import datetime, timedelta
from typing import Any

from sqlalchemy.orm import Session

from app.models import ReadModel
from app.services.publish import put
from app.sorare import sheets
from app.sorare.card_art import ASSETS, season_of
from app.sorare.client import SorareClient, SorareError
from app.sorare.player_games import season_start

logger = logging.getLogger(__name__)

KEY = "stat_charts"
PEOPLE_KEY = "stat_chart_people"
MIN_STARTS = 5  # fewer starts and a player's means say too little to chart
MIN_SEASON = 3  # starts this season before the season window shows him
LAST = {"l5": 5, "l10": 10, "l40": 40}
ON_SHEET = 0.1  # an action is on a position's sheet when this share of its players has done it
LEAGUES = {
    "laliga-es": "LaLiga",
    "premier-league-gb-eng": "Premier League",
    "ligue-1-fr": "Ligue 1",
    "bundesliga-de": "Bundesliga",
    "serie-a-it": "Serie A",
}
BATCH = 20  # players in one aliased question
EVERY = timedelta(days=7)  # clubs and cards change slowly
NO_CARD_EVERY = timedelta(days=2)  # a player with no card yet is asked again sooner
SLUG = re.compile(r"[a-z0-9][a-z0-9-]*")


# ------------------------------------------------------------------------------------------------------------- the windows
def _window(starts: Sequence[dict[str, Any]], keys: Sequence[str], on_sheet: set[str]) -> dict[str, Any]:
    """Starts, mean score and each action's mean count per start (None off the position's sheet)."""
    n = len(starts)
    totals: dict[str, float] = {}
    for start in starts:
        for key, (count, _points) in start["stats"].items():
            totals[key] = totals.get(key, 0.0) + count
    return {
        "starts": n,
        "avg": round(sum(float(s["score"]) for s in starts) / n, 1),
        "values": [round(totals.get(key, 0.0) / n, 2) if key in on_sheet else None for key in keys],
    }


def build(games: Sequence[dict[str, Any]], people: Mapping[str, Mapping[str, Any]], now: datetime) -> dict[str, Any]:
    """The chart model: every described player of the five leagues with MIN_STARTS starts."""
    by_player = {slug: s for slug, s in sheets.starts_by_player(games).items() if len(s) >= MIN_STARTS}
    keys = sorted({key for starts in by_player.values() for start in starts for key in start["stats"]})
    # Which actions each position's sheet has: done by at least ON_SHEET of that position's players.
    done: dict[str, dict[str, int]] = {}
    count: dict[str, int] = {}
    for starts in by_player.values():
        pos = starts[-1]["pos"]
        count[pos] = count.get(pos, 0) + 1
        seen = done.setdefault(pos, {})
        for key in {k for s in starts for k in s["stats"]}:
            seen[key] = seen.get(key, 0) + 1
    on_sheet = {pos: {k for k, n in done.get(pos, {}).items() if n >= ON_SHEET * count[pos]} for pos in count}
    since = season_start(now).date().isoformat()
    players = []
    for slug, starts in sorted(by_player.items()):
        who = people.get(slug) or {}
        league = LEAGUES.get(str(who.get("league") or ""))
        if not league or not who.get("name"):
            continue
        pos = starts[-1]["pos"]
        current = [s for s in starts if s["date"] >= since]
        windows = {"cur": _window(current, keys, on_sheet[pos]) if len(current) >= MIN_SEASON else None}
        windows |= {name: _window(starts[-n:], keys, on_sheet[pos]) for name, n in LAST.items()}
        players.append(
            {
                "slug": slug,
                "name": who["name"],
                "pos": pos,
                "league": league,
                "club": who.get("club") or "",
                "crest": who.get("crest"),
                "card": who.get("card"),
                "windows": windows,
            }
        )
    return {
        "asOf": max((g["date"][:10] for g in games), default=""),
        "keys": keys,
        "onSheet": {pos: sorted(found) for pos, found in sorted(on_sheet.items())},
        "players": players,
    }


def wanted(games: Sequence[dict[str, Any]]) -> list[str]:
    """Every player with enough starts to chart."""
    return sorted(slug for slug, s in sheets.starts_by_player(games).items() if len(s) >= MIN_STARTS)


# ---------------------------------------------------------------------------------------------------------------- who is who
def people_query(slugs: Sequence[str], season: int) -> str:
    """One question for each player's name, club and league, and the first Limited card of the season; a slug is checked."""
    for slug in slugs:
        if not SLUG.fullmatch(slug):
            raise ValueError(f"not a player slug: {slug!r}")
    who = " ".join(
        f'p{i}: anyPlayer(slug: "{slug}") {{ displayName ... on Player {{ activeClub {{ name shortName pictureUrl '
        f"domesticLeague {{ slug }} }} }} }}"
        for i, slug in enumerate(slugs)
    )
    cards = " ".join(
        f'c{i}: allCards(playerSlugs: ["{slug}"], rarities: [limited], seasonStartYears: [{int(season)}], first: 1) '
        "{ nodes { pictureUrl } }"
        for i, slug in enumerate(slugs)
    )
    return "query { " + who + " football { " + cards + " } }"


def read_people(data: Mapping[str, Any], slugs: Sequence[str]) -> dict[str, dict[str, Any]]:
    """The answer by player; a player Sorare does not know is left out, a picture that is not Sorare's own is None."""
    out: dict[str, dict[str, Any]] = {}
    football = data.get("football") or {}
    for i, slug in enumerate(slugs):
        player = data.get(f"p{i}")
        if not isinstance(player, dict) or not player.get("displayName"):
            continue
        club = player.get("activeClub") or {}
        nodes = (football.get(f"c{i}") or {}).get("nodes") or []
        card = nodes[0].get("pictureUrl") if nodes and isinstance(nodes[0], dict) else None
        crest = club.get("pictureUrl")
        out[slug] = {
            "name": player["displayName"],
            "club": club.get("shortName") or club.get("name") or "",
            "crest": crest if isinstance(crest, str) and crest.startswith(ASSETS) else None,
            "league": (club.get("domesticLeague") or {}).get("slug"),
            "card": card if isinstance(card, str) and card.startswith(ASSETS) else None,
        }
    return out


def _due(entry: Mapping[str, Any] | None, now: datetime, season: int) -> bool:
    if not entry or entry.get("season") != season:
        return True
    try:
        asked = datetime.fromisoformat(str(entry.get("at")))
    except ValueError:
        return True
    return now - asked >= (EVERY if entry.get("card") else NO_CARD_EVERY)


def refresh_people(db: Session, client: SorareClient, now: datetime, slugs: Sequence[str]) -> dict[str, dict[str, Any]]:
    """Who each wanted player is, asking Sorare only for the ones not described this week; kept as PEOPLE_KEY."""
    row = db.get(ReadModel, PEOPLE_KEY)
    kept: dict[str, dict[str, Any]] = dict(row.payload) if row and isinstance(row.payload, dict) else {}
    db.rollback()  # Sorare is asked for over a minute: Neon closes a connection left inside a transaction
    season = season_of(now)
    due = [slug for slug in slugs if SLUG.fullmatch(slug) and _due(kept.get(slug), now, season)]
    for start in range(0, len(due), BATCH):
        batch = due[start : start + BATCH]
        try:
            found = read_people(client.query(people_query(batch, season)), batch)
            no_card = [slug for slug in batch if slug in found and not found[slug]["card"]]
            if no_card:  # early in a season the new cards are not minted yet: last season's card is still his
                older = read_people(client.query(people_query(no_card, season - 1)), no_card)
                for slug, entry in older.items():
                    found[slug]["card"] = entry["card"]
        except (SorareError, KeyError, TypeError, ValueError) as error:  # asked again next run
            logger.warning("stat charts: %d players not described: %s", len(batch), error)
            continue
        for slug, entry in found.items():
            kept[slug] = {**entry, "season": season, "at": now.isoformat()}
    if due:
        put(db, PEOPLE_KEY, kept, now)
    return kept


def publish(db: Session, client: SorareClient, games: Sequence[dict[str, Any]], now: datetime) -> dict[str, Any]:
    """Describe the wanted players and publish the chart model; returns it."""
    people = refresh_people(db, client, now, wanted(games))
    model = build(games, people, now)
    put(db, KEY, model, now)
    return model
