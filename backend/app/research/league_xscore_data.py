"""Null-preserving, resumable PL/Bundesliga Sorare outcomes for independent xScore validation.

No database access, credentials in output, production model writes or forecasts. The
holdout is fixed before collection; historical projections are deliberately excluded
because their pre-lock publication time is not established.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import time
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from app.sorare.client import SorareClient, SorareError
from app.sorare.model import SORARE_POSITION

LEAGUES = {"PL": "premier-league-gb-eng", "BL1": "bundesliga-de"}
START = datetime(2023, 7, 1, tzinfo=UTC)
END = datetime(2026, 7, 1, tzinfo=UTC)
PROTOCOL = {
    "version": 1,
    "trainSeasons": [2023, 2024],
    "holdoutSeason": 2025,
    "scoringVersion": 7,
    "candidate": "existing keeper/outfield architectures, independently fitted, no Sorare projection",
    "football": "independent fixed reference, xi=.001 ridge=1 promoted=0 spread=1.10, fit strictly before Sorare lock",
    "baseline": "own last five starts with two starts of prior at 51; league position mean also reported",
    "ablation": "independently fitted same player-history model with FDR inputs removed; FDR must also improve this comparator",
    "primary": "RMSE on authentic version-7 starts, same cases; paired whole-Sorare-week bootstrap 95% CI",
    "releaseGate": "both leagues independently: >=100 holdout starts per position, RMSE difference CI upper <0 against form and no-FDR ablation, no position RMSE loss, no loss in within-7 or pair ordering",
    "secondary": ["within7", "same-position within-game ranking", "per-position RMSE", "coverage"],
    "bootstrapSeed": 20261021,
    "bootstrapDraws": 2000,
    "claim": "retrospective held-out validation, never freshly blind or proof of pre-lock historical availability",
    "noPromotion": "collector/evaluation never enables a production model; separately inspect outcome/coverage gates first",
}

LIST_QUERY = """
query($league:String!,$after:String){ football { competition(slug:$league) { pastGames(first:35,after:$after) {
 nodes {id date statusTyped homeGoals awayGoals homeTeam {slug name} awayTeam {slug name}}
 pageInfo {hasNextPage endCursor}
} } } }
"""
GAME_FIELDS = """
fragment XScoreGame on Game {
 id date statusTyped competition {slug} homeGoals awayGoals homeTeam {slug name} awayTeam {slug name}
 homeFormation {startingLineupAvailable startingLineup {slug} bench {slug}}
 awayFormation {startingLineupAvailable startingLineup {slug} bench {slug}}
 playerGameScores { score scoreStatus scoringVersion positionTyped anyPlayer {slug}
   anyPlayerGameStats {playedInGame ... on PlayerGameStats {gameStarted minsPlayed anyTeam {slug}}}
   ... on PlayerGameScore {decisiveScore {totalScore}} }
}
"""
GAME_QUERY = "query($id:ID!){anyGame(id:$id){...XScoreGame}}" + GAME_FIELDS
WINDOW_QUERY = """
query($after:String){so5{so5Fixtures(first:50,after:$after,eventType:CLASSIC,sport:FOOTBALL){
 nodes{slug startDate endDate cutOffDate} pageInfo{hasNextPage endCursor}
}}}
"""


def windows(client: Any) -> list[dict[str, str]]:
    """Actual Sorare cutoffs, never a guessed Tuesday/Friday historical calendar."""
    out = {}
    after = None
    cursors: set[str] = set()
    for _ in range(100):
        page = client.query(WINDOW_QUERY, {"after": after})["so5"]["so5Fixtures"]
        reached = False
        for row in page.get("nodes") or []:
            reached |= when(row["endDate"]) < START
            if when(row["startDate"]) < END and when(row["endDate"]) >= START:
                out[row["slug"]] = row
        info = page.get("pageInfo") or {}
        if reached or not info.get("hasNextPage"):
            return sorted(out.values(), key=lambda row: row["startDate"])
        after = info.get("endCursor")
        if not after or after in cursors:
            raise ValueError("Incomplete Sorare window cursor")
        cursors.add(after)
    raise ValueError("Sorare windows exceeded page budget")


def when(value: str) -> datetime:
    return datetime.fromisoformat(value.replace("Z", "+00:00")).astimezone(UTC)


def player(raw: dict[str, Any]) -> dict[str, Any]:
    stats = raw.get("anyPlayerGameStats") or {}
    return {
        "slug": (raw.get("anyPlayer") or {}).get("slug"),
        "pos": SORARE_POSITION.get(raw.get("positionTyped") or ""),
        "team": (stats.get("anyTeam") or {}).get("slug"),
        "score": raw.get("score"),
        "status": raw.get("scoreStatus"),
        "ver": raw.get("scoringVersion"),
        "level": (raw.get("decisiveScore") or {}).get("totalScore"),
        "played": stats.get("playedInGame"),
        "started": stats.get("gameStarted"),
        "mins": stats.get("minsPlayed"),
    }


def fetch_games(client: Any, games: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """At most ten games per key-backed query; never a per-player query loop."""
    if len(games) == 1:
        return [client.query(GAME_QUERY, {"id": games[0]["id"]})["anyGame"]]
    variables = {f"id{i}": g["id"] for i, g in enumerate(games)}
    declarations = ",".join(f"${key}:ID!" for key in variables)
    fields = " ".join(f"g{i}:anyGame(id:$id{i}){{...XScoreGame}}" for i in range(len(games)))
    result = client.query(f"query({declarations}){{{fields}}}" + GAME_FIELDS, variables)
    return [result[f"g{i}"] for i in range(len(games))]


def game_list(client: Any, code: str) -> list[dict[str, Any]]:
    league = LEAGUES.get(code)
    if not league:
        raise ValueError("Only PL and BL1 are authorized")
    after = None
    cursors: set[str] = set()
    found: dict[str, dict[str, Any]] = {}
    for _ in range(200):
        page = client.query(LIST_QUERY, {"league": league, "after": after})["football"]["competition"]["pastGames"]
        reached = False
        for node in page.get("nodes") or []:
            date = when(node["date"])
            reached |= date < START
            if START <= date < END and node.get("statusTyped") == "played":
                ident = node["id"]
                if ident in found and found[ident] != node:
                    raise ValueError("Conflicting source fixture identity")
                found[ident] = node
        info = page.get("pageInfo") or {}
        if reached or not info.get("hasNextPage"):
            return sorted(found.values(), key=lambda row: (row["date"], row["id"]))
        after = info.get("endCursor")
        if not after or after in cursors:
            raise ValueError("Incomplete source list: repeated or missing cursor")
        cursors.add(after)
    raise ValueError("Source list exceeded the page budget")


def validate_game(code: str, expected: dict[str, Any], raw: dict[str, Any], at: datetime) -> dict[str, Any]:
    if raw.get("id") != expected["id"] or (raw.get("competition") or {}).get("slug") != LEAGUES[code]:
        raise ValueError("Source game identity or competition mismatch")
    if raw.get("statusTyped") != "played" or when(raw["date"]) != when(expected["date"]):
        raise ValueError("Source game date/status changed; re-enumerate before evaluating")
    people = [player(row) for row in raw.get("playerGameScores") or []]
    if any(not p["slug"] for p in people) or len({p["slug"] for p in people}) != len(people):
        raise ValueError("Missing or duplicate player identity")
    return {"readAt": at.isoformat(), "competition": code, "raw": raw, "players": people}


def collect(
    client: Any,
    code: str,
    expected: list[dict[str, Any]],
    root: Path,
    *,
    limit: int | None = None,
    seconds: float = 2700,
) -> dict[str, Any]:
    folder = root / code
    folder.mkdir(parents=True, exist_ok=True)
    (folder / "games.json").write_text(json.dumps(expected), encoding="utf-8")
    protocol = json.dumps(PROTOCOL, sort_keys=True)
    (root / "protocol.json").write_text(protocol, encoding="utf-8")
    calls = 0
    failed: list[dict[str, str]] = []
    completed = []
    started = time.monotonic()
    pending = []
    for game in expected:
        ident = str(game["id"])
        # Provider IDs are opaque: hash them, never put an ID into a filesystem path.
        path = folder / (hashlib.sha256(ident.encode()).hexdigest() + ".json")
        if path.exists():
            saved = json.loads(path.read_text("utf-8"))
            validate_game(code, game, saved["raw"], when(saved["readAt"]))
            completed.append(ident)
            continue
        pending.append(game)
    if limit is not None:
        pending = pending[:limit]
    for offset in range(0, len(pending), 10):
        if time.monotonic() - started > seconds:
            break
        batch = pending[offset : offset + 10]
        try:
            raw_games = fetch_games(client, batch)
            rows = [
                validate_game(code, game, raw, datetime.now(UTC)) for game, raw in zip(batch, raw_games, strict=True)
            ]
        except (SorareError, ValueError, KeyError, TypeError) as error:
            failed.extend({"id": game["id"], "reason": str(error)[:300]} for game in batch)
            if len(failed) >= 3:
                break
            continue
        for row in rows:
            ident = row["raw"]["id"]
            path = folder / (hashlib.sha256(ident.encode()).hexdigest() + ".json")
            path.write_text(json.dumps(row, separators=(",", ":")), encoding="utf-8")
            completed.append(ident)
            calls += 1
        print(f"{code}: kept {len(completed)}/{len(expected)} authentic game responses", flush=True)
    result = {
        "competition": code,
        "expected": len(expected),
        "saved": len(completed),
        "new": calls,
        "failed": failed,
        "complete": len(completed) == len(expected) and bool(expected),
        "protocolSha256": hashlib.sha256(protocol.encode()).hexdigest(),
    }
    (folder / "coverage.json").write_text(json.dumps(result, indent=2), encoding="utf-8")
    return result


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--league", choices=LEAGUES, required=True)
    parser.add_argument("--out", type=Path, default=Path("data/raw/league-xscore"))
    parser.add_argument("--limit", type=int)
    parser.add_argument("--seconds", type=float, default=2700)
    args = parser.parse_args()
    with SorareClient(pause=0.5) as client:
        if not client.api_key:
            raise RuntimeError("Collector requires the existing configured Sorare read-only key")
        games = game_list(client, args.league)
        spans = windows(client)
        folder = args.out / args.league
        folder.mkdir(parents=True, exist_ok=True)
        (folder / "windows.json").write_text(json.dumps(spans), encoding="utf-8")
        result = collect(client, args.league, games, args.out, limit=args.limit, seconds=args.seconds)
        result["sourceCalls"] = client.calls
    print(json.dumps(result))
    return 0 if result["complete"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
