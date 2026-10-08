"""The daily missions log, settled and scored (plans/roadmap.md 10.7, part 2).

The app writes down, before the games, what Sofix picked for each daily mission and every card of the owner's that could have been picked, with its
chance (`missions_day:day:rarity`, with legacy monthly rows retained). A day after each game the refresh reads that game once from Sorare (`fetch_game`: who
played and every stat he made) and marks, for each candidate, whether he did what each mission asks (`settle`).

`record` then scores Sofix the way the owner asked (6 Oct 2026): a mission is judged against what his cards could have done that day. The players who did
it are the achievers; the best possible is the mission's picks or the number of achievers, whichever is smaller. A day with no achiever is not counted
(nobody could have done it); a day is a success when Sofix's picks hold as many achievers as the best possible. Picking 1, 2 and 3 when 1, 4 and 5 did it
is a miss: two of the cards that could have done it were left out.
"""

from __future__ import annotations

import copy
import logging
import math
import re
from datetime import datetime, timedelta
from typing import Any

from sqlalchemy import or_, update
from sqlalchemy.orm import Session

from app.jobs.export_games import fetch_game
from app.models import ReadModel
from app.sorare.publish import GIVE_UP, SETTLE

logger = logging.getLogger(__name__)

LOG_PREFIX = "missions_log:"
DAY_PREFIX = "missions_day:"
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
    rows = (
        db.query(ReadModel)
        .filter(or_(ReadModel.key.like(f"{LOG_PREFIX}%"), ReadModel.key.like(f"{DAY_PREFIX}%")))
        .all()
    )
    revisions = {row.key: row.updated_at for row in rows}
    logs = {row.key: copy.deepcopy(dict(row.payload)) for row in rows if isinstance(row.payload, dict)}
    # Once copied, the per-day ledger owns settlement. Keep legacy rows as rollback evidence.
    copied_months = {key.removeprefix(DAY_PREFIX)[:7] for key in logs if key.startswith(DAY_PREFIX)}
    logs = {
        key: payload
        for key, payload in logs.items()
        if not (key.startswith(LOG_PREFIX) and key.removeprefix(LOG_PREFIX) in copied_months)
    }
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
            changed = db.execute(
                update(ReadModel)
                .where(ReadModel.key == key, ReadModel.updated_at == revisions[key])
                .values(payload=payload, updated_at=now)
                .execution_options(synchronize_session=False)
            )
            written += int(bool(changed.rowcount))  # a conflicting import is retried next refresh
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
                    if (
                        not cands
                        or any(c.get("late") for c in entry.get("cands", []))
                        or entry.get("coverage") == "missing"
                        or not mission.get("sofix")
                    ):
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
                    title = mission.get("title") or key
                    row = by_mission.setdefault(title, {"counted": 0, "success": 0})
                    row["counted"] += 1
                    row["success"] += got >= best
                    for slug in picks:
                        said.append(float(live[slug]["c"][key]))
                        hits += slug in achievers
                    mine = (mission.get("override") or {}).get("picks", mission.get("yours") or [])
                    your_got = None
                    manual = mission.get("override")

                    def verdict(
                        y: dict[str, Any],
                        selected: dict[str, Any] = mission,
                        overridden: dict[str, Any] | None = manual,
                    ) -> str | None:
                        source = (
                            next(
                                (
                                    p
                                    for p in selected.get("yours", [])
                                    if p["player"] == y["player"]
                                    and p.get("game") == y.get("game")
                                    and p.get("card") == y.get("card")
                                ),
                                {},
                            )
                            if overridden
                            else y
                        )
                        return source.get("status")

                    supported = all(
                        verdict(y) in ("SUCCESS", "FAILURE")
                        or (
                            y.get("game")
                            and any(c.get("g") == y["game"] and c["s"] == y["player"] for c in live.values())
                        )
                        for y in mine
                    )
                    if (mine or manual) and supported:
                        your_got = sum(
                            1
                            for y in mine
                            if verdict(y) == "SUCCESS" or (verdict(y) in (None, "READY") and y["player"] in achievers)
                        )
                        yours["counted"] += 1
                        yours["success"] += your_got >= best
                    days.append(
                        {
                            "day": day,
                            "rarity": rarity,
                            "mission": title,
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


def logs_of(db: Session, include_edits: bool = True) -> list[dict[str, Any]]:
    rows = (
        db.query(ReadModel)
        .filter(or_(ReadModel.key.like(f"{LOG_PREFIX}%"), ReadModel.key.like(f"{DAY_PREFIX}%")))
        .all()
    )
    combined: dict[str, Any] = {"days": {}}
    for row in sorted(rows, key=lambda r: r.key.startswith(DAY_PREFIX)):
        if isinstance(row.payload, dict):
            for day, rarities in row.payload.get("days", {}).items():
                combined["days"].setdefault(day, {}).update(copy.deepcopy(rarities))
    if not include_edits:
        return [combined]
    edits = db.query(ReadModel).filter(ReadModel.key.like("missions_edit:%")).all()
    for row in edits:
        data = row.payload
        entry = combined["days"].get(data.get("day"), {}).get(data.get("rarity"))
        if entry:
            for m in entry.get("missions", []):
                override = next(
                    (
                        (data.get("edits") or {})[key]
                        for key in [m["key"], *m.get("aliases", [])]
                        if key in (data.get("edits") or {})
                    ),
                    None,
                )
                if override and not override.get("restored"):
                    m["override"] = override
                else:
                    m.pop("override", None)
    return [combined]


def mission_day(now: datetime) -> str:
    return (now - timedelta(hours=8)).date().isoformat()


def _rule(m: dict[str, Any]) -> dict[str, Any]:
    text = f"{m['title']} {m['description']}"
    if m["mode"] == "SCORE":
        return {"kind": "score", "label": m["description"]}
    targets = m.get("thresholds") or []
    if targets:
        if len(targets) != 1:
            return {"kind": "unsupported", "label": m["description"]}
        kind = next((k for k, stat in COUNTS.items() if stat == targets[0]["stat"]), "unsupported")
        return {"kind": kind, "atLeast": targets[0]["min"], "label": m["description"]}
    stats = m.get("stats") or []
    if stats:
        if len(stats) == 1 and stats[0] in COUNTS.values():
            return {
                "kind": next(k for k, v in COUNTS.items() if v == stats[0]),
                "atLeast": 1,
                "label": m["description"],
            }
        if not all(s in stats for s in DECISIVE_STATS) or any(
            s not in (*DECISIVE_STATS, "clean_sheet_60") for s in stats
        ):
            return {"kind": "unsupported", "label": m["description"]}
        return {"kind": "decisive", "label": m["description"]}
    for kind in COUNTS:
        if re.search(kind, text, re.I):
            count = re.search(r"(\d+)\s*\+\s*" + kind, text, re.I)
            return {"kind": kind, "atLeast": int(count[1]) if count else 1, "label": m["description"]}
    return {"kind": "decisive" if "decisive" in text.lower() else "unsupported", "label": m["description"]}


def daily_entry(
    previous: dict[str, Any] | None,
    loaded: list[dict[str, Any]] | None,
    pool: dict[str, Any],
    rarity: str,
    now: datetime,
) -> dict[str, Any]:
    """Baseline capture without the browser. Imported fields and frozen forecasts survive."""
    old = previous or {}
    assumed = {
        "key": "daily-decisive-picker",
        "title": "Decisive Picker",
        "description": "Positive decisive action",
        "mode": "DECISIVE",
        "rule": {"kind": "decisive", "label": "a decisive action"},
        "stats": [],
        "picks": 3,
        "sofix": [],
        "yours": [],
    }
    missions = copy.deepcopy(old.get("missions", [assumed]))
    remap = {}
    if loaded is not None:
        missions = []
        for m in loaded:
            prior = next(
                (
                    x
                    for x in old.get("missions", [])
                    if x["key"] == m["id"]
                    or (
                        (not x.get("title") or x["key"] == assumed["key"])
                        and (x.get("title") or x["key"]).lower() == m["title"].lower()
                    )
                ),
                {},
            )
            rule = _rule(m)
            if prior:
                remap[prior["key"]] = m["id"]
            missions.append(
                {
                    **prior,
                    "key": m["id"],
                    "aliases": list(
                        dict.fromkeys(
                            ([prior["key"]] if prior and prior["key"] != m["id"] else []) + prior.get("aliases", [])
                        )
                    ),
                    "title": m["title"],
                    "source": m,
                    "description": m["description"],
                    "mode": m["mode"],
                    "rule": rule,
                    "stats": m.get("stats", []),
                    "picks": m["picks"],
                    "sofix": prior.get("sofix", []),
                    "yours": m.get("appearances", prior.get("yours", [])),
                }
            )
    frozen = [copy.deepcopy(c) for c in old.get("cands", []) if _when(c["k"]) <= now]
    for cand in frozen:
        for before, after in remap.items():
            if before in cand["c"]:
                cand["c"][after] = cand["c"][before]
            if before in cand.get("r", {}).get("did", {}):
                cand["r"]["did"][after] = cand["r"]["did"][before]
    frozen_ids = {(c.get("card") or c["s"], c.get("g")) for c in frozen}
    cands = frozen[:]
    sheets = pool.get("sheets", {}).get("players", {})
    for p in pool.get("players", []):
        if p["rarity"] != rarity or p.get("eligibility"):
            continue
        for g in p.get("games", []):
            if (
                mission_day(_when(g["kickoff"])) != mission_day(now)
                or (p.get("card") or p["player"], g.get("id")) in frozen_ids
            ):
                continue
            if any(
                (c.get("card") or c["s"]) == (p.get("card") or p["player"]) and c.get("g") == g.get("id") for c in cands
            ):
                continue
            late = _when(g["kickoff"]) <= now
            chances = {}
            for m in missions:
                source = m.get("source") or {}
                eligibility = source.get("eligibleCards")
                if (eligibility is not None and p.get("card") not in eligibility.get(g.get("id"), [])) or (
                    source.get("ruleTypes") and eligibility is None
                ):
                    continue
                kind = m["rule"]["kind"]
                rate = sheets.get(p["player"], {}).get("decAll")
                if kind == "decisive":
                    conditional = (p.get("shape") or {}).get("p", rate)
                    if conditional is not None and not late:
                        start, on = g.get("pStart", p.get("pStart")), g.get("pOn", p.get("pOn"))
                        chance = (
                            start * conditional + on * p["onShape"]["p"]
                            if start is not None and on is not None and p.get("onShape")
                            else p["p"] * conditional
                        )
                        chances[m["key"]] = round(chance, 3)
                elif kind in COUNTS and not late:
                    value = sheets.get(p["player"], {}).get("season", {}).get(COUNTS[kind])
                    if value:
                        n, lam = int(m["rule"].get("atLeast", 1)), float(value[0])
                        start, on = g.get("pStart", p.get("pStart")), g.get("pOn", p.get("pOn"))
                        playing = min(1, start + on) if start is not None and on is not None else p["p"]
                        chances[m["key"]] = round(
                            playing * (1 - sum(math.exp(-lam) * lam**k / math.factorial(k) for k in range(n))), 3
                        )
            cands.append(
                {
                    "s": p["player"],
                    "n": p["name"],
                    "pic": p["pic"],
                    "pos": p["pos"],
                    "card": p.get("card"),
                    "g": g.get("id"),
                    "k": g["kickoff"],
                    "c": chances,
                    "captured": now.isoformat(),
                    "late": late,
                }
            )
    used: set[str] = set()
    for m in missions:
        frozen_picks = [s for s in m["sofix"] if any(c["s"] == s for c in frozen)]
        m["sofix"] = frozen_picks
        if "sofixPicks" in m:
            m["sofixPicks"] = [
                p for p in m["sofixPicks"] if (p.get("card") or p["player"], p.get("game")) in frozen_ids
            ]
            used.update(p.get("card") or p["player"] for p in m["sofixPicks"])
        else:
            used.update(frozen_picks)
            m["sofixPicks"] = []
    pairs = sorted(
        [
            (float(c["c"][m["key"]]), c, m)
            for m in missions
            for c in cands
            if not c.get("late") and m["key"] in c["c"] and _when(c["k"]) > now
        ],
        key=lambda x: (
            0
            if "essence" in str(x[2].get("source", {})).lower()
            else 1
            if "clue" in str(x[2].get("source", {})).lower()
            else 2,
            -x[0],
        ),
    )
    for _, cand, m in pairs:
        identity = cand.get("card") or cand["s"]
        if (
            identity not in used
            and cand["s"] not in used
            and cand["s"] not in m["sofix"]
            and len(m["sofix"]) < m["picks"]
        ):
            m["sofix"].append(cand["s"])
            m["sofixPicks"].append(
                {"player": cand["s"], "card": cand.get("card"), "game": cand.get("g"), "rarity": rarity, "status": None}
            )
            used.add(identity)
    return {
        **old,
        "loaded": loaded is not None or bool(old.get("loaded")),
        "missions": missions,
        "cands": cands,
        "coverage": "snapshot" if pool.get("complete") else "missing",
        "captured": now.isoformat(),
    }


def capture(db: Session, pool: dict[str, Any], now: datetime) -> dict[str, int]:
    """Idempotent legacy copy, gap ledger and daily capture; no new external reads."""
    logs = logs_of(db, include_edits=False)[0]["days"]
    today = mission_day(now)
    start = min([today, *logs.keys()])
    first = max(start, (now - timedelta(days=60)).date().isoformat())
    rarities = sorted(
        {p["rarity"] for p in pool["players"] if p["rarity"] in ("limited", "rare", "super_rare", "unique")}
    )
    model = db.get(ReadModel, "missions")
    current = model.payload if model else {}
    written = 0
    day = first
    while day <= today:
        for rarity in rarities:
            key = f"{DAY_PREFIX}{day}:{rarity}"
            stored = db.get(ReadModel, key)
            prior = copy.deepcopy(stored.payload["days"][day][rarity]) if stored else logs.get(day, {}).get(rarity)
            if stored and day < today:
                continue
            entry = current.get(rarity) or {}
            loaded = (
                entry.get("missions")
                if entry.get("seen_at")
                and mission_day(_when(entry["seen_at"])) == day
                and (entry.get("verified") or entry.get("missions"))
                else None
            )
            if day == today:
                updated = daily_entry(prior, loaded, pool, rarity, now)
            elif prior is not None:
                updated = prior
            else:
                updated = daily_entry(None, None, {"players": [], "sheets": {}}, rarity, _when(f"{day}T12:00:00+00:00"))
            payload = {"days": {day: {rarity: updated}}}
            if stored:
                db.execute(
                    update(ReadModel)
                    .where(ReadModel.key == key, ReadModel.updated_at == stored.updated_at)
                    .values(payload=payload, updated_at=now)
                    .execution_options(synchronize_session=False)
                )
            else:
                # INSERT without overwriting a simultaneously captured record.
                from sqlalchemy.dialects.postgresql import insert as pg_insert
                from sqlalchemy.dialects.sqlite import insert as sqlite_insert

                dialect_insert = pg_insert if db.get_bind().dialect.name == "postgresql" else sqlite_insert
                db.execute(
                    dialect_insert(ReadModel)
                    .values(key=key, payload=payload, updated_at=now)
                    .on_conflict_do_nothing(index_elements=["key"])
                )
            written += 1
        day = (datetime.fromisoformat(day) + timedelta(days=1)).date().isoformat()
    db.expire_all()
    return {"days": written}
