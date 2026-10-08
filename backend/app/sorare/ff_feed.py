"""What Futbol Fantasy's match pages last said, kept between runs (plans/futbolfantasy.md, S1 and S3).

A run reads the match pages it needs (`futbolfantasy_matches.read_matches`) and this keeps each one with the time it was read,
in one read model (`futbolfantasy`), so that:

- a page that could not be read this time still has its last reading, used until it is a day old and never after;
- a match read a few minutes ago is not asked for again (two runs half an hour apart do not double the load on the site);
- each club's lineup carries the time it last *changed*, found by comparing one reading with the one before it, because
  the site gives no time for its lineups;
- the record of what each source said at the lock has the site's own reading time to point at.

Which matches: every LaLiga match of the round, and the matches of the European and cup competitions that have a club
the registry knows (Spanish) or a club one of the owner's players is at. A read that fails or runs out of time leaves the
rest as it was. The match feed is one read model; freshly read absence reports also extend permanent player_absences spells.
"""

from __future__ import annotations

import copy
from collections.abc import Callable, Iterable
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from typing import Any

from sqlalchemy.orm import Session

from app.models import ReadModel
from app.services.publish import put
from app.sorare import ff_link
from app.sources import futbolfantasy_matches as ffm

STORE_KEY = "futbolfantasy"
VERSION = 2  # the shape of the read model; the first one (a list of chances per team page) is not read any more
MAX_AGE = timedelta(hours=24)  # a reading older than this is not used
MIN_GAP = timedelta(
    minutes=25
)  # a match read this recently is not asked for again: near a lock the runs are 30 minutes apart
KEEP = timedelta(days=3)  # a match stays this long after its kickoff
COMPETITIONS = ("laliga", "champions", "europa-league", "copa-del-rey")

Reader = Callable[..., ffm.Reading]


@dataclass
class Stored:
    match: ffm.Match
    read_at: datetime
    changed: dict[str, datetime] = field(
        default_factory=dict
    )  # club id -> when its lineup last differed from the one before


@dataclass
class Feed:
    matches: dict[int, Stored] = field(default_factory=dict)
    read_at: datetime | None = None  # the last time the site was asked, whether or not it answered
    failed: list[str] = field(default_factory=list)
    stopped: str | None = None
    fresh: int = 0  # matches read the last time it was asked

    def usable(self, now: datetime) -> list[Stored]:
        """The matches whose reading is under a day old and whose kickoff is still ahead."""
        return [
            item
            for item in self.matches.values()
            if now - item.read_at <= MAX_AGE and item.match.kickoff is not None and item.match.kickoff > now
        ]


# ------------------------------------------------------------------------------------------------------ the store
def _dt(value: Any) -> datetime | None:
    try:
        return datetime.fromisoformat(value) if value else None
    except (TypeError, ValueError):
        return None


def load(db: Session) -> Feed:
    """What was kept; an empty feed for nothing, for the first shape, and for anything that does not read."""
    row = db.get(ReadModel, STORE_KEY)
    payload = row.payload if row and isinstance(row.payload, dict) else {}
    feed = Feed(
        read_at=_dt(payload.get("readAt")), failed=list(payload.get("failed") or []), stopped=payload.get("stopped")
    )
    feed.fresh = int(payload.get("fresh") or 0)
    if payload.get("version") != VERSION:
        return feed
    for key, item in (payload.get("matches") or {}).items():
        read_at = _dt(item.get("readAt")) if isinstance(item, dict) else None
        try:
            match = ffm.match_from_dict(item["match"])
        except (KeyError, TypeError, ValueError):
            continue
        if read_at is None:
            continue
        changed = {club: moment for club, raw in (item.get("changed") or {}).items() if (moment := _dt(raw))}
        feed.matches[int(key)] = Stored(match, read_at, changed)
    return feed


def save(db: Session, feed: Feed, now: datetime) -> None:
    put(
        db,
        STORE_KEY,
        {
            "version": VERSION,
            "readAt": feed.read_at.isoformat() if feed.read_at else None,
            "fresh": feed.fresh,
            "failed": feed.failed,
            "stopped": feed.stopped,
            "matches": {
                str(match_id): {
                    "readAt": item.read_at.isoformat(),
                    "changed": {club: moment.isoformat() for club, moment in item.changed.items()},
                    "match": ffm.to_dict(item.match),
                }
                for match_id, item in feed.matches.items()
            },
        },
        now,
    )


# ---------------------------------------------------------------------------------------------------- what to read
def club_names(cards: Iterable[dict[str, Any]]) -> list[tuple[str, ...]]:
    """The names Sorare gives each club the owner has a player at, one entry per club."""
    found: dict[tuple[str, ...], None] = {}
    for row in cards:
        club = (row.get("player") or {}).get("activeClub") or {}
        names = tuple(name for name in (club.get("shortName"), club.get("name")) if name)
        if names:
            found[names] = None
    return list(found)


def wanted(owned: list[tuple[str, ...]], feed: Feed, now: datetime) -> Callable[[str, ffm.RoundMatch], bool]:
    """Which matches of a round page to read: all of LaLiga, else those with a Spanish club or one of the owner's.

    A match read under `MIN_GAP` ago is left alone, so a second run straight after the first reads nothing.
    """

    def pick(competition: str, item: ffm.RoundMatch) -> bool:
        stored = feed.matches.get(item.match_id)
        if stored is not None and now - stored.read_at < MIN_GAP:
            return False
        if competition == "laliga":
            return True
        sides = ((item.home_id, item.home), (item.away_id, item.away))
        return any(
            ff_link.club_of(club_id, name) is not None
            or any(ff_link.club_matches(names, club_id, name) for names in owned)
            for club_id, name in sides
        )

    return pick


def _lineup(side: ffm.Side) -> tuple[tuple[str, float, bool], ...]:
    """A side's lineup as the change between two readings is judged: who is in the eleven and each player's chance."""
    eleven = {p.ff_id for p in side.xi}
    return tuple(
        sorted(
            (p.ff_id, -1.0 if p.chance is None else p.chance, p.ff_id in eleven) for p in (*side.xi, *side.alternatives)
        )
    )


def _changes(old: Stored | None, new: ffm.Match, now: datetime) -> dict[str, datetime]:
    """The times each club's lineup last changed: the ones already known, and now for any side that differs from its last."""
    changed = dict(old.changed) if old else {}
    if old is None:
        return changed
    for before, after in ((old.match.home, new.home), (old.match.away, new.away)):
        if after.club_id and _lineup(before) != _lineup(after):
            changed[after.club_id] = now
    return changed


# ------------------------------------------------------------------------------------------------------- the run
def refresh(
    db: Session,
    cards: Iterable[dict[str, Any]],
    now: datetime,
    *,
    reader: Reader | None = None,
    write: bool = True,
) -> Feed:
    """Ask the site for the matches worth asking about, keep what it says, and return everything now known.

    The connection is let go while the site is read, which takes a minute or more. A site that cannot be asked, or a page it
    cannot answer, leaves that match as it was (used for a day at most); nothing stands in for a page that was not read. A
    match whose page the site now answers 404 for is gone from it: it leaves the feed, and is not a failed read.
    """
    feed = load(db)
    owned = club_names(cards)
    db.rollback()
    reading = (reader or ffm.read_matches)(wanted(owned, feed, now), COMPETITIONS, now=now)
    feed = copy.copy(feed)
    feed.matches = dict(feed.matches)
    for match in reading.matches:
        feed.matches[match.match_id] = Stored(
            match, reading.at, _changes(feed.matches.get(match.match_id), match, reading.at)
        )
    feed.matches = {
        match_id: item
        for match_id, item in feed.matches.items()
        if match_id not in reading.gone and (item.match.kickoff is None or item.match.kickoff > now - KEEP)
    }
    feed.read_at = now
    feed.fresh = len(reading.matches)
    feed.failed = list(reading.failed)
    feed.stopped = reading.stopped
    if write:
        from app.sorare import player_absences

        player_absences.observe(db, reading.matches, reading.at)
        save(db, feed, now)
    return feed


def stamp(feed: Feed) -> dict[str, Any]:
    """A line for the run's summary: how many matches are held, how many were read now, and what went wrong."""
    out: dict[str, Any] = {"matches": len(feed.matches), "read": feed.fresh}
    if feed.failed:
        out["failed"] = feed.failed[:5]
    if feed.stopped:
        out["stopped"] = feed.stopped
    return out
