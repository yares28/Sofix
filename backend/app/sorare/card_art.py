"""A real Sorare card for every LaLiga player, owned or not (owner's rule, 2 Oct 2026; plans/review-fixes.md, Q6).

The Lineups page draws every player as his Sorare card. The owner's own cards come with his snapshot; for everyone else Sorare's
public card listing (`football.allCards`) returns a minted Limited card of the season whoever owns it, with the same kind of
picture. Nothing needs a login, and the printed serial is another owner's, too small to read at card size.

The job keeps one picture address per player in the read model `sorare_card_art`, asks only for the ones it lacks (twenty players in
one aliased question), and keeps the roster, read from each club's squad, that the lineups' people are linked to by name
(`ff_link`) so a page's player is found among them. A squad or a question Sorare does not answer leaves what was kept: a player
without a picture is drawn as he was before, never as nothing.
"""

from __future__ import annotations

import logging
import re
from collections.abc import Iterable, Mapping, Sequence
from dataclasses import dataclass, field, replace
from datetime import datetime, timedelta
from typing import Any

from sqlalchemy.orm import Session

from app.models import ReadModel
from app.services.publish import put
from app.sorare import ff_link
from app.sorare.client import SorareClient, SorareError
from app.sorare.sync import CLUBS

logger = logging.getLogger(__name__)

ART_KEY = "sorare_card_art"
COMPETITION = "laliga-es"
ROSTER_EVERY = timedelta(hours=20)  # a squad changes slowly
ART_EVERY = timedelta(days=14)  # a card's picture does not
NONE_EVERY = timedelta(days=2)  # a player with no card this season is asked for again, in case one was minted
BATCH = 20  # players in one aliased question
ASSETS = "https://assets.sorare.com/"
SLUG = re.compile(r"[a-z0-9][a-z0-9-]*")

ROSTER = """
query($s:String!,$a:String){ football { club(slug:$s){ activePlayers(first: 40, after: $a) {
  pageInfo { hasNextPage endCursor }
  nodes { slug displayName position birthDay activeClub { slug name shortName } }
} } } }
"""


@dataclass
class Art:
    """What the Lineups page needs: the roster as `Wanted` (only players with a picture), and each one's picture address."""

    wanted: list[ff_link.Wanted] = field(default_factory=list)
    urls: dict[str, str] = field(default_factory=dict)


def season_of(now: datetime) -> int:
    """The year the season started: 2026 is 2026/27, and a new one opens in July."""
    return now.year if now.month >= 7 else now.year - 1


def art_query(slugs: Sequence[str], season: int) -> str:
    """One question for the first Limited card of the season of each player (an alias each); a slug is checked, never trusted."""
    for slug in slugs:
        if not SLUG.fullmatch(slug):
            raise ValueError(f"not a player slug: {slug!r}")
    parts = [
        f'p{i}: allCards(playerSlugs: ["{slug}"], rarities: [limited], seasonStartYears: [{int(season)}], first: 1) {{ nodes {{ pictureUrl }} }}'
        for i, slug in enumerate(slugs)
    ]
    return "query { football { " + " ".join(parts) + " } }"


def read_art(data: Mapping[str, Any], slugs: Sequence[str]) -> dict[str, str | None]:
    """The answer to `art_query` by player; None for a player Sorare has no card of, or a picture that is not Sorare's own."""
    out: dict[str, str | None] = {}
    for i, slug in enumerate(slugs):
        nodes = ((data.get(f"p{i}") or {}).get("nodes")) or []
        url = nodes[0].get("pictureUrl") if nodes and isinstance(nodes[0], dict) else None
        out[slug] = url if isinstance(url, str) and url.startswith(ASSETS) else None
    return out


def wanted_of(slug: str, display: str, born: str | None, position: str | None, clubs: Iterable[str]) -> ff_link.Wanted:
    """A roster entry as the linking needs him."""
    names = tuple(name for name in clubs if name)
    found = ff_link.wanted({"player": {"slug": slug, "displayName": display, "position": position, "birthDay": born}})
    assert found is not None
    return replace(found, clubs=names)


# -------------------------------------------------------------------------------------------------------- the kept model
def _load(db: Session) -> dict[str, Any]:
    row = db.get(ReadModel, ART_KEY)
    data = row.payload if row and isinstance(row.payload, dict) else {}
    players = data.get("players")
    return {"season": data.get("season"), "rosterAt": data.get("rosterAt"), "players": dict(players) if isinstance(players, dict) else {}}


def _at(value: Any) -> datetime | None:
    try:
        return datetime.fromisoformat(value) if value else None
    except (TypeError, ValueError):
        return None


def _roster(client: SorareClient, competition: str) -> dict[str, dict[str, Any]]:
    """Every active player of every club of the competition: name, birthday, place and the names of his club."""
    out: dict[str, dict[str, Any]] = {}
    for club in client.query(CLUBS, {"s": competition})["football"]["competition"]["clubs"]["nodes"]:
        slug = club.get("slug")
        if not slug:
            continue
        after: str | None = None
        try:
            for _ in range(4):
                page = client.query(ROSTER, {"s": slug, "a": after})["football"]["club"]["activePlayers"]
                for item in page.get("nodes") or []:
                    player_slug = item.get("slug")
                    if not player_slug or not SLUG.fullmatch(player_slug):
                        continue
                    active = item.get("activeClub") or {}
                    out[player_slug] = {
                        "name": item.get("displayName") or player_slug,
                        "born": item.get("birthDay"),
                        "pos": item.get("position"),
                        "clubs": [name for name in (active.get("shortName"), active.get("name")) if name],
                    }
                info = page.get("pageInfo") or {}
                after = info.get("endCursor")
                if not info.get("hasNextPage") or not after:
                    break
        except (SorareError, KeyError, TypeError) as error:  # one club that fails is skipped, not the run
            logger.warning("card art: squad of %s unavailable: %s", slug, error)
    return out


def _due(entry: Mapping[str, Any], now: datetime) -> bool:
    asked = _at(entry.get("at"))
    if asked is None:
        return True
    return now - asked >= (ART_EVERY if entry.get("url") else NONE_EVERY)


def refresh(db: Session, client: SorareClient, now: datetime, competition: str = COMPETITION, *, write: bool = True) -> Art:
    """The roster and each player's card picture, brought up to date as far as Sorare answers, and kept (unless `write` is off)."""
    model = _load(db)
    db.rollback()  # Sorare is asked for over a minute: Neon closes a connection left inside a transaction
    season = season_of(now)
    players: dict[str, dict[str, Any]] = model["players"]
    changed = False
    if model["season"] != season:  # the old pictures are of last season's cards
        players = {slug: {**entry, "url": None, "at": None} for slug, entry in players.items()}
        changed = True
    rostered = _at(model["rosterAt"])
    if rostered is None or now - rostered >= ROSTER_EVERY or model["season"] != season:
        try:
            fresh = _roster(client, competition)
        except (SorareError, KeyError, TypeError) as error:
            logger.warning("card art: roster unavailable, keeping the last one: %s", error)
            fresh = {}
        if fresh:
            players = {slug: {**players.get(slug, {"url": None, "at": None}), **entry} for slug, entry in fresh.items()}
            model["rosterAt"] = now.isoformat()
            changed = True
    due = [slug for slug, entry in players.items() if _due(entry, now)]
    for start in range(0, len(due), BATCH):
        batch = due[start : start + BATCH]
        try:
            found = read_art(client.query(art_query(batch, season)).get("football") or {}, batch)
        except (SorareError, KeyError, TypeError, ValueError) as error:  # asked again next run
            logger.warning("card art: %d players not answered: %s", len(batch), error)
            continue
        for slug, url in found.items():
            players[slug] = {**players[slug], "url": url, "at": now.isoformat()}
        changed = True
    if changed and players and write:
        put(db, ART_KEY, {"season": season, "rosterAt": model["rosterAt"], "players": players}, now)
    return _art(players)


def load(db: Session) -> Art:
    """What was kept, without asking Sorare anything."""
    return _art(_load(db)["players"])


def _art(players: Mapping[str, Mapping[str, Any]]) -> Art:
    urls = {slug: entry["url"] for slug, entry in players.items() if entry.get("url")}
    wanted = [
        wanted_of(slug, str(entry.get("name") or slug), entry.get("born"), entry.get("pos"), entry.get("clubs") or [])
        for slug, entry in players.items()
        if slug in urls
    ]
    return Art(wanted=wanted, urls=urls)
