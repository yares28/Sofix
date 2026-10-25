"""Owned players' automatic post-game score reads, independent of browser sessions and GW settlement.

The owner chose existing kickoff times: +3h for the first read, +26h for the correction read.
Sorare has no final-whistle timestamp; a result is accepted only when its game is played.
State lives in one read model with one entry per game, without changing the permanent game's forecast columns.
"""

from __future__ import annotations

from copy import deepcopy
from datetime import datetime, timedelta
from typing import Any

from sqlalchemy import text
from sqlalchemy.orm import Session

from app.models import ReadModel
from app.services.publish import put
from app.services.timeutil import as_utc
from app.sorare import player_games, versus
from app.sorare.client import SorareClient, SorareError

KEY = "audit_game_checks"
FIRST = timedelta(hours=3)
RECHECK = timedelta(hours=26)
RETRY = timedelta(minutes=30)
WINDOW = timedelta(days=14)
BATCH = 1  # federation rejects repeated anyGame roots, even with aliases (also sync.PROJECTION_BATCH)
QUERY_VERSION = 3
QUERY = (
    '{alias}: anyGame(id: "{id}") {{ ... on Game {{ id date statusTyped '
    "playerGameScores {{ score scoreStatus anyPlayer {{ slug }} "
    "anyPlayerGameStats {{ playedInGame ... on PlayerGameStats {{ gameStarted minsPlayed }} }} }} }} }}"
)


def moment(value: Any) -> datetime | None:
    try:
        return as_utc(datetime.fromisoformat(str(value).replace("Z", "+00:00")))
    except ValueError:
        return None


def kept(db: Session) -> dict[str, Any]:
    row = db.get(ReadModel, KEY)
    return deepcopy(row.payload.get("games") or {}) if row else {}


_PAGE_SQL = text(
    "SELECT json_build_object("
    "'collection', (SELECT json_agg(json_build_object('player', c->'player', 'name', c->'name', 'pic', c->'pic')"
    " ORDER BY i) FROM json_array_elements(p->'collection') WITH ORDINALITY AS t(c, i)),"
    " 'weeks', (SELECT json_agg(json_build_object('gameweek', w->'gameweek', 'playing',"
    " json_build_object('players', w->'playing'->'players')) ORDER BY i)"
    " FROM json_array_elements(p->'weeks') WITH ORDINALITY AS t(w, i)))"
    " FROM (SELECT payload AS p FROM read_models WHERE key = 'sorare') AS s"
)


def _page(db: Session) -> dict[str, Any]:
    """The Sorare page's parts `catalog` reads: on Postgres only those (~0.4 of its 2 MB), elsewhere all of it."""
    if db.get_bind().dialect.name == "postgresql":
        found = db.execute(_PAGE_SQL).scalar()
        return found if isinstance(found, dict) else {}
    row = db.get(ReadModel, "sorare")
    return row.payload if row else {}


# Each score record with only the players `catalog` keeps (owned, or among the cards), in their order.
_RECORDS_SQL = text(
    "SELECT (SELECT json_object_agg(k, CASE WHEN k = 'players' AND json_typeof(v) = 'object' THEN"
    " (SELECT COALESCE(json_object_agg(pk, pv ORDER BY pi), '{}'::json) FROM json_each(v) WITH ORDINALITY AS q(pk, pv, pi)"
    " WHERE pv->>'owned' = 'true' OR pk = ANY(CAST(:cards AS text[]))) ELSE v END ORDER BY i)"
    " FROM json_each(r.payload) WITH ORDINALITY AS t(k, v, i))"
    " FROM read_models AS r WHERE r.key LIKE 'score_record:%' AND json_typeof(r.payload) = 'object'"
)


def _records(db: Session, cards: dict[str, Any]) -> list[dict[str, Any]]:
    """The score records as `catalog` uses them: on Postgres without the other players (~0.1 of their 0.8 MB)."""
    if db.get_bind().dialect.name == "postgresql":
        found = db.execute(_RECORDS_SQL, {"cards": list(cards)}).scalars()
        return [r for r in found if isinstance(r, dict)]
    return [r for _, r in versus.records(db)]


def catalog(db: Session) -> list[dict[str, Any]]:
    """Frozen records, with owner/card identity; a current unrecorded game has explicitly missing forecasts."""
    page = _page(db)
    cards = {c["player"]: c for c in reversed(page.get("collection") or []) if c.get("player")}
    records = {r["gameweek"]["slug"]: deepcopy(r) for r in _records(db, cards) if (r.get("gameweek") or {}).get("slug")}
    for week in page.get("weeks") or []:
        gw = week.get("gameweek") or {}
        if not gw.get("slug"):
            continue
        record = records.setdefault(gw["slug"], {"gameweek": gw, "players": {}})
        for player in (week.get("playing") or {}).get("players") or []:
            slug = player.get("player")
            if slug not in cards or slug in record["players"]:
                continue
            record["players"][slug] = {
                **player,
                "owned": True,
                "games": [
                    {
                        "id": game.get("id"),
                        "kickoff": game.get("kickoff"),
                        "competition": game.get("competition"),
                        "home": game.get("team") if game.get("venue") == "H" else game.get("opponent"),
                        "away": game.get("opponent") if game.get("venue") == "H" else game.get("team"),
                    }
                    for game in player.get("games") or []
                ],
            }
    out = []
    for record in records.values():
        owned = {}
        for slug, entry in record.get("players", {}).items():
            if not entry.get("owned") and slug not in cards:
                continue
            card = cards.get(slug) or {}
            owned[slug] = {
                **entry,
                "name": entry.get("name") or card.get("name") or slug,
                "pic": entry.get("pic") or card.get("pic") or "",
            }
        if owned:
            out.append({**record, "players": owned})
    return sorted(out, key=lambda r: r["gameweek"].get("lock") or "", reverse=True)


# When the next game falls due, and the write times of what decided it: an idle half-hourly run reads only this (~200 bytes)
# instead of the ~1 MB `catalog` and `kept` read (Neon's free plan sends 5 GB a month).
DUE_KEY = "audit_game_checks_due"
_INPUTS_SQL = text(
    "SELECT max(updated_at) FROM read_models WHERE key IN ('sorare', :checks) OR key LIKE 'score_record:%'"
).bindparams(checks=KEY)


def _inputs(db: Session) -> str:
    return str(db.execute(_INPUTS_SQL).scalar())


def run(db: Session, client: SorareClient, now: datetime) -> dict[str, int]:
    due = db.get(ReadModel, DUE_KEY)
    seen = dict(due.payload) if due else {}
    if seen.get("inputs") == _inputs(db) and seen.get("version") == QUERY_VERSION:
        at = moment(seen["at"]) if seen.get("at") else None
        if at is None or now < at:
            return {"games": 0, "failed": 0, "pending": 0}
    checks = kept(db)
    wanted: dict[str, dict[str, Any]] = {}
    soonest: datetime | None = None
    for record in catalog(db):
        for slug, entry in record["players"].items():
            for game in entry.get("games") or []:
                gid, kickoff = game.get("id"), moment(game.get("kickoff"))
                if not gid or not versus.GAME_ID.fullmatch(gid) or not kickoff:
                    continue
                target = wanted.setdefault(gid, {**game, "kickoff": kickoff.isoformat(), "players": set()})
                target["players"].add(slug)
    # Collect the full owner coverage before deciding a match is complete; newly owned players need their own reads.
    for gid, target in list(wanted.items()):
        check = checks.get(gid) or {}
        kickoff = moment(check.get("kickoff")) or moment(target["kickoff"])
        assert kickoff is not None
        target["kickoff"] = kickoff.isoformat()
        scores = check.get("scores") or {}
        complete = target["players"] <= scores.keys() and all(
            scores[p].get("sourceStatus") != "REVIEWING" for p in target["players"]
        )
        rechecked = complete and all(scores[p].get("recheckedAt", check.get("recheckedAt")) for p in target["players"])
        last = moment(check.get("lastAttemptAt"))
        ready = max(
            [kickoff + FIRST]
            + ([last + RETRY] if last and check.get("queryVersion") == QUERY_VERSION else [])
            + ([kickoff + RECHECK] if complete else [])
        )
        if not rechecked and now < ready <= kickoff + WINDOW:
            soonest = min(soonest or ready, ready)
        if (
            now < kickoff + FIRST
            or now > kickoff + WINDOW
            or rechecked
            or (last and check.get("queryVersion") == QUERY_VERSION and now < last + RETRY)
            or (complete and now < kickoff + RECHECK)
        ):
            del wanted[gid]
    db.rollback()  # no open DB transaction while waiting for the source
    read = failed = 0
    ids = sorted(wanted)
    for offset in range(0, len(ids), BATCH):
        batch = ids[offset : offset + BATCH]
        try:
            answer = client.query(
                "query { " + " ".join(QUERY.format(alias=f"g{i}", id=gid) for i, gid in enumerate(batch)) + " }"
            )
        except SorareError:
            answer = {}
        history: dict[str, list[dict[str, Any]]] = {}
        for i, gid in enumerate(batch):
            game, target = answer.get(f"g{i}") or {}, wanted[gid]
            check = checks.setdefault(gid, {})
            check.update(lastAttemptAt=now.isoformat(), kickoff=target["kickoff"], queryVersion=QUERY_VERSION)
            if game.get("id") != gid:
                check["reason"] = "Sorare result unavailable"
                failed += 1
                continue
            kickoff = moment(game.get("date")) or moment(target["kickoff"])
            assert kickoff is not None
            check["kickoff"] = kickoff.isoformat()
            if game.get("statusTyped") != "played" or now < kickoff + FIRST:
                check["reason"] = "Game not finished on Sorare"
                continue
            scores = {}
            for row in game.get("playerGameScores") or []:
                slug = (row.get("anyPlayer") or {}).get("slug")
                stats = row.get("anyPlayerGameStats") or {}
                status = row.get("scoreStatus")
                played = stats.get("playedInGame")
                if status == "DID_NOT_PLAY" and played is None:
                    played = False  # explicit source status; an absent player row still never implies DNP
                if (
                    not isinstance(slug, str)
                    or slug not in target["players"]
                    or status not in ("FINAL", "REVIEWING", "DID_NOT_PLAY")
                    or played is None
                    or (status == "DID_NOT_PLAY" and played is not False)
                ):
                    continue
                if played and row.get("score") is None:
                    continue
                previous = (check.get("scores") or {}).get(slug) or {}
                first_at = previous.get("firstCheckedAt") or (check.get("firstCheckedAt") if previous else None)
                scores[slug] = {
                    "score": row.get("score"),
                    "played": played,
                    "started": bool(stats["gameStarted"]) if stats.get("gameStarted") is not None else None,
                    "mins": stats.get("minsPlayed"),
                    "sourceStatus": status,
                    "firstCheckedAt": first_at or now.isoformat(),
                    "checkedAt": now.isoformat(),
                    "recheckedAt": now.isoformat()
                    if first_at and now >= kickoff + RECHECK and status != "REVIEWING"
                    else previous.get("recheckedAt"),
                }
                history[slug] = [
                    {
                        "gameId": gid,
                        "date": kickoff.isoformat(),
                        "competition": target.get("competition") or "unknown",
                        "home": target.get("home"),
                        "away": target.get("away"),
                        "status": status,
                        **scores[slug],
                    }
                ] + history.get(slug, [])
            # Missing players remain pending, never inferred to have missed the game. Retry partial responses.
            if not scores:
                check["reason"] = "Player scores not available yet"
                failed += 1
                continue
            previous = check.get("scores") or {}
            check["scores"] = {**previous, **scores}
            first = check.setdefault("first", {})
            for slug, score in scores.items():
                first.setdefault(slug, score["score"])
            complete = target["players"] <= scores.keys()
            check.pop("recheckedAt", None)
            if complete:
                if all(score.get("recheckedAt") for score in scores.values()):
                    check["recheckedAt"] = now.isoformat()
                check.setdefault("firstCheckedAt", now.isoformat())
                check.pop("reason", None)
                if any(score["sourceStatus"] == "REVIEWING" for score in scores.values()):
                    check["reason"] = "Sorare is still reviewing scores"
            else:
                check["reason"] = "Some player scores are still unavailable"
            check["checkedAt"] = now.isoformat()
            read += 1
        if history:
            player_games.save(db, history, now)
        put(db, KEY, {"games": checks}, now)
    if wanted:  # every game asked for now may be asked again after RETRY
        soonest = min(soonest or now + RETRY, now + RETRY)
    nxt = {"at": soonest.isoformat() if soonest else None, "inputs": _inputs(db), "version": QUERY_VERSION}
    if nxt != seen:
        put(db, DUE_KEY, nxt, now)
    return {"games": read, "failed": failed, "pending": len(wanted) - read}


def comparison(db: Session, now: datetime) -> dict[str, Any]:
    checks = kept(db)
    weeks = []
    for record in catalog(db):
        gw = record["gameweek"]
        written, lock = moment(record.get("writtenAt")), moment(gw.get("lock"))
        frozen = written is not None and lock is not None and written < lock
        rows = []
        for slug, entry in record["players"].items():
            for game in entry.get("games") or []:
                check = checks.get(game.get("id")) or {}
                did = (check.get("scores") or {}).get(slug) or {}
                actual = did.get("score") if did.get("played") is True else None
                known = bool(did) and (did.get("played") is False or actual is not None)
                x = game.get("sofix") if frozen else None
                source = "sofix" if x is not None else entry.get("by")
                if x is None and frozen and source == "sorare":
                    x = game.get("sorare")
                if x is None and frozen and len(entry.get("games") or []) == 1:
                    x = entry.get("mu")
                kickoff = check.get("kickoff") or game.get("kickoff")
                at = moment(kickoff)
                rows.append(
                    {
                        "player": slug,
                        "name": entry["name"],
                        "pic": entry["pic"],
                        "pos": entry.get("pos"),
                        "game": game.get("id"),
                        "kickoff": kickoff,
                        "home": game.get("home"),
                        "away": game.get("away"),
                        "competition": game.get("competition"),
                        "xscore": x,
                        "sources": (game.get("sources") or {}) if frozen else {},
                        "ffMatch": game.get("ffMatch") if frozen else None,
                        "by": source,
                        "sorare": game.get("sorare") if frozen else None,
                        "actual": actual,
                        "difference": round(actual - x, 2) if actual is not None and x is not None else None,
                        "firstScore": (check.get("first") or {}).get(slug),
                        "played": did.get("played"),
                        "started": bool(did["started"]) if did.get("started") is not None else None,
                        "state": ("rechecked" if did.get("recheckedAt") or check.get("recheckedAt") else "provisional")
                        if known
                        else "pending",
                        "checkedAt": did.get("checkedAt") or check.get("checkedAt"),
                        "recheckedAt": did.get("recheckedAt") or check.get("recheckedAt"),
                        "firstDue": (at + FIRST).isoformat() if at else None,
                        "recheckDue": (at + RECHECK).isoformat() if at else None,
                        "reason": (
                            "Automatic check window ended; last known score retained"
                            if known
                            else "Score unavailable; automatic check window ended"
                        )
                        if at and now > at + WINDOW and not (did.get("recheckedAt") or check.get("recheckedAt"))
                        else check.get("reason") or ("" if known else "Awaiting automatic score check"),
                    }
                )
        rows.sort(key=lambda r: (r["kickoff"] or "9999", r["name"]))
        starts = [r for r in rows if r["state"] != "pending" and r["started"] is True and r["actual"] is not None]
        xs = [abs(r["difference"]) for r in starts if r["difference"] is not None]
        sos = [abs(r["actual"] - r["sorare"]) for r in starts if r["sorare"] is not None]
        weeks.append(
            {
                "slug": gw["slug"],
                "number": gw.get("number"),
                "rows": rows,
                "summary": {
                    "checked": sum(r["state"] != "pending" for r in rows),
                    "total": len(rows),
                    "rechecked": sum(r["state"] == "rechecked" for r in rows),
                    "starts": len(starts),
                    "xCases": len(xs),
                    "xMiss": round(sum(xs) / len(xs), 2) if xs else None,
                    "sorareCases": len(sos),
                    "sorareMiss": round(sum(sos) / len(sos), 2) if sos else None,
                },
            }
        )
    return {"weeks": weeks}
