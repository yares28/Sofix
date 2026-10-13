"""The Lineups page's data: Futbol Fantasy's matches as the page draws them (plans/futbolfantasy.md, S5).

`payload` turns what `ff_feed` holds into one read model (`lineups`) the web app shows as it is: for each match both
sides with their coach and gauges, the eleven placed in rows on a pitch, the alternatives, the injury list, and which of
the people are the owner's (with his card, so the page draws it). The rows and the formation come from the pitch
coordinates the site draws the eleven at: its rows of players sit at a few fixed heights, so the players are grouped by
height and read from the goal up (defenders first, then midfield rows, the forwards at the top), never by a guess about
a player's real position.

The match page does not say where an alternative plays. So that the page can put each one under the line he covers, each
club's squad page (which lists every player with his position) is read once a week, the line every player was last drawn in
(in any eleven read) is added, and the owner's own Sorare positions count last; all of it is kept in `ff_positions`. A man
none of these knows has no place, and the page lists him apart.
"""

from __future__ import annotations

import json
from collections.abc import Callable, Iterable, Mapping, Sequence
from dataclasses import dataclass, field
from datetime import date, datetime, timedelta
from typing import Any

from sqlalchemy import text
from sqlalchemy.orm import Session

from app.models import ReadModel
from app.services.publish import put
from app.sorare import ff_link, ff_use
from app.sorare.card_art import Art
from app.sorare.ff_feed import Feed, Stored
from app.sorare.model import POSITIONS, Card
from app.sources import futbolfantasy_matches as ffm

LINEUPS_KEY = "lineups"
POSITIONS_KEY = "ff_positions"
VERSION = 1
ROW_GAP = 8.0  # the site draws its rows at fixed heights (0 to 100): a row spreads up to 7 from its first player, the next is 9+ away
SQUADS_EVERY = timedelta(days=7)  # a squad page is read again after this: who plays where hardly changes
SquadReader = Callable[..., ffm.SquadReading]
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
@dataclass(frozen=True)
class Memory:
    """Where each player plays (`{ff id: line}`) and when each club's squad page was last read (`{club number: time}`)."""

    positions: dict[str, str] = field(default_factory=dict)
    squads: dict[str, datetime] = field(default_factory=dict)


def load_memory(db: Session) -> Memory:
    row = db.get(ReadModel, POSITIONS_KEY)
    payload = row.payload if row and isinstance(row.payload, dict) else {}
    found = payload.get("positions")
    positions = {str(key): line for key, line in found.items() if line in POSITIONS} if isinstance(found, dict) else {}
    squads: dict[str, datetime] = {}
    for club, raw in (payload.get("squads") or {}).items() if isinstance(payload.get("squads"), dict) else []:
        try:
            squads[str(club)] = datetime.fromisoformat(raw)
        except (TypeError, ValueError):
            continue
    return Memory(positions, squads)


def save_memory(db: Session, memory: Memory, now: datetime) -> bool:
    """Write the memory down when it changed; whether it did."""
    if memory == load_memory(db):
        return False
    put(
        db,
        POSITIONS_KEY,
        {"positions": memory.positions, "squads": {club: at.isoformat() for club, at in memory.squads.items()}},
        now,
    )
    return True


def due_squads(feed: Feed, memory: Memory, now: datetime) -> dict[str, str]:
    """The clubs of the matches held (LaLiga's, which the registry keeps) whose squad page has not been read in a week."""
    due: dict[str, str] = {}
    for item in feed.matches.values():
        for side in (item.match.home, item.match.away):
            if not side.club_id or not side.slug or ff_link.club_of(side.club_id, side.name) is None:
                continue
            read = memory.squads.get(side.club_id)
            if read is None or now - read >= SQUADS_EVERY:
                due[side.club_id] = side.slug
    return due


def read_squads(
    memory: Memory, feed: Feed, now: datetime, *, reader: SquadReader | None = None
) -> tuple[Memory, ffm.SquadReading | None]:
    """The squad pages of the clubs that are due, and the memory with what they say: everyone's place, from the site itself."""
    due = due_squads(feed, memory, now)
    if not due:
        return memory, None
    reading = (reader or ffm.read_squads)(due, now=now)
    positions = dict(memory.positions)
    squads = dict(memory.squads)
    for club, squad in reading.squads.items():
        squads[club] = now
        for member in squad.members:
            if not member.on_loan:
                positions[member.ff_id] = member.line
    return Memory(positions, squads), reading


def remember(known: Mapping[str, str], feed: Feed, lineups: ff_use.Lineups | None) -> dict[str, str]:
    """The positions brought up to date: the line of everyone in an eleven now read, then the owner's Sorare positions."""
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
    bench: Mapping[str, str] | None = None,
) -> dict[str, Any]:
    out: dict[str, Any] = {"id": player.ff_id, "name": player.name, "p": player.chance}
    if eleven:
        out["x"], out["y"] = player.x, player.y
        if player.goalkeeper:
            out["gk"] = True
        # who the page puts under him as able to come in for him, by the ids of the bench (one player can be under several slots)
        coming = [bench[slug] for slug in player.next if bench and slug in bench]
        if coming:
            out["next"] = coming
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
    art: Art | None = None,
    found_art: dict[str, str] | None = None,
    today: date | None = None,
) -> dict[str, Any]:
    persons = ff_link.people(side)
    by_id = {p.ff_id: p for p in persons if p.ff_id}
    mine = {link.person.key: slug for slug, link in lineups.links.links.items()} if lineups else {}

    def yours(player: ffm.Player) -> str | None:
        found = mine.get(player.ff_id)
        if found:
            cards[found] = None
        return found

    if art is not None and found_art is not None and art.wanted:
        # a real Sorare card for each person of the page the roster names, whoever owns it
        for slug, link in ff_link.link_side(side, art.wanted, today or date.today()).links.items():
            if link.person.ff_id and slug in art.urls:
                found_art[link.person.ff_id] = art.urls[slug]
                found_art[f"so:{slug}"] = art.urls[slug]
    rows, formation = pitch(side.xi)
    bench = {p.slug: p.ff_id for p in side.alternatives if p.slug}
    drawn = [
        {
            "line": line,
            "players": [_player(p, by_id.get(p.ff_id), yours(p), line, eleven=True, bench=bench) for p in group],
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


SorareLinks = Mapping[
    int, Mapping[str, Any]
]  # match id -> {"id": Sorare's game, "players": {Sorare slug: his id on the site}}


def _entries(
    shown: Sequence[Stored],
    lineups: ff_use.Lineups | None,
    cards: Sequence[Card],
    positions: Mapping[str, str],
    now: datetime,
    art: Art | None,
    sorare: SorareLinks | None,
) -> tuple[list[dict[str, Any]], dict[str, str], dict[str, Any]]:
    """These matches as the page draws them, the card pictures they use and the owner's cards in them."""
    used: dict[str, None] = {}
    found_art: dict[str, str] = {}
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
            "home": _side(match.home, item, lineups, positions, used, art, found_art, now.date()),
            "away": _side(match.away, item, lineups, positions, used, art, found_art, now.date()),
        }
        if match.round_no is None and match.round_label:
            entry["phase"] = match.round_label
        if sorare and match.match_id in sorare:
            entry["sorare"] = sorare[match.match_id]
        matches.append(entry)
    owned = _best_cards(cards)
    mine = {
        slug: {
            "name": owned[slug].name,
            "rarity": owned[slug].rarity,
            "pic": owned[slug].picture,
            "pos": owned[slug].positions[0],
            "club": owned[slug].club_name,
        }
        for slug in used
        if slug in owned
    }
    return matches, found_art, mine


DAY_PREFIX = (
    "lineups_day:"  # one row per day of kickoffs: what the page shows of a week once the site has dropped its matches
)


def kept_days(
    feed: Feed,
    lineups: ff_use.Lineups | None,
    cards: Sequence[Card],
    positions: Mapping[str, str],
    now: datetime,
    art: Art | None = None,
    sorare: SorareLinks | None = None,
) -> dict[str, dict[str, Any]]:
    """Every match held, by the day of its kickoff (UTC), so a week can be shown after the site has moved on (the owner, 13 Oct
    2026: "They should be saved"). `matches` are the ones the page still shows, written over what is kept; `old` are played
    ones the store still holds, written only where nothing is kept (they fill in a week from before this existed)."""
    days: dict[str, list[Stored]] = {}
    for item in feed.matches.values():
        if item.match.kickoff is not None:
            days.setdefault(item.match.kickoff.date().isoformat(), []).append(item)
    out: dict[str, dict[str, Any]] = {}
    for day, items in days.items():
        entries, found_art, mine = _entries(items, lineups, cards, positions, now, art, sorare)
        fresh = {m.match.match_id for m in items if m.match.kickoff is not None and m.match.kickoff > now - STAYS}
        out[day] = {
            "version": VERSION,
            "matches": {str(e["id"]): e for e in entries if e["id"] in fresh},
            "old": {str(e["id"]): e for e in entries if e["id"] not in fresh},
            "art": found_art,
            "cards": mine,
        }
    return out


_MERGE_DAY = text(
    """
    INSERT INTO read_models (key, payload, updated_at) VALUES (:key, CAST(:payload AS json), :now)
    ON CONFLICT (key) DO UPDATE SET updated_at = EXCLUDED.updated_at, payload = jsonb_build_object(
      'version', EXCLUDED.payload::jsonb -> 'version',
      'matches', (EXCLUDED.payload::jsonb -> 'old') || COALESCE(read_models.payload::jsonb -> 'matches', '{}'::jsonb)
                 || (EXCLUDED.payload::jsonb -> 'matches'),
      'art', COALESCE(read_models.payload::jsonb -> 'art', '{}'::jsonb) || (EXCLUDED.payload::jsonb -> 'art'),
      'cards', COALESCE(read_models.payload::jsonb -> 'cards', '{}'::jsonb) || (EXCLUDED.payload::jsonb -> 'cards')
    )::json
    """
)


def merged_day(kept: Mapping[str, Any], fresh: Mapping[str, Any]) -> dict[str, Any]:
    """What `_MERGE_DAY` does inside Postgres: a kept match is replaced by a fresh one, and never by an old one."""
    return {
        "version": fresh["version"],
        "matches": {**fresh["old"], **(kept.get("matches") or {}), **fresh["matches"]},
        "art": {**(kept.get("art") or {}), **fresh["art"]},
        "cards": {**(kept.get("cards") or {}), **fresh["cards"]},
    }


def save_days(db: Session, days: Mapping[str, Mapping[str, Any]], now: datetime) -> int:
    """Add each day's matches to what is kept. On Postgres the merge runs inside the database, so nothing kept is downloaded
    to be written back (Neon counts every byte it sends); elsewhere (the tests' SQLite) it is done here."""
    for day, fresh in days.items():
        key = f"{DAY_PREFIX}{day}"
        if db.get_bind().dialect.name == "postgresql":
            db.execute(_MERGE_DAY, {"key": key, "payload": json.dumps(fresh), "now": now})
            continue
        row = db.get(ReadModel, key)
        if row:
            row.payload, row.updated_at = merged_day(row.payload, fresh), now
        else:
            db.add(ReadModel(key=key, payload=merged_day({}, fresh), updated_at=now))
    db.commit()
    return len(days)


def payload(
    feed: Feed,
    lineups: ff_use.Lineups | None,
    cards: Sequence[Card],
    positions: Mapping[str, str],
    now: datetime,
    art: Art | None = None,
    sorare: SorareLinks | None = None,
) -> dict[str, Any]:
    """The `lineups` read model: every match held that is still to be played or was played a few hours ago, and with it the
    rest of its round: a round stays whole on the page until its last match is hours old (owner, 12 Oct 2026: "it should show
    all the games in the round"). A played match keeps the lineup read last before its kickoff.

    `art` is Sorare's card picture of each LaLiga player (`card_art`): the page draws a player the owner does not have as a real card.
    """
    current = [item for item in feed.matches.values() if item.match.kickoff is None or item.match.kickoff > now - STAYS]
    rounds = {(item.match.competition, item.match.round_no) for item in current if item.match.round_no is not None}
    shown = [
        item
        for item in feed.matches.values()
        if item in current
        or (item.match.round_no is not None and (item.match.competition, item.match.round_no) in rounds)
    ]
    shown.sort(key=lambda item: (item.match.kickoff is None, item.match.kickoff or now, item.match.match_id))
    matches, found_art, mine = _entries(shown, lineups, cards, positions, now, art, sorare)
    return {
        "version": VERSION,
        "generatedAt": now.isoformat(),
        "readAt": feed.read_at.isoformat() if feed.read_at else None,
        "failed": list(feed.failed),
        "stopped": feed.stopped,
        "matches": matches,
        "art": found_art,
        "cards": mine,
    }
