"""Absence spells from freshly read FF pages; a missing or failed page cannot heal a player."""

from collections.abc import Iterable
from datetime import datetime
from hashlib import blake2s

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import PlayerAbsence, ReadModel
from app.services.timeutil import as_utc
from app.sorare import ff_link
from app.sources.futbolfantasy_matches import Match


def _profile(slug: str) -> str:
    # Absence-only entries have a profile address, no shirt id. Keep that identity until the id is read.
    return "ff:" + blake2s(slug.encode(), digest_size=12).hexdigest()


def observe(db: Session, matches: Iterable[Match], at: datetime) -> None:
    kept = ff_link.load_kept(db)
    by_id = {str(v["ffId"]): slug for slug, v in kept.items() if v.get("ffId")}
    by_profile = {v["slug"]: (slug, v.get("ffId")) for slug, v in kept.items() if v.get("slug")}
    identity_row = db.get(ReadModel, "ff_absence_ids")
    identities = dict(identity_row.payload) if identity_row else {}
    previous = dict(identities)
    rows = list(db.scalars(select(PlayerAbsence).order_by(PlayerAbsence.id)))
    seen: dict[str, tuple[str | None, str | None, str | None]] = {}
    for match in matches:
        for side in (match.home, match.away):
            for person in ff_link.people(side):
                linked, linked_id = by_profile.get(person.slug, (None, None))
                identity = (
                    person.ff_id
                    or linked_id
                    or identities.get(person.slug)
                    or (_profile(person.slug) if person.slug else None)
                )
                if not identity:
                    continue  # a bare name cannot identify a person reliably
                slug = linked or by_id.get(identity)
                if person.slug:
                    identities[person.slug] = identity
                    for row in rows:
                        if row.ff_id == _profile(person.slug):
                            row.ff_id = identity
                for row in rows:
                    if row.ff_id == identity and slug:
                        row.player = slug
                absence = person.absence
                kind, cause = (absence.kind, absence.cause) if absence else (None, None)
                p = person.player
                if not absence and p and (p.suspended or p.lesion in (0, 1)):
                    kind = "suspended" if p.suspended else "out" if p.lesion == 0 else "doubt"
                if kind == "available":
                    kind = None
                # Conflicting pages: an explicit absence wins over a healthy eleven in another competition.
                if identity not in seen or kind:
                    seen[identity] = (kind, cause, slug)
    for identity, (kind, cause, slug) in seen.items():
        latest = max((as_utc(row.back or row.last_seen) for row in rows if row.ff_id == identity), default=None)
        if latest and at < latest:
            continue
        active = next((row for row in reversed(rows) if row.ff_id == identity and row.back is None), None)
        if active and kind in {"out", "doubt", "suspended"}:
            active.kind = kind
            active.last_seen = at
            active.cause = cause or active.cause
            continue
        if active:
            active.back = at
        if kind in {"out", "doubt", "suspended"}:
            row = PlayerAbsence(ff_id=identity, player=slug, kind=kind, cause=cause, first_seen=at, last_seen=at)
            db.add(row)
            rows.append(row)
    if identities != previous:
        if identity_row:
            identity_row.payload, identity_row.updated_at = identities, at
        else:
            db.add(ReadModel(key="ff_absence_ids", payload=identities, updated_at=at))
    db.flush()
