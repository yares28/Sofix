"""Adapt permanent games to the Audit's existing figures; historical records remain a fallback, never duplicated."""

from __future__ import annotations

import copy
from datetime import datetime
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session, load_only

from app.models import PlayerGame, ReadModel
from app.services.timeutil import as_utc
from app.sorare import ff_chances, starts, versus
from app.sorare.publish import SETTLE

COLUMNS = {"futbolfantasy": "ff_start", "sorare": "sorare_start", "sofix": "sofix_start"}


def _dt(value: str) -> datetime:
    return as_utc(datetime.fromisoformat(value))


def _due(record: dict[str, Any], now: datetime) -> bool:
    week = record.get("gameweek") or {}
    if week.get("end"):
        return now >= _dt(week["end"]) + SETTLE
    # Older records only held kickoffs: retain their established day-after-last-game rule.
    return versus.due({**record, "settledAt": None}, now)


def actual(row: PlayerGame | None, due: bool) -> dict[str, Any] | None:
    if not due or row is None or row.status in (None, "PENDING") or row.played is None or row.started is None:
        return None
    return {"started": row.started, "played": row.played, "score": row.score, "mins": row.mins}


def read(db: Session, now: datetime, floor: int) -> tuple[dict[str, Any], list[dict[str, Any]], dict[str, Any]]:
    saved = db.get(ReadModel, starts.START_KEY)
    record = copy.deepcopy(saved.payload) if saved and isinstance(saved.payload, dict) else {}
    weeks = record.setdefault("weeks", {})
    scores = [copy.deepcopy(r) for _, r in versus.records(db)]
    rows = {
        (row.player, row.game_id): row
        for row in db.scalars(
            select(PlayerGame).options(
                load_only(
                    PlayerGame.player,
                    PlayerGame.game_id,
                    PlayerGame.date,
                    PlayerGame.status,
                    PlayerGame.played,
                    PlayerGame.started,
                    PlayerGame.score,
                    PlayerGame.mins,
                    PlayerGame.said_at,
                    PlayerGame.ff_start,
                    PlayerGame.sorare_start,
                    PlayerGame.sofix_start,
                    PlayerGame.sofix_x,
                    PlayerGame.sorare_x,
                    PlayerGame.ff_xi,
                )
            )
        )
    }
    for score_record in scores:
        gameweek = score_record.get("gameweek") or {}
        if not gameweek.get("slug") or not gameweek.get("lock"):
            continue
        due = _due(score_record, now)
        lock = _dt(gameweek["lock"])
        week = weeks.setdefault(gameweek["slug"], {"lock": gameweek["lock"], "players": {}})
        for player, entry in (score_record.get("players") or {}).items():
            kept = week.setdefault("players", {}).setdefault(player, {"games": {}})
            if (
                score_record.get("writtenAt")
                and _dt(score_record["writtenAt"]) < lock
                and entry.get("mu") is not None
                and entry.get("pPlay") is not None
            ):
                first = next(iter(entry.get("games") or []), {})
                kept["model"] = {
                    "mu": entry["mu"],
                    "pPlay": entry["pPlay"],
                    "pos": entry.get("pos"),
                    "pStart": entry.get("pStart"),
                    "startSource": entry.get("startSource"),
                    "startOdds": (first.get("sources") or {}).get("sorare"),
                }
            for game in entry.get("games") or []:
                cell = kept.setdefault("games", {}).setdefault(game["id"], {})
                cell["info"] = {key: game.get(key) for key in ("kickoff", "competition", "home", "away")}
                row = rows.get((player, game["id"]))
                if score_record.get("writtenAt") and _dt(score_record["writtenAt"]) >= lock:
                    game["sofix"], game["sorare"] = None, None
                if row and row.said_at and as_utc(row.said_at) < lock:
                    for source, column in COLUMNS.items():
                        chance = getattr(row, column)
                        if chance is not None:
                            cell[source] = {"chance": chance, "at": as_utc(row.said_at).isoformat()}
                    for key, value in (("sofix", row.sofix_x), ("sorare", row.sorare_x)):
                        if value is not None:
                            game[key] = value
                result = actual(row, due)
                if result is not None:
                    cell.update(result)
                    game["actual"] = result
                elif game.get("actual"):
                    cell.update(game["actual"])  # an older settled record is still evidence
        all_games = [
            game for entry in (score_record.get("players") or {}).values() for game in entry.get("games") or []
        ]
        if all_games and all("actual" in game for game in all_games):
            score_record["settledAt"] = now.isoformat()
    # Older owner-only start records may have no score_record counterpart. Their known games can still finish.
    score_weeks = {(score.get("gameweek") or {}).get("slug") for score in scores}
    for slug, week in weeks.items():
        if slug in score_weeks:
            continue
        games = [
            (rows.get((player, gid)), cell)
            for player, entry in (week.get("players") or {}).items()
            for gid, cell in (entry.get("games") or {}).items()
        ]
        dates = [as_utc(row.date) for row, _ in games if row is not None]
        due = bool(dates) and now >= max(dates) + SETTLE
        for row, cell in games:
            if (result := actual(row, due)) is not None:
                cell.update(result)
    ff = db.get(ReadModel, ff_chances.KEY)
    return record, scores, elevens(scores, rows, ff.payload if ff else {}, now, floor)


def _eleven(side: dict[str, Any], chances: dict[str, float]) -> set[str] | None:
    """The same slot/line swaps as frontend/lib/lineups.ts::byChance: known numbers only; ties keep FF's starter."""
    people = side.get("players") or {}
    chosen = [pid for pid, one in people.items() if one.get("xi")]
    bench = [pid for pid in people if pid not in chosen]
    if not chances or any(not people[pid].get("line") for pid in chosen):
        return None
    for line in dict.fromkeys(people[pid]["line"] for pid in chosen):
        while True:
            slots = [pid for pid in chosen if people[pid].get("line") == line and pid in chances]
            available = [
                pid
                for pid in bench
                if people[pid].get("line") == line
                and pid in chances
                and people[pid].get("kind") not in ("out", "suspended")
            ]
            if not slots or not available:
                break
            worst, best = min(slots, key=chances.__getitem__), max(available, key=chances.__getitem__)
            if chances[best] <= chances[worst]:
                break
            chosen[chosen.index(worst)] = best
            bench = [worst, *[pid for pid in bench if pid != best]]
    return set(chosen)


def elevens(
    scores: list[dict[str, Any]], rows: dict[tuple[str, str], PlayerGame], ff: dict[str, Any], now: datetime, floor: int
) -> dict[str, Any]:
    linked: dict[tuple[str, str], tuple[PlayerGame, int, bool]] = {}
    for record in scores:
        number = (record.get("gameweek") or {}).get("number")
        if number is None:
            continue
        for player, entry in (record.get("players") or {}).items():
            for game in entry.get("games") or []:
                row = rows.get((player, game["id"]))
                mid, pid = (game.get("ffMatch") or {}).get("id"), game.get("ffPlayer")
                lock = (record.get("gameweek") or {}).get("lock")
                if (
                    row is not None
                    and row.said_at
                    and lock
                    and as_utc(row.said_at) < _dt(lock)
                    and mid is not None
                    and pid is not None
                ):
                    linked[str(mid), str(pid)] = row, number, _due(record, now)
    groups: dict[tuple[str, Any], dict[str, Any]] = {}
    crests: dict[str, str | None] = {}

    def group(kind: str, key: Any) -> dict[str, Any]:
        return groups.setdefault(
            (kind, key), {source: {"picked": 0, "checked": 0, "started": 0, "rate": None} for source in COLUMNS}
        )

    group("all", "all")
    for mid, match in (ff.get("matches") or {}).items():
        reading = match.get("atLock") or {}
        for name in ("home", "away"):
            side = reading.get(name) or {}
            if not side.get("published"):
                continue
            people = side.get("players") or {}
            club = side.get("club") or side.get("name")
            if club:
                crests[club] = side.get("crest")
            for source, column in COLUMNS.items():
                chances = {
                    pid: value
                    for pid in people
                    if (found := linked.get((mid, pid))) and (value := getattr(found[0], column)) is not None
                }
                chosen = (
                    {pid for pid in people if (found := linked.get((mid, pid))) and found[0].ff_xi is True}
                    if source == "futbolfantasy"
                    else _eleven(side, chances)
                )
                for pid in chosen or ():
                    found = linked.get((mid, pid))
                    if found is None:
                        continue
                    row, number, due = found
                    for tally in (
                        group("all", "all"),
                        group("week", number),
                        *([group("club", club)] if club else []),
                    ):
                        tally[source]["picked"] += 1
                        if actual(row, due) is not None:
                            tally[source]["checked"] += 1
                            tally[source]["started"] += bool(row.started)
    for tally in groups.values():
        for cell in tally.values():
            if cell["checked"] >= floor:
                cell["rate"] = round(cell["started"] / cell["checked"], 4)
    return {
        "all": groups["all", "all"],
        "weeks": sorted(
            [{"week": key, "sources": tally} for (kind, key), tally in groups.items() if kind == "week"],
            key=lambda row: row["week"],
            reverse=True,
        ),
        "clubs": [
            {"club": key, "crest": crests.get(key), "sources": tally}
            for (kind, key), tally in sorted(groups.items(), key=lambda g: str(g[0][1]))
            if kind == "club"
        ],
    }
