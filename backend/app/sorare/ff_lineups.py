"""The Lineups page's data: Futbol Fantasy's matches as the page draws them (plans/futbolfantasy.md, S5).

`payload` turns what `ff_feed` holds into one read model (`lineups`) the web app shows as it is: for each match both
sides with their coach and gauges, the eleven placed in rows on a pitch, the alternatives, the injury list, and which of
the people are the owner's (with his card, so the page draws it). The rows and the formation come from the pitch
coordinates the site draws the eleven at: its rows of players sit at a few fixed heights, so the players are grouped by
height and read from the goal up (defenders first, then midfield rows, the forwards at the top), never by a guess about
a player's real position.

The site does not say where an alternative plays. So that the page can put each one under the line he covers, the
line every player was last drawn in (in any eleven read) is kept in `ff_positions`, and the owner's own Sorare
positions count before it. A man who has never been in an eleven read has no place, and the page lists him apart.
"""

from __future__ import annotations

from collections.abc import Iterable, Mapping, Sequence
from datetime import datetime, timedelta
from typing import Any

from sqlalchemy.orm import Session

from app.models import ReadModel
from app.services.publish import put
from app.sorare import ff_link, ff_use
from app.sorare.ff_feed import Feed, Stored
from app.sorare.model import POSITIONS, Card
from app.sources import futbolfantasy_matches as ffm

LINEUPS_KEY = "lineups"
POSITIONS_KEY = "ff_positions"
VERSION = 1
ROW_GAP = 8.0  # the site draws its rows at fixed heights (0 to 100): a row spreads up to 7 from its first player, the next is 9+ away
STAYS = timedelta(hours=12)  # a match stays on the page this long after its kickoff
CRESTS = "https://static.futbolfantasy.com/uploads/images/equipos/escudom/"
RARITIES = ("common", "limited", "rare", "super_rare", "unique")


# ----------------------------------------------------------------------------------------------------- the pitch
def pitch(xi: Iterable[ffm.Player]) -> tuple[list[tuple[str, list[ffm.Player]]], str]:
    """The eleven as rows, attack at the top and the keeper last, and the formation read from the goal up ("4-2-3-1")."""
    eleven = list(xi)
    keepers = sorted((p for p in eleven if p.goalkeeper), key=lambda p: p.x if p.x is not None else 50.0)
    field = sorted(
        (p for p in eleven if not p.goalkeeper),
        key=lambda p: (p.y if p.y is not None else 50.0, p.x if p.x is not None else 50.0),
    )
    bands: list[list[ffm.Player]] = []
    for player in field:
        height = player.y if player.y is not None else 50.0
        first = bands[-1][0] if bands else None
        if first is not None and height - (first.y if first.y is not None else 50.0) <= ROW_GAP:
            bands[-1].append(player)
        else:
            bands.append([player])
    rows: list[tuple[str, list[ffm.Player]]] = []
    for index, band in enumerate(bands):
        line = "MID" if len(bands) == 1 else "FWD" if index == 0 else "DEF" if index == len(bands) - 1 else "MID"
        rows.append((line, sorted(band, key=lambda p: p.x if p.x is not None else 50.0)))
    formation = "-".join(str(len(band)) for _, band in reversed(rows))
    if keepers:
        rows.append(("GK", keepers))
    return rows, formation


# ---------------------------------------------------------------------------------------------- where people play
def load_positions(db: Session) -> dict[str, str]:
    """The line each Futbol Fantasy player was last seen in: `{ff id: "GK" | "DEF" | "MID" | "FWD"}`."""
    row = db.get(ReadModel, POSITIONS_KEY)
    found = row.payload.get("positions") if row and isinstance(row.payload, dict) else None
    if not isinstance(found, dict):
        return {}
    return {str(key): line for key, line in found.items() if line in POSITIONS}


def save_positions(db: Session, positions: Mapping[str, str], now: datetime) -> bool:
    """Write the memory down when it changed; whether it did."""
    if dict(positions) == load_positions(db):
        return False
    put(db, POSITIONS_KEY, {"positions": dict(positions)}, now)
    return True


def remember(known: Mapping[str, str], feed: Feed, lineups: ff_use.Lineups | None) -> dict[str, str]:
    """The memory brought up to date: the line of everyone in an eleven now read, then the owner's Sorare positions."""
    found = dict(known)
    for item in feed.matches.values():
        for side in (item.match.home, item.match.away):
            for line, group in pitch(side.xi)[0]:
                for player in group:
                    found[player.ff_id] = line
    if lineups is not None:
        for slug, link in lineups.links.links.items():
            card = lineups.wanted.get(slug)
            if card and card.position in POSITIONS and link.person.ff_id:
                found[link.person.ff_id] = card.position
    return found


# ------------------------------------------------------------------------------------------------ the payload
def _level(level: ffm.Level | None) -> dict[str, Any] | None:
    return {"value": level.value, "label": level.label} if level else None


def _player(
    player: ffm.Player,
    person: ff_link.Person | None,
    yours: str | None,
    line: str | None,
    *,
    eleven: bool,
) -> dict[str, Any]:
    out: dict[str, Any] = {"id": player.ff_id, "name": player.name, "p": player.chance}
    if eleven:
        out["x"], out["y"] = player.x, player.y
        if player.goalkeeper:
            out["gk"] = True
    elif line:
        out["pos"] = line
    if player.age:
        out["age"] = player.age
    said = ff_use.status(person) if person else None
    if said:
        out["status"] = said
    if yours:
        out["yours"] = yours
    return out


def _side(
    side: ffm.Side,
    item: Stored,
    lineups: ff_use.Lineups | None,
    positions: Mapping[str, str],
    cards: dict[str, None],
) -> dict[str, Any]:
    persons = ff_link.people(side)
    by_id = {p.ff_id: p for p in persons if p.ff_id}
    mine = {link.person.key: slug for slug, link in lineups.links.links.items()} if lineups else {}

    def yours(player: ffm.Player) -> str | None:
        found = mine.get(player.ff_id)
        if found:
            cards[found] = None
        return found

    rows, formation = pitch(side.xi)
    drawn = [
        {
            "line": line,
            "players": [_player(p, by_id.get(p.ff_id), yours(p), line, eleven=True) for p in group],
        }
        for line, group in rows
    ]
    alternatives = [
        _player(p, by_id.get(p.ff_id), yours(p), positions.get(p.ff_id), eleven=False) for p in side.alternatives
    ]
    by_absence = {id(p.absence): p for p in persons if p.absence is not None}
    absent: list[dict[str, Any]] = []
    for away in side.absences:  # in the page's own order
        entry: dict[str, Any] = {"name": away.name, "kind": away.kind}
        for key, value in (("cause", away.cause), ("since", away.since), ("note", away.note)):
            if value:
                entry[key] = value
        person = by_absence.get(id(away))
        found = mine.get(person.key) if person else None
        if found:
            entry["yours"] = found
            cards[found] = None
        absent.append(entry)
    unlinked: list[dict[str, str]] = []
    if lineups is not None:
        for slug, miss in lineups.links.misses.items():
            card = lineups.wanted.get(slug)
            if card and ff_link.club_matches(card.clubs, side.club_id, side.name):
                unlinked.append({"slug": slug, "name": card.display, "why": miss.reason})
                cards[slug] = None
    club = ff_link.club_of(side.club_id, side.name)
    changed = item.changed.get(side.club_id or "")
    return {
        "name": side.name,
        "club": club.code if club else None,
        "ffId": side.club_id,
        "crest": f"{CRESTS}{side.club_id}.png" if side.club_id else None,
        "coach": side.coach,
        "rotations": _level(side.rotations),
        "predictability": _level(side.predictability),
        "season": side.season_predictability,
        "changedAt": changed.isoformat() if changed else None,
        "published": bool(side.xi),
        "squad": side.squad_published,
        "formation": formation,
        "rows": drawn,
        "alternatives": alternatives,
        "absent": absent,
        "unlinked": sorted(unlinked, key=lambda entry: entry["name"]),
    }


def _best_cards(cards: Sequence[Card]) -> dict[str, Card]:
    """The owner's card of each player that is drawn: the rarest he has."""
    best: dict[str, Card] = {}
    for card in cards:
        held = best.get(card.player)
        if held is None or RARITIES.index(card.rarity) > RARITIES.index(held.rarity):
            best[card.player] = card
    return best


def payload(
    feed: Feed,
    lineups: ff_use.Lineups | None,
    cards: Sequence[Card],
    positions: Mapping[str, str],
    now: datetime,
) -> dict[str, Any]:
    """The `lineups` read model: every match held that is still to be played or was played a few hours ago."""
    shown = [item for item in feed.matches.values() if item.match.kickoff is None or item.match.kickoff > now - STAYS]
    shown.sort(key=lambda item: (item.match.kickoff is None, item.match.kickoff or now, item.match.match_id))
    used: dict[str, None] = {}
    matches = []
    for item in shown:
        match = item.match
        entry: dict[str, Any] = {
            "id": match.match_id,
            "url": match.url,
            "competition": match.competition,
            "competitionName": match.competition_name,
            "round": match.round_no,
            "kickoff": match.kickoff.isoformat() if match.kickoff else None,
            "score": list(match.score) if match.score else None,
            "readAt": item.read_at.isoformat(),
            "home": _side(match.home, item, lineups, positions, used),
            "away": _side(match.away, item, lineups, positions, used),
        }
        if match.round_no is None and match.round_label:
            entry["phase"] = match.round_label
        matches.append(entry)
    owned = _best_cards(cards)
    return {
        "version": VERSION,
        "generatedAt": now.isoformat(),
        "readAt": feed.read_at.isoformat() if feed.read_at else None,
        "failed": list(feed.failed),
        "stopped": feed.stopped,
        "matches": matches,
        "cards": {
            slug: {
                "name": owned[slug].name,
                "rarity": owned[slug].rarity,
                "pic": owned[slug].picture,
                "pos": owned[slug].positions[0],
                "club": owned[slug].club_name,
            }
            for slug in used
            if slug in owned
        },
    }
