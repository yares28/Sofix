"""The daily missions log, settled and scored (plans/roadmap.md 10.7, part 2).

The app writes down, before the games, what Sofix picked for each daily mission and every card of the owner's that could have been picked, with its
chance (`missions_log:YYYY-MM`, frontend/lib/missionLog.ts). A day after each game the refresh reads that game once from Sorare (`fetch_game`: who
played and every stat he made) and marks, for each candidate, whether he did what each mission asks (`settle`).

`record` then scores Sofix the way the owner asked (6 Oct 2026): a mission is judged against what his cards could have done that day. The players who did
it are the achievers; the best possible is the mission's picks or the number of achievers, whichever is smaller. A day with no achiever is not counted
(nobody could have done it); a day is a success when Sofix's picks hold as many achievers as the best possible. Picking 1, 2 and 3 when 1, 4 and 5 did it
is a miss: two of the cards that could have done it were left out.
"""

from __future__ import annotations

import copy
import logging
from datetime import datetime
from typing import Any

from sqlalchemy.orm import Session

from app.jobs.export_games import fetch_game
from app.models import ReadModel
from app.services.publish import put
from app.sorare.publish import GIVE_UP, SETTLE

logger = logging.getLogger(__name__)

LOG_PREFIX = "missions_log:"
GAMES_PER_RUN = 15  # games read from Sorare in one refresh (two questions each); the rest wait for the next run, under Sorare's per-IP limit
# The positive decisive actions, as `detailedScore` names them (checked in the games export), when a mission does not list its own. A clean sheet is
# decisive for a goalkeeper only.
DECISIVE_STATS = ("goals", "goal_assist", "assist_penalty_won", "clearance_off_line", "last_man_tackle", "penalty_save")
COUNTS = {"interception": "interception_won", "assist": "goal_assist", "goal": "goals"}
RECENT = 30  # mission days the page lists


def _when(value: str) -> datetime:
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


def _stat(row: dict[str, Any], name: str) -> float:
    return float(((row.get("stats") or {}).get(name) or [0])[0] or 0)


def did(rule: dict[str, Any], stats: list[str], row: dict[str, Any]) -> bool:
    """Whether a player's game (a `fetch_game` row) did what the mission's rule asks."""
    kind = rule.get("kind")
    if kind == "decisive":
        if any(_stat(row, name) > 0 for name in (stats or DECISIVE_STATS)):
            return True
        return not stats and row.get("pos") == "GK" and _stat(row, "clean_sheet_60") > 0
    if kind in COUNTS:
        return _stat(row, COUNTS[kind]) >= float(rule.get("atLeast") or 1)
    return False


def settle_log(payload: dict[str, Any], games: dict[str, dict[str, Any] | None], now: datetime) -> list[str]:
    """Mark each candidate whose game is a day old with what he did, from the games read (`games`, by id; None: could not be read). Returns the ids
    of games still needed. A game never scored, or a candidate with no game id, is void a week after kick-off."""
    wanted: list[str] = []
    for rarities in payload.get("days", {}).values():
        for entry in rarities.values():
            missions = {m["key"]: m for m in entry.get("missions", [])}
            for cand in entry.get("cands", []):
                if "r" in cand:
                    continue
                kickoff = _when(cand["k"])
                if now < kickoff + SETTLE:
                    continue
                game_id = cand.get("g")
                game = games.get(game_id) if game_id else None
                if game_id and game_id not in games:
                    wanted.append(game_id)
                    continue
                if not game or not game.get("players"):
                    if now >= kickoff + GIVE_UP:
                        cand["r"] = {"void": True}
                    continue
                row = game["players"].get(cand["s"])
                if row is None or not row.get("played"):
                    cand["r"] = {"played": False, "did": {key: False for key in cand.get("c", {})}}
                    continue
                cand["r"] = {
                    "played": True,
                    "did": {
                        key: did(missions[key]["rule"], missions[key].get("stats") or [], row)
                        for key in cand.get("c", {})
                        if key in missions
                    },
                }
    return list(dict.fromkeys(wanted))


def settle(db: Session, client: Any, now: datetime) -> dict[str, int]:
    """The refresh's step: read the games the log is waiting for (at most `GAMES_PER_RUN`) and write what each candidate did."""
    rows = db.query(ReadModel).filter(ReadModel.key.like(f"{LOG_PREFIX}%")).all()
    logs = {row.key: copy.deepcopy(dict(row.payload)) for row in rows if isinstance(row.payload, dict)}
    games: dict[str, dict[str, Any] | None] = {}
    for payload in logs.values():
        for game_id in settle_log(copy.deepcopy(payload), games, now):
            if len(games) >= GAMES_PER_RUN:
                break
            try:
                games[game_id] = fetch_game(client, {"id": game_id})
            except Exception as exc:  # one game Sorare will not give is tried again next run
                logger.warning("missions: game %s not read (%s)", game_id, type(exc).__name__)
    written = 0
    for key, payload in logs.items():
        before = repr(payload)
        settle_log(payload, {k: v for k, v in games.items() if v is not None}, now)
        if repr(payload) != before:
            put(db, key, payload, now)
            written += 1
    return {"games": sum(1 for v in games.values() if v is not None), "months": written}


def _card(cand: dict[str, Any], hit: bool | None = None) -> dict[str, Any]:
    out = {"slug": cand["s"], "name": cand.get("n") or cand["s"], "pic": cand.get("pic") or ""}
    if hit is not None:
        out["hit"] = hit
    return out


def record(logs: list[dict[str, Any]]) -> dict[str, Any]:
    """The Audit's missions figures, from every month of the log."""
    counted = success = caught = best_total = pending = nobody = 0
    yours = {"counted": 0, "success": 0}
    by_mission: dict[str, dict[str, int]] = {}
    said: list[float] = []
    hits = 0
    days: list[dict[str, Any]] = []
    for log in logs:
        for day, rarities in (log.get("days") or {}).items():
            for rarity, entry in rarities.items():
                for mission in entry.get("missions", []):
                    key = mission["key"]
                    cands = [c for c in entry.get("cands", []) if key in (c.get("c") or {})]
                    if not cands:
                        continue
                    if any("r" not in c for c in cands):
                        pending += 1
                        continue
                    live = {c["s"]: c for c in cands if not c["r"].get("void")}
                    achievers = {s for s, c in live.items() if c["r"].get("did", {}).get(key)}
                    if not achievers:
                        nobody += 1
                        continue
                    picks = [s for s in mission.get("sofix", []) if s in live]
                    best = min(int(mission.get("picks") or 3), len(achievers))
                    got = len(set(picks) & achievers)
                    counted += 1
                    success += got >= best
                    caught += got
                    best_total += best
                    row = by_mission.setdefault(key, {"counted": 0, "success": 0})
                    row["counted"] += 1
                    row["success"] += got >= best
                    for slug in picks:
                        said.append(float(live[slug]["c"][key]))
                        hits += slug in achievers
                    mine = mission.get("yours") or []
                    your_got = None
                    if mine:
                        your_got = sum(
                            1
                            for y in mine
                            if y.get("status") == "SUCCESS"
                            or (y.get("status") in (None, "READY") and y["player"] in achievers)
                        )
                        yours["counted"] += 1
                        yours["success"] += your_got >= best
                    days.append(
                        {
                            "day": day,
                            "rarity": rarity,
                            "mission": key,
                            "loaded": bool(entry.get("loaded")),
                            "best": best,
                            "got": got,
                            "picks": [_card(live[s], s in achievers) for s in picks],
                            "missed": [_card(live[s]) for s in sorted(achievers - set(picks))],
                            "yours": your_got,
                        }
                    )
    days.sort(key=lambda d: (d["day"], d["rarity"], d["mission"]), reverse=True)
    return {
        "counted": counted,
        "success": success,
        "caught": caught,
        "best": best_total,
        "nobody": nobody,
        "pending": pending,
        "yours": yours,
        "byMission": [{"mission": k, **v} for k, v in sorted(by_mission.items())],
        "said": round(sum(said) / len(said), 3) if said else None,
        "happened": round(hits / len(said), 3) if said else None,
        "picks": len(said),
        "days": days[:RECENT],
    }


def logs_of(db: Session) -> list[dict[str, Any]]:
    rows = db.query(ReadModel).filter(ReadModel.key.like(f"{LOG_PREFIX}%")).all()
    return [dict(row.payload) for row in rows if isinstance(row.payload, dict)]
