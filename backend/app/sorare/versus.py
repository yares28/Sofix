"""Sorare's projection against Sofix's xScore, on the same players and games (the owner, 6 Oct 2026: "see who is actually more precise").

Before each lock the job writes both numbers down for every LaLiga player with a game in the week (`publish.score_record`, read model
`score_record:<week>`). A day after the week's last game, `settle` adds what each player really scored, whether he started and his
minutes, one Sorare read per game. `figures` then compares the two numbers on the games he started: both are a score for a player who
plays, so a start is the fair ground (a substitute's few minutes or a game he missed would judge the chance of playing instead).

Each figure says how many starts stand behind it; under `audit.FLOOR` the page says too few to tell.
"""

from __future__ import annotations

import logging
import re
from datetime import datetime, timedelta
from itertools import combinations
from typing import Any

from sqlalchemy.orm import Session

from app.models import ReadModel
from app.services.publish import put
from app.sorare.client import SorareClient, SorareError

logger = logging.getLogger(__name__)

PREFIX = "score_record:"
SETTLE = timedelta(hours=27)  # Sorare reviews scores for about a day after a game
CLOSE = 7.0  # "within 7 points", the page's measure of a number that was right
BATCH = 6
GAME_ID = re.compile(r"^Game:[0-9a-f-]{36}$")
RESULTS = (
    '{alias}: anyGame(id: "{id}") {{ ... on Game {{ id playerGameScores {{ score anyPlayer {{ slug }} '
    "anyPlayerGameStats {{ playedInGame ... on PlayerGameStats {{ gameStarted minsPlayed }} }} }} }} }}"
)


def _dt(value: str) -> datetime:
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


def records(db: Session) -> list[tuple[str, dict[str, Any]]]:
    rows = db.query(ReadModel).filter(ReadModel.key.like(f"{PREFIX}%")).all()
    return [(row.key, dict(row.payload)) for row in rows if isinstance(row.payload, dict)]


def due(record: dict[str, Any], now: datetime) -> bool:
    """Whether a week's record can be settled now: not settled yet, and a day past its last game."""
    if record.get("settledAt"):
        return False
    kickoffs = [
        g["kickoff"] for p in (record.get("players") or {}).values() for g in p.get("games") or [] if g.get("kickoff")
    ]
    return bool(kickoffs) and now >= _dt(max(kickoffs)) + SETTLE


def results(client: SorareClient, game_ids: list[str]) -> dict[str, dict[str, dict[str, Any]]]:
    """What each player of these games did: `{game id: {player slug: {score, played, started, mins}}}`. A read that fails leaves its games out."""
    wanted = sorted({g for g in game_ids if g and GAME_ID.match(g)})
    out: dict[str, dict[str, dict[str, Any]]] = {}
    for i in range(0, len(wanted), BATCH):
        batch = wanted[i : i + BATCH]
        query = "query { " + " ".join(RESULTS.format(alias=f"g{n}", id=gid) for n, gid in enumerate(batch)) + " }"
        try:
            data = client.query(query)
        except SorareError as exc:
            logger.warning("versus: no results for %d games (%s)", len(batch), exc)
            continue
        for n, gid in enumerate(batch):
            out[gid] = {
                row["anyPlayer"]["slug"]: {
                    "score": row.get("score"),
                    "played": bool((row.get("anyPlayerGameStats") or {}).get("playedInGame")),
                    "started": bool((row.get("anyPlayerGameStats") or {}).get("gameStarted")),
                    "mins": (row.get("anyPlayerGameStats") or {}).get("minsPlayed") or 0,
                }
                for row in (data.get(f"g{n}") or {}).get("playerGameScores") or []
                if (row.get("anyPlayer") or {}).get("slug")
            }
    return out


def settled(record: dict[str, Any], found: dict[str, dict[str, dict[str, Any]]], now: datetime) -> dict[str, Any]:
    """The record with what happened written beside each game Sorare answered for; marked settled once every game has an answer."""
    players = {}
    for slug, entry in (record.get("players") or {}).items():
        games = []
        for game in entry.get("games") or []:
            did = (found.get(game.get("id") or "") or {}).get(slug)
            games.append({**game, "actual": did} if did is not None else game)
        players[slug] = {**entry, "games": games}
    asked = {g.get("id") for p in players.values() for g in p["games"]}
    complete = all(gid in found for gid in asked if gid)
    return {**record, "players": players, **({"settledAt": now.isoformat()} if complete else {})}


def settle(db: Session, client: SorareClient, now: datetime) -> dict[str, int]:
    """Settle every week whose games are a day old. Returns how many weeks and games were written."""
    weeks = games = 0
    for key, record in records(db):
        if not due(record, now):
            continue
        ids = [g.get("id") for p in (record.get("players") or {}).values() for g in p.get("games") or []]
        found = results(client, [i for i in ids if i])
        if not found:
            continue
        put(db, key, settled(record, found, now), now)
        weeks += 1
        games += len(found)
    return {"weeks": weeks, "games": games}


# --------------------------------------------------------------------------- figures
def starts_of(record: dict[str, Any]) -> list[dict[str, Any]]:
    """Every settled game a player started with both numbers written down before the lock: (week, pos, sorare, sofix, actual)."""
    week = (record.get("gameweek") or {}).get("number")
    out = []
    for slug, entry in (record.get("players") or {}).items():
        for game in entry.get("games") or []:
            did = game.get("actual") or {}
            if not did.get("started") or did.get("score") is None:
                continue
            if game.get("sorare") is None or game.get("sofix") is None:
                continue
            out.append(
                {
                    "player": slug,
                    "week": week,
                    "pos": entry.get("pos"),
                    "sorare": float(game["sorare"]),
                    "sofix": float(game["sofix"]),
                    "actual": float(did["score"]),
                }
            )
    return out


def _pair_rate(rows: list[dict[str, Any]], key: str) -> tuple[float | None, int]:
    """Of every two starters of one position in one week who scored differently, how often the number rated the better one higher."""
    groups: dict[tuple[Any, Any], list[dict[str, Any]]] = {}
    for row in rows:
        groups.setdefault((row["week"], row["pos"]), []).append(row)
    right = total = 0
    for group in groups.values():
        for a, b in combinations(group, 2):
            if a["actual"] == b["actual"] or a[key] == b[key]:
                continue
            total += 1
            right += (a[key] > b[key]) == (a["actual"] > b["actual"])
    return (right / total if total else None), total


def _side(rows: list[dict[str, Any]], key: str) -> dict[str, Any]:
    misses = [row[key] - row["actual"] for row in rows]
    n = len(misses)
    pair, pairs = _pair_rate(rows, key)
    return {
        "miss": round(sum(abs(m) for m in misses) / n, 2) if n else None,  # how far off, on average, in points
        "lean": round(sum(misses) / n, 2) if n else None,  # positive: too high on average
        "within": round(sum(1 for m in misses if abs(m) <= CLOSE) / n, 4) if n else None,
        "pair": round(pair, 4) if pair is not None else None,
        "pairs": pairs,
    }


def compare(rows: list[dict[str, Any]]) -> dict[str, Any]:
    """Both numbers on the same starts: how far off each was, how often each was within 7, which side leans, which rated the better player
    higher, and how often Sofix was the closer of the two (a tie counts for neither)."""
    closer = [row for row in rows if abs(row["sofix"] - row["actual"]) != abs(row["sorare"] - row["actual"])]
    sofix_closer = sum(1 for row in closer if abs(row["sofix"] - row["actual"]) < abs(row["sorare"] - row["actual"]))
    return {
        "starts": len(rows),
        "sofixCloser": round(sofix_closer / len(closer), 4) if closer else None,
        "sofix": _side(rows, "sofix"),
        "sorare": _side(rows, "sorare"),
    }


def figures(all_records: list[dict[str, Any]]) -> dict[str, Any]:
    """The Audit's Sorare-against-Sofix view: everything together, by position, and week by week."""
    rows = [row for record in all_records for row in starts_of(record)]
    by_week: dict[Any, list[dict[str, Any]]] = {}
    for row in rows:
        by_week.setdefault(row["week"], []).append(row)
    return {
        "all": compare(rows),
        "positions": {pos: compare([r for r in rows if r["pos"] == pos]) for pos in ("GK", "DEF", "MID", "FWD")},
        "weeks": [
            {"week": week, **compare(found)} for week, found in sorted(by_week.items(), key=lambda item: item[0] or 0)
        ],
        "recorded": len(all_records),
        "settled": sum(1 for record in all_records if record.get("settledAt")),
    }
