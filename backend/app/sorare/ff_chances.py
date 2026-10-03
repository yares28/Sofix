"""Futbol Fantasy's start chance for every player of every LaLiga match, kept at the lock and at the last reading before kick-off
(plans/xscore.md P9 X2b; roadmap 10.2b).

The start record (`starts.py`) keeps what Futbol Fantasy said of the owner's players only, and the Lineups page shows only its latest
reading. A new xScore built on every LaLiga player, and an Audit that scores it, need what the site said of all of them, and the site
gives it back to nobody afterwards: its chances, who is out and what the formation was are gone once the match is played. Nearly
everything else the model uses can be read again later (the games export keeps each game's scores, projection, grade and elevens; the
football model's forecast is recomputed from the history), so this is the one thing that has to be written down while it is still said.

Per match, two readings of the Lineups page's own data, each with every player's chance (the eleven and the alternatives), who is
absent and why, and the formation:

* `last`: the latest reading before the kick-off. Each run replaces it until the match starts, then it is frozen.
* `atLock`: the reading at the Sorare gameweek's lock, which is what a manager could see when he set his lineup. Each run replaces
  it until the lock, then it is frozen. The gameweek is the one the match's kick-off falls in, whether or not it is the one being
  planned yet, so the reading at the lock is kept from the first run that sees the match.

A match first seen after its kick-off is not made up. One read model (`ff_chances`), no table: a round is about 40 KB, a season about
1.5 MB. Players are Futbol Fantasy's own ids and names; matching them to Sorare's players is done afterwards, when it is scored.
"""

from __future__ import annotations

import copy
from datetime import datetime
from typing import Any

from sqlalchemy.orm import Session

from app.models import ReadModel
from app.services.publish import put

KEY = "ff_chances"
VERSION = 1


def _dt(value: str) -> datetime:
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


def _side(side: dict[str, Any]) -> dict[str, Any]:
    players: dict[str, dict[str, Any]] = {}
    for row in side.get("rows") or []:
        for player in row.get("players") or []:
            players[str(player["id"])] = {"n": player.get("name"), "p": player.get("p"), "xi": True}
    for player in side.get("alternatives") or []:
        players.setdefault(str(player["id"]), {"n": player.get("name"), "p": player.get("p"), "xi": False})
    return {
        "name": side.get("name"),
        "club": side.get("club"),
        "formation": side.get("formation"),
        "published": bool(side.get("published")),
        "squad": bool(side.get("squad")),
        "players": players,
        "absent": [[item.get("name"), item.get("kind")] for item in side.get("absent") or []],
    }


def compact(page: dict[str, Any]) -> dict[str, dict[str, Any]]:
    """The Lineups page's matches as they are kept, by Futbol Fantasy's match id: kick-off, round, and each side's chances and absences."""
    return {
        str(match["id"]): {
            "kickoff": match["kickoff"],
            "round": match.get("round"),
            "readAt": match.get("readAt"),
            "home": _side(match["home"]),
            "away": _side(match["away"]),
        }
        for match in page.get("matches") or []
    }


def _load(db: Session) -> dict[str, Any]:
    row = db.get(ReadModel, KEY)
    payload = copy.deepcopy(dict(row.payload)) if row and isinstance(row.payload, dict) else {}
    payload.setdefault("version", VERSION)
    payload.setdefault("matches", {})
    return payload


def _gameweek_of(weeks: list[dict[str, Any]] | None, kickoff: datetime) -> tuple[str, datetime] | None:
    """The Sorare gameweek a kick-off falls in, and its lock: [start, end), so a match on the day one ends belongs to the next."""
    for week in weeks or []:
        if _dt(week["start"]) <= kickoff < _dt(week["end"]):
            return week["slug"], _dt(week["lock"])
    return None


def save(db: Session, page: dict[str, Any], weeks: list[dict[str, Any]] | None, now: datetime) -> dict[str, int]:
    """Write down each match of the Lineups page that has not kicked off, and freeze the readings as their moments pass.

    `weeks` are Sorare's gameweeks (`slug`, `start`, `end`, `lock`), the planned one and the ones after it: a match that kicks off
    inside one has an `atLock` reading, replaced by each run until that gameweek's lock, so the reading at the lock is kept from the
    first run that sees the match, not only once its gameweek is the one being planned. Returns how many matches were written and how
    many were already frozen.
    """
    matches = compact(page)
    if not matches:
        return {"written": 0, "frozen": 0}
    payload = _load(db)
    written = frozen = 0
    for match_id, reading in matches.items():
        kickoff = _dt(reading["kickoff"])
        if now >= kickoff:
            frozen += 1
            continue
        entry = payload["matches"].setdefault(match_id, {})
        week = _gameweek_of(weeks, kickoff)
        entry.update({"kickoff": reading["kickoff"], "round": reading["round"], "gw": week[0] if week else None})
        stamped = {"at": now.isoformat(), **reading}
        stamped.pop("kickoff", None)
        stamped.pop("round", None)
        entry["last"] = stamped
        if week and now < week[1]:
            entry["atLock"] = copy.deepcopy(stamped)
        written += 1
    if written:
        put(db, KEY, payload, now)
    return {"written": written, "frozen": frozen}
