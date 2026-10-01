"""The Home page's team news: how the owner's players look for the gameweek (plans/futbolfantasy.md, S5).

Built from the planned gameweek's payload, which already says, game by game, each player's chance of starting and whose number
it is, so nothing is worked out twice: the players are split by how likely they are to start, the starters of the first
plan who might not are named, and what moved since yesterday is found against a reading kept from a day or so ago.

Only Futbol Fantasy's number is team news: a player it says nothing about (another league, a game it has not published) is
only counted. The readings to compare with are kept in one read model (`ff_chances`), one every six hours for two days.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Any

from sqlalchemy.orm import Session

from app.models import ReadModel
from app.services.publish import put

KEY = "ff_chances"
FF = "futbolfantasy"
LIKELY = 0.7  # from here a player is likely to start; the plan's starters under it are named
DOUBTFUL = 0.4
MOVE = 10  # percentage points a player must have moved to be listed
AT_RISK_SHOWN = 8
MOVED_SHOWN = 6
SPACING = timedelta(hours=6)  # between two kept readings
KEEP = timedelta(hours=48)
SINCE = timedelta(hours=16)  # a reading must be this old to be "yesterday's"
_NOT_PLAYING = ("out", "suspended")


@dataclass(frozen=True)
class Reading:
    """Each player's chance as it stood at `at`: `{player slug: {"g": the game's id, "p": percent}}`."""

    at: datetime
    chances: dict[str, dict[str, Any]]


# -------------------------------------------------------------------------------------------------- reading the week
def _told(player: dict[str, Any]) -> dict[str, Any] | None:
    """His first game the site has a number for."""
    return next(
        (g for g in player.get("games") or [] if g.get("startSource") == FF and g.get("pStart") is not None), None
    )


def _kind(game: dict[str, Any]) -> str | None:
    return (game.get("ffStatus") or {}).get("kind")


def _percent(game: dict[str, Any]) -> int:
    return 0 if _kind(game) in _NOT_PLAYING else round(float(game["pStart"]) * 100)


def _band(game: dict[str, Any]) -> str:
    if _kind(game) in _NOT_PLAYING:
        return "out"
    p = float(game["pStart"])
    return "likely" if p >= LIKELY else "doubtful" if p >= DOUBTFUL else "unlikely"


def _game(game: dict[str, Any]) -> dict[str, Any]:
    return {key: game.get(key) for key in ("id", "kickoff", "team", "opponent", "venue")}


def _who(player: dict[str, Any]) -> dict[str, Any]:
    return {key: player.get(key) for key in ("player", "name", "pos", "rarity", "pic")}


def chances(week: dict[str, Any]) -> dict[str, dict[str, Any]]:
    """What the site says of each player now, as the next comparison will start from it."""
    out: dict[str, dict[str, Any]] = {}
    for player in week.get("playing", {}).get("players", []):
        game = _told(player)
        if game is not None:
            out[player["player"]] = {"g": game["id"], "p": _percent(game)}
    return out


# ------------------------------------------------------------------------------------------------ the readings kept
def baseline(readings: list[Reading], now: datetime) -> Reading | None:
    """The newest reading that is a day or so old (at least `SINCE`), to say what moved since."""
    old = [r for r in readings if now - r.at >= SINCE]
    return max(old, key=lambda r: r.at) if old else None


def record(readings: list[Reading], current: dict[str, dict[str, Any]], now: datetime) -> list[Reading]:
    """The readings kept, with now's added when the last is `SPACING` old, and any older than `KEEP` dropped."""
    kept = [r for r in readings if now - r.at <= KEEP]
    if current and (not kept or now - max(r.at for r in kept) >= SPACING):
        kept.append(Reading(now, current))
    return kept


def load(db: Session) -> list[Reading]:
    row = db.get(ReadModel, KEY)
    items = row.payload.get("readings") if row and isinstance(row.payload, dict) else None
    out: list[Reading] = []
    for item in items if isinstance(items, list) else []:
        try:
            at = datetime.fromisoformat(item["at"])
            found = item["chances"]
        except (KeyError, TypeError, ValueError):
            continue
        if isinstance(found, dict):
            out.append(Reading(at, found))
    return sorted(out, key=lambda r: r.at)


def save(db: Session, readings: list[Reading], now: datetime) -> bool:
    """Write the readings down when they changed; whether they did."""
    if readings == load(db):
        return False
    put(db, KEY, {"readings": [{"at": r.at.isoformat(), "chances": r.chances} for r in readings]}, now)
    return True


# ------------------------------------------------------------------------------------------------------ the news
def _at_risk(week: dict[str, Any], by_player: dict[str, dict[str, Any]]) -> dict[str, Any]:
    """The first plan's starters the site has under `LIKELY`, once each, with the first lineup that plays them."""
    plans = week.get("plans") or []
    found: dict[str, dict[str, Any]] = {}
    for lineup in plans[0].get("lineups", []) if plans else []:
        for card in lineup.get("starters", []):
            slug = card.get("player")
            player = by_player.get(slug or "")
            game = _told(player) if player else None
            if player is None or game is None or slug in found or float(game["pStart"]) >= LIKELY:
                continue
            found[slug] = {
                **_who(player),
                "comp": lineup.get("comp"),
                "captain": bool(card.get("captain")),
                "game": _game(game),
                "p": float(game["pStart"]),
                "kind": _kind(game),
            }
    ordered = sorted(found.values(), key=lambda r: (r["p"], str(r["name"])))
    return {"total": len(ordered), "players": ordered[:AT_RISK_SHOWN]}


def _moved(by_player: dict[str, dict[str, Any]], then: Reading | None) -> dict[str, Any] | None:
    if then is None:
        return None
    found: list[dict[str, Any]] = []
    for slug, player in by_player.items():
        game = _told(player)
        before = then.chances.get(slug)
        if game is None or not before or before.get("g") != game["id"]:
            continue
        now_p = _percent(game)
        if abs(now_p - int(before["p"])) >= MOVE:
            found.append(
                {**_who(player), "from": int(before["p"]), "to": now_p, "kind": _kind(game), "game": _game(game)}
            )
    found.sort(key=lambda m: (-abs(m["to"] - m["from"]), str(m["name"])))
    return {"since": then.at.isoformat(), "total": len(found), "players": found[:MOVED_SHOWN]}


def team_news(week: dict[str, Any], now: datetime, readings: list[Reading] | None = None) -> dict[str, Any] | None:
    """The block the Home shows under Sorare, or None when the site told nothing about any player of the week."""
    players = week.get("playing", {}).get("players", [])
    by_player = {p["player"]: p for p in players}
    told = {slug: game for slug, p in by_player.items() if (game := _told(p)) is not None}
    if not told:
        return None
    split = {"likely": 0, "doubtful": 0, "unlikely": 0, "out": 0}
    for game in told.values():
        split[_band(game)] += 1
    read = (
        max(str(g["startAt"]) for g in told.values() if g.get("startAt"))
        if any(g.get("startAt") for g in told.values())
        else None
    )
    return {
        "readAt": datetime.fromisoformat(read).isoformat() if read else None,
        "players": len(told),
        "without": len(by_player) - len(told),
        "split": split,
        "atRisk": _at_risk(week, by_player),
        "moved": _moved(by_player, baseline(readings or [], now)),
    }
