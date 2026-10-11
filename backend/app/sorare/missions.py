"""The daily missions log, settled and scored (plans/roadmap.md 10.7, part 2).

The app writes down, before the games, what Sofix picked for each daily mission and every card of the owner's that could have been picked, with its
chance (`missions_day:day:rarity`, with legacy monthly rows retained). A day after each game the refresh uses the shared `player_games` results and stats
to mark whether each candidate did what the mission asks (`settle_kept`). The old game reader remains only for historical compatibility.

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
from app.models import PlayerGame, ReadModel
from app.services.timeutil import as_utc
from app.sorare import mission_form, mission_replay, player_games
from app.sorare.publish import GIVE_UP, SETTLE

logger = logging.getLogger(__name__)

LOG_PREFIX = "missions_log:"
DAY_PREFIX = "missions_day:"
GAMES_PER_RUN = 15  # games read from Sorare in one refresh (two questions each); the rest wait for the next run, under Sorare's per-IP limit
# The positive decisive actions, as `detailedScore` names them (checked in the games export), when a mission does not list its own. A clean sheet is
# decisive for a goalkeeper only.
DECISIVE_STATS = ("goals", "goal_assist", "assist_penalty_won", "clearance_off_line", "last_man_tackle", "penalty_save")
COUNTS = {
    "interception": "interception_won",
    "assist": "goal_assist",
    "goal": "goals",
    "shot": "ontarget_scoring_att",
    "tackle": "won_tackle",
    "pass": "accurate_pass",
}
COUNT_WORDS = {
    "interception": r"interceptions?",
    "assist": r"assists?",
    "goal": r"goals?",
    "shot": r"shots?\s+on\s+target",
    "tackle": r"tackles?(?:\s+won)?",
    "pass": r"(?:accurate|completed)\s+passes",
}
RECENT = 30  # mission days the page lists


def _when(value: str) -> datetime:
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


def _stat(row: dict[str, Any], name: str) -> float:
    return float(((row.get("stats") or {}).get(name) or [0])[0] or 0)


def did(rule: dict[str, Any], stats: list[str], row: dict[str, Any]) -> bool | None:
    """Whether a player's game (a `fetch_game` row) did what the mission's rule asks."""
    kind = rule.get("kind")
    if kind == "decisive":
        names = stats or [*DECISIVE_STATS, *(["clean_sheet_60"] if row.get("pos") == "GK" else [])]
        if any(_stat(row, name) > 0 for name in names):
            return True
        return None if any(name in row.get("stats", {}) and row["stats"][name][0] is None for name in names) else False
    if kind in COUNTS:
        if COUNTS[kind] in row.get("stats", {}) and row["stats"][COUNTS[kind]][0] is None:
            return None
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
                if cand.get("r", {}).get("void") or (
                    "r" in cand and all(key in cand["r"].get("did", {}) for key in cand.get("c", {}))
                ):
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
                        and did(missions[key]["rule"], missions[key].get("stats") or [], row) is not None
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


def settle_kept(db: Session, now: datetime) -> dict[str, int]:
    """Settle only candidates whose own result and stats were read; no additional Sorare calls or inferred DNPs."""
    months = marked = 0
    rows = (
        db.query(ReadModel)
        .filter(or_(ReadModel.key.like(f"{LOG_PREFIX}%"), ReadModel.key.like(f"{DAY_PREFIX}%")))
        .all()
    )
    copied_months = {row.key.removeprefix(DAY_PREFIX)[:7] for row in rows if row.key.startswith(DAY_PREFIX)}
    replay_players = {
        c["s"]
        for row in rows
        for day, rarities in row.payload.get("days", {}).items()
        if day >= (now - timedelta(days=RECENT)).date().isoformat()
        for entry in rarities.values()
        if mission_replay.needed(entry, now)
        for c in entry.get("cands", [])
    }
    history = player_games.load(db, players=replay_players) if replay_players else {}
    for saved in rows:
        if saved.key.startswith(LOG_PREFIX) and saved.key.removeprefix(LOG_PREFIX) in copied_months:
            continue
        payload = copy.deepcopy(saved.payload)
        changed = False
        for day, rarities in payload.get("days", {}).items():
            for rarity, original in rarities.items():
                if day >= (now - timedelta(days=RECENT)).date().isoformat() and mission_replay.needed(original, now):
                    replay = mission_replay.reconstruct(original, history, rarity, day, now)
                    # Keep already-settled outcomes when recomputing the pre-day reference.
                    for c in replay["cands"]:
                        prior = next(
                            (
                                old
                                for old in original.get("replay", {}).get("cands", [])
                                if (old["s"], old.get("card"), old.get("g")) == (c["s"], c.get("card"), c.get("g"))
                            ),
                            None,
                        )
                        if prior and "r" in prior:
                            c["r"] = prior["r"]
                    if replay != original.get("replay"):
                        original["replay"] = replay
                        changed = True
            entries = [
                e
                for original in rarities.values()
                for e in ([original, original["replay"]] if original.get("replay") else [original])
            ]
            for entry in entries:
                definitions = {m["key"]: m for m in entry.get("missions", [])}
                for candidate in entry.get("cands", []):
                    targets = {}
                    for key, m in definitions.items():
                        own = next(
                            (
                                p
                                for p in m.get("yours", [])
                                if p["player"] == candidate["s"]
                                and p.get("game") == candidate.get("g")
                                and (not p.get("card") or p["card"] == candidate.get("card"))
                            ),
                            None,
                        )
                        rule = m["rule"]
                        if rule["kind"] == "unsupported" and m.get("source"):
                            rule = _rule(m["source"])
                        if (
                            (key in candidate.get("c", {}) or key in candidate.get("eligible", []) or own)
                            and key not in candidate.get("r", {}).get("did", {})
                            and rule["kind"] in ("decisive", *COUNTS, "score")
                        ):
                            target = (
                                own.get("target")
                                if own and own.get("target") is not None
                                else candidate.get("targets", {}).get(key)
                            )
                            if rule["kind"] != "score" or target is not None:
                                targets[key] = (rule, target)
                    if not targets or not candidate.get("g") or now < _when(candidate["k"]) + SETTLE:
                        continue
                    row = db.get(PlayerGame, (candidate["s"], candidate["g"]))
                    if row is None or row.status in (None, "PENDING") or row.played is None:
                        continue
                    if row.read_at is None or as_utc(row.read_at) < _when(candidate["k"]):
                        continue
                    game = {
                        "pos": candidate.get("pos"),
                        "played": row.played,
                        "stats": {
                            one["stat"]: [one.get("statValue"), one.get("totalScore")] for one in row.stats or []
                        },
                    }
                    outcomes = dict(candidate.get("r", {}).get("did", {}))
                    for key, (rule, target) in targets.items():
                        if rule["kind"] != "score" and row.played and row.stats is None:
                            continue
                        if rule["kind"] == "score" and row.played and row.score is None:
                            continue
                        outcome = bool(row.played) and (
                            float(row.score or 0) >= target
                            if rule["kind"] == "score"
                            else did(rule, definitions[key].get("stats") or [], game)
                        )
                        if outcome is not None:
                            outcomes[key] = outcome
                    if outcomes == candidate.get("r", {}).get("did", {}):
                        continue
                    candidate["r"] = {
                        "played": row.played,
                        "did": outcomes,
                    }
                    changed = True
                    marked += 1
        if changed:
            written = db.execute(
                update(ReadModel)
                .where(ReadModel.key == saved.key, ReadModel.updated_at == saved.updated_at)
                .values(payload=payload, updated_at=now)
                .execution_options(synchronize_session=False)
            )
            months += int(bool(written.rowcount))
            db.expire(saved)  # preserve concurrent imports; a conflict is retried next refresh
    return {"candidates": marked, "months": months}


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
                    cands = [
                        c for c in entry.get("cands", []) if key in (c.get("c") or {}) or key in c.get("eligible", [])
                    ]
                    if (
                        not cands
                        or any(c.get("late") for c in entry.get("cands", []))
                        or entry.get("coverage") == "missing"
                        or not mission.get("sofix")
                        or (mission.get("source") or {}).get("eligibilityComplete") is False
                    ):
                        continue
                    if any(
                        "r" not in c or (not c["r"].get("void") and key not in c["r"].get("did", {})) for c in cands
                    ):
                        pending += 1
                        continue
                    live = {c["s"]: c for c in cands if not c["r"].get("void")}

                    def actual(y: dict[str, Any], rows: list[dict[str, Any]] = cands) -> dict[str, Any] | None:
                        return next(
                            (
                                c
                                for c in rows
                                if c["s"] == y["player"]
                                and (not y.get("game") or c.get("g") == y["game"])
                                and (not y.get("card") or c.get("card") == y["card"])
                            ),
                            None,
                        )

                    identities = mission.get("sofixPicks") or []
                    if any(actual(p) is None for p in identities):
                        continue
                    for p in identities:
                        if chosen := actual(p):
                            live[p["player"]] = chosen
                    achievers = {c["s"] for c in cands if not c["r"].get("void") and c["r"].get("did", {}).get(key)}
                    if not achievers:
                        nobody += 1
                        continue
                    picks = [s for s in mission.get("sofix", []) if s in live]
                    best = min(int(mission.get("picks") or 3), len(achievers))
                    caught_players = {
                        s for s in picks if not live[s]["r"].get("void") and live[s]["r"].get("did", {}).get(key)
                    }
                    got = len(caught_players)
                    counted += 1
                    success += got >= best
                    caught += got
                    best_total += best
                    title = mission.get("title") or key
                    row = by_mission.setdefault(title, {"counted": 0, "success": 0})
                    row["counted"] += 1
                    row["success"] += got >= best
                    for slug in picks:
                        if key in live[slug]["c"]:
                            said.append(float(live[slug]["c"][key]))
                            hits += slug in caught_players
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
                        or (y.get("game") and (a := actual(y)) is not None and not a["r"].get("void"))
                        for y in mine
                    )
                    if (mine or manual) and supported:
                        your_got = sum(
                            1
                            for y in mine
                            if verdict(y) == "SUCCESS"
                            or (
                                verdict(y) in (None, "READY")
                                and (a := actual(y)) is not None
                                and a["r"].get("did", {}).get(key)
                            )
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
                            "picks": [_card(live[s], s in caught_players) for s in picks],
                            "missed": [_card(live[s]) for s in sorted(achievers - caught_players)],
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

    def count(kind: str) -> int:
        found = re.search(r"(\d+)\s*\+\s*" + COUNT_WORDS[kind], text, re.I)
        return int(found[1]) if found else 1

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
            kind = next(k for k, v in COUNTS.items() if v == stats[0])
            return {
                "kind": kind,
                "atLeast": count(kind),
                "label": m["description"],
            }
        if not all(s in stats for s in DECISIVE_STATS) or any(
            s not in (*DECISIVE_STATS, "clean_sheet_60") for s in stats
        ):
            return {"kind": "unsupported", "label": m["description"]}
        return {"kind": "decisive", "label": m["description"]}
    for kind in COUNTS:
        if re.search(COUNT_WORDS[kind], text, re.I):
            return {"kind": kind, "atLeast": count(kind), "label": m["description"]}
    return {"kind": "decisive" if "decisive" in text.lower() else "unsupported", "label": m["description"]}


def _priority(m: dict[str, Any]) -> int:
    source = m.get("source") or {}
    rewards = source.get("rewards") or []
    words = str(rewards).lower() if rewards else source.get("description", "").lower()
    if "cardshardrewardconfig" in words or "essence" in words:
        return 0
    if "clue" in words:
        return 1
    return 2 if "xp" in words or "experience" in words else 3


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
            if before in cand.get("evidence", {}):
                cand["evidence"][after] = cand["evidence"][before]
            if before in cand.get("targets", {}):
                cand["targets"][after] = cand["targets"][before]
            if before in cand.get("historyOnly", []):
                cand["historyOnly"] = list(dict.fromkeys([*cand["historyOnly"], after]))
            if before in cand.get("eligible", []):
                cand["eligible"] = list(dict.fromkeys([*cand["eligible"], after]))
    frozen_ids = {(c.get("card") or c["s"], c.get("g")) for c in frozen}
    cands = frozen[:]
    sheets = pool.get("sheets", {}).get("players", {})
    players = {p.get("card") or p["player"]: {**p, "games": list(p.get("games", []))} for p in pool.get("players", [])}
    for m in missions:
        for card in (m.get("source") or {}).get("inventory", []):
            if card["card"] not in players:
                known = next(
                    (p for p in players.values() if p["player"] == card["player"] and p["rarity"] == rarity), None
                )
                players[card["card"]] = {
                    **(known or {}),
                    "card": card["card"],
                    "player": card["player"],
                    "name": card["name"],
                    "pos": card["pos"],
                    "pic": card["pic"],
                    "rarity": rarity,
                    "p": (known or {}).get("p", 0),
                    "games": list((known or {}).get("games", [])),
                }
            p = players[card["card"]]
            if not any(g.get("id") == card["game"].get("id") for g in p["games"]):
                p["games"].append({**card["game"], "availabilityKnown": False})
    for p in players.values():
        if p["rarity"] != rarity:
            continue
        for g in p.get("games", []):
            if (
                mission_day(_when(g["kickoff"])) != mission_day(now)
                and not any(g.get("id") in (m.get("source") or {}).get("eligibleCards", {}) for m in missions)
            ) or (p.get("card") or p["player"], g.get("id")) in frozen_ids:
                continue
            if any(
                (c.get("card") or c["s"]) == (p.get("card") or p["player"]) and c.get("g") == g.get("id") for c in cands
            ):
                continue
            late = _when(g["kickoff"]) <= now
            chances, targets, history_only, eligible = {}, {}, [], []
            for m in missions:
                source = m.get("source") or {}
                eligibility = source.get("eligibleCards")
                if (
                    (eligibility is not None and p.get("card") not in eligibility.get(g.get("id"), []))
                    or (source.get("ruleTypes") and eligibility is None)
                    or (eligibility is None and p.get("eligibility"))
                ):
                    continue
                eligible.append(m["key"])
                target = next(
                    (
                        c.get("target")
                        for c in source.get("inventory", [])
                        if c.get("card") == p.get("card") and c["game"].get("id") == g.get("id")
                    ),
                    None,
                )
                if target is not None and not late:
                    targets[m["key"]] = target
                kind = m["rule"]["kind"]
                form = sheets.get(p["player"], {}).get("form")
                if form:
                    value = mission_form.chance(m["rule"], p, g, form, target)
                    if value is not None and not late:
                        chances[m["key"]] = value
                        if kind == "score" or g.get("availabilityKnown", p.get("availabilityKnown")) is False:
                            history_only.append(m["key"])
                        if target is not None:
                            targets[m["key"]] = target
                    continue
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
                    "sheet": sheets.get(p["player"]),
                    "targets": targets,
                    "historyOnly": history_only,
                    "match": g,
                    "eligible": eligible,
                    "captured": now.isoformat(),
                    "late": late,
                }
            )
    used: set[str] = set()
    for m in missions:
        m["bestPicks"] = [
            p for p in m.get("bestPicks", []) if (p.get("card") or p["player"], p.get("game")) in frozen_ids
        ]
        if "sofixPicks" in m:
            m["sofixPicks"] = [
                p for p in m["sofixPicks"] if (p.get("card") or p["player"], p.get("game")) in frozen_ids
            ]
            m["sofix"] = [p["player"] for p in m["sofixPicks"]]
            used.update(p.get("card") or p["player"] for p in m["sofixPicks"])
        else:
            frozen_picks = [s for s in m["sofix"] if any(c["s"] == s for c in frozen)]
            m["sofix"] = frozen_picks
            used.update(frozen_picks)
            m["sofixPicks"] = []
    pairs = sorted(
        [
            (float(c["c"][m["key"]]), c, m)
            for m in missions
            for c in cands
            if not c.get("late") and m["key"] in c["c"] and c["c"][m["key"]] > 0 and _when(c["k"]) > now
        ],
        key=lambda x: (_priority(x[2]), -x[0]),
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
    for m in missions:
        choices = sorted(
            [c for c in cands if not c.get("late") and m["key"] in c["c"] and _when(c["k"]) > now],
            key=lambda c: -c["c"][m["key"]],
        )
        for cand in choices:
            if len(m["bestPicks"]) >= m["picks"] or any(p["player"] == cand["s"] for p in m["bestPicks"]):
                continue
            m["bestPicks"].append(
                {"player": cand["s"], "card": cand.get("card"), "game": cand.get("g"), "rarity": rarity, "status": None}
            )
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
