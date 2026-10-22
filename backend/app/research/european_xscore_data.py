"""Collect authentic European outcomes without enabling forecasts or reading model metrics.

This source-only job retains administrative and missing-XI responses. UEFA calendar
alignment and per-competition validation are separate gates, never inferred from the
number of responses Sorare returned. Existing domestic protocols remain unchanged.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import time
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any

import httpx

from app.research.european_data import COMPETITIONS, fetch_inventory, sorare_clubs
from app.research.league_xscore_data import END, GAME_QUERY, WINDOW_QUERY, player, when
from app.sorare.client import SorareClient, SorareError

INDEX_QUERY = """
query($slug:String!,$after:String){football{competition(slug:$slug){slug
 pastGames(first:50,after:$after){nodes{id date statusTyped homeGoals awayGoals
 homeTeam{slug name} awayTeam{slug name}} pageInfo{hasNextPage endCursor}}
}}}
"""
SOURCE_PROTOCOL = {
    "version": 1,
    "trainSeasons": [2023, 2024],
    "holdoutSeason": 2025,
    "competitions": list(COMPETITIONS),
    "scoringVersion": 7,
    "population": "All UEFA calendar phases, all current clubs and football players; reconcile before evaluation",
    "outcomes": "Authentic game scores, roles, starts, minutes and scoring versions; missing is never zero",
    "eligibility": "Require actual official starters and final scores; preserve every incomplete or administrative source case for review",
    "history": "Strictly before actual Sorare lock; no reconstructed historical projection or starting probability",
    "release": "No model promotion from this collector; freeze evaluation candidates and gates separately before metrics",
    "exceptions": "None inferred from domestic approvals; no silent qualifier or holdout exclusions",
    "indexStart": "2023-06-01T00:00:00+00:00",
}
START = datetime(2023, 6, 1, tzinfo=UTC)
INDEX_PERIOD = {"start": START.isoformat(), "end": END.isoformat()}


def current_cache_fresh(cached: dict[str, Any], now: datetime) -> bool:
    return bool(cached.get("at") and timedelta(0) <= now - when(cached["at"]) < timedelta(hours=6))


def european_windows(client: Any) -> list[dict[str, Any]]:
    after = None
    cursors: set[str] = set()
    found = {}
    for _ in range(100):
        page = client.query(WINDOW_QUERY, {"after": after})["so5"]["so5Fixtures"]
        reached = False
        for row in page["nodes"]:
            reached |= when(row["endDate"]) < START
            if when(row["startDate"]) < END and when(row["endDate"]) >= START:
                found[row["slug"]] = row
        info = page["pageInfo"]
        if reached or not info["hasNextPage"]:
            return sorted(found.values(), key=lambda row: row["startDate"])
        after = info.get("endCursor")
        if not after or after in cursors:
            raise ValueError("Missing or repeated European Sorare window cursor")
        cursors.add(after)
    raise ValueError("European Sorare window pagination budget exceeded")


def game_index(client: Any, code: str) -> list[dict[str, Any]]:
    after = None
    cursors: set[str] = set()
    found: dict[str, dict[str, Any]] = {}
    previous_date: datetime | None = None
    for _ in range(150):
        competition = client.query(INDEX_QUERY, {"slug": COMPETITIONS[code].sorare, "after": after})["football"][
            "competition"
        ]
        if not competition or competition.get("slug") != COMPETITIONS[code].sorare:
            raise ValueError("Wrong Sorare competition identity")
        page = competition["pastGames"]
        reached = False
        for raw in page["nodes"]:
            date = when(raw["date"])
            if previous_date is not None and date > previous_date:
                raise ValueError("Sorare past-game order changed; cannot use a date stopping rule")
            previous_date = date
            reached |= date < START
            if START <= date < END:
                ident = raw["id"]
                if ident in found and raw != found[ident]:
                    raise ValueError("Conflicting Sorare source identity")
                found[ident] = raw
        info = page["pageInfo"]
        if reached or not info["hasNextPage"]:
            if not found:
                raise ValueError("Empty Sorare source index")
            return sorted(found.values(), key=lambda row: (row["date"], row["id"]))
        after = info.get("endCursor")
        if not after or after in cursors:
            raise ValueError("Missing or repeated Sorare past-game cursor")
        cursors.add(after)
    raise ValueError("Sorare past-game index budget exceeded")


def game_snapshot(code: str, expected: dict[str, Any], raw: dict[str, Any]) -> dict[str, Any]:
    if raw.get("id") != expected["id"] or (raw.get("competition") or {}).get("slug") != COMPETITIONS[code].sorare:
        raise ValueError("Wrong Sorare game or competition identity")
    if when(raw["date"]) != when(expected["date"]):
        raise ValueError("Sorare date changed; re-enumerate source index")
    for side in ("homeTeam", "awayTeam"):
        if (raw.get(side) or {}).get("slug") != (expected.get(side) or {}).get("slug"):
            raise ValueError("Sorare actual team changed; re-enumerate source index")
    people = [player(row) for row in raw.get("playerGameScores") or []]
    if any(not p["slug"] for p in people) or len({p["slug"] for p in people}) != len(people):
        raise ValueError("Missing or duplicate score identity")
    return {
        "schemaVersion": 1,
        "competition": code,
        "readAt": datetime.now(UTC).isoformat(),
        "raw": raw,
        "players": people,
        "modelEligible": False,
    }


def starting_eleven(formation: dict[str, Any]) -> bool:
    def flattened(value: Any) -> list[str]:
        if isinstance(value, list):
            return [slug for row in value for slug in flattened(row)]
        return [str(value.get("slug") or "")] if isinstance(value, dict) else [""]

    people = flattened(formation.get("startingLineup"))
    return bool(formation.get("startingLineupAvailable") and len(people) == len(set(people)) == 11 and all(people))


def collect(
    client: Any, code: str, expected: list[dict[str, Any]], folder: Path, *, seconds: float = 2400
) -> dict[str, Any]:
    games_folder = folder / "games"
    games_folder.mkdir(parents=True, exist_ok=True)
    started = time.monotonic()
    saved = 0
    errors = []
    missing_xi = []
    for game in expected:
        if time.monotonic() - started >= seconds:
            break
        path = games_folder / (hashlib.sha256(game["id"].encode()).hexdigest() + ".json")
        try:
            if path.exists():
                stored = json.loads(path.read_text(encoding="utf-8"))
                if stored.get("schemaVersion") != 1 or stored.get("competition") != code:
                    raise ValueError("Wrong cached source schema or competition")
                raw = stored["raw"]
                game_snapshot(code, game, raw)
            else:
                raw = client.query(GAME_QUERY, {"id": game["id"]})["anyGame"]
                snapshot = game_snapshot(code, game, raw)
                path.write_text(json.dumps(snapshot, separators=(",", ":")), encoding="utf-8")
            saved += 1
            if any(not starting_eleven(raw.get(f"{side}Formation") or {}) for side in ("home", "away")):
                missing_xi.append(game["id"])
        except (SorareError, ValueError, KeyError, TypeError) as error:
            errors.append({"id": game["id"], "error": str(error)[:300]})
            if len(errors) >= 3:
                break
        if saved and saved % 50 == 0:
            print(f"{code}: retained {saved}/{len(expected)} source responses", flush=True)
    result = {
        "competition": code,
        "expected": len(expected),
        "saved": saved,
        "errors": errors,
        "sourceComplete": bool(expected) and saved == len(expected) and not errors,
        "missingStartingXI": missing_xi,
        "uefaAligned": False,
        "modelEligible": False,
    }
    (folder / "coverage.json").write_text(json.dumps(result, indent=2), encoding="utf-8")
    return result


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--league", choices=COMPETITIONS, required=True)
    parser.add_argument("--out", type=Path, default=Path("data/raw/european-xscore"))
    parser.add_argument("--seconds", type=float, default=2400)
    parser.add_argument("--index-only", action="store_true")
    args = parser.parse_args()
    folder = args.out / args.league
    folder.mkdir(parents=True, exist_ok=True)
    (folder / "source-protocol.json").write_text(
        json.dumps(SOURCE_PROTOCOL, sort_keys=True, indent=2), encoding="utf-8"
    )
    with httpx.Client(
        timeout=45, headers={"User-Agent": "Sofix/1.0 (personal, cached UEFA source verification)"}
    ) as client:
        for season in (2023, 2024, 2025, 2026):
            inventory = fetch_inventory(client, args.league, season, folder / "uefa")
            print(
                f"{args.league} {season}: UEFA {len(inventory['fixtures'])} entries; {inventory['phases']}", flush=True
            )
            time.sleep(2)
    with SorareClient(pause=0.75) as client:
        if not client.api_key:
            raise RuntimeError("Source job requires the existing configured read-only Sorare key")
        current_path = folder / "clubs.json"
        current = json.loads(current_path.read_text(encoding="utf-8")) if current_path.exists() else {}
        if not current_cache_fresh(current, datetime.now(UTC)):
            clubs = sorare_clubs(client.query, args.league)
            current = {"competition": args.league, "at": datetime.now(UTC).isoformat(), "clubs": clubs}
            current_path.write_text(json.dumps(current, indent=2), encoding="utf-8")
        print(
            f"{args.league}: retained {len(current['clubs'])} Sorare club identities (not yet current UEFA squad alignment)",
            flush=True,
        )
        index_path = folder / "index.json"
        index_period = folder / "index-period.json"
        same_period = index_period.exists() and json.loads(index_period.read_text(encoding="utf-8")) == INDEX_PERIOD
        if index_path.exists() and same_period:
            index = json.loads(index_path.read_text(encoding="utf-8"))
        else:
            index = game_index(client, args.league)
            index_path.write_text(json.dumps(index), encoding="utf-8")
            index_period.write_text(json.dumps(INDEX_PERIOD), encoding="utf-8")
        print(f"{args.league}: source index {len(index)} games, all statuses retained", flush=True)
        windows_path = folder / "windows.json"
        if not windows_path.exists() or not same_period:
            windows_path.write_text(json.dumps(european_windows(client)), encoding="utf-8")
        if args.index_only:
            return 0
        result = collect(client, args.league, index, folder, seconds=args.seconds)
    print(json.dumps(result))
    return 0 if result["sourceComplete"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
