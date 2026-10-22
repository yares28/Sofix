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

import pandas as pd

from app.backtest.data import normalize_season
from app.research.league_xscore_identity import club_name
from app.services.league_fdr import FL1_ADMIN
from app.services.league_fdr import LEAGUES as FOOTBALL_LEAGUES
from app.sorare.client import SorareClient, SorareError
from app.sorare.model import SORARE_POSITION
from app.sources.football_data_co_uk import fetch_season_csv

LEAGUES = {"PL": "premier-league-gb-eng", "BL1": "bundesliga-de", "FL1": "ligue-1-fr"}
DIVISIONS = {**{code: league[1] for code, league in FOOTBALL_LEAGUES.items()}, "FL1": "F1"}
START = datetime(2023, 7, 1, tzinfo=UTC)
END = datetime(2026, 7, 1, tzinfo=UTC)
PROTOCOL: dict[str, Any] = {
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
   anyPlayerGameStats {playedInGame ... on PlayerGameStats {gameStarted minsPlayed cleanSheet60 goalsConceded anyTeam {slug}}}
   ... on PlayerGameScore {decisiveScore {totalScore}} }
}
"""
GAME_QUERY = "query($id:ID!){anyGame(id:$id){...XScoreGame}}" + GAME_FIELDS
DATE_QUERY = """
query($from:ISO8601DateTime!,$to:ISO8601DateTime!){
 competitionGames(fromDate:$from,toDate:$to,sport:FOOTBALL){competition{slug} games{
 id date ... on Game {statusTyped homeGoals awayGoals homeTeam{slug name} awayTeam{slug name}}
 }}
}
"""
CLUB_QUERY = """
query($club:String!,$from:ISO8601DateTime!,$to:ISO8601DateTime!){football{club(slug:$club){
 games(first:50,startDate:$from,endDate:$to){nodes{
 id date competition{slug} statusTyped homeGoals awayGoals homeTeam{slug name} awayTeam{slug name}
 } pageInfo{hasNextPage}}
}}}
"""
PLAYER_GAMES_QUERY = """
query($player:String!,$from:ISO8601DateTime!,$to:ISO8601DateTime!){anyPlayer(slug:$player){... on Player{
 allPlayerGameScores(from:$from,to:$to,first:40){nodes{anyGame{
 id date competition{slug} ... on Game{statusTyped homeGoals awayGoals homeTeam{slug name} awayTeam{slug name}}
 }} pageInfo{hasNextPage}}
}}}
"""
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
    started = stats.get("gameStarted")
    return {
        "slug": (raw.get("anyPlayer") or {}).get("slug"),
        "pos": SORARE_POSITION.get(raw.get("positionTyped") or ""),
        "team": (stats.get("anyTeam") or {}).get("slug"),
        "score": raw.get("score"),
        "status": raw.get("scoreStatus"),
        "ver": raw.get("scoringVersion"),
        "level": (raw.get("decisiveScore") or {}).get("totalScore"),
        "played": stats.get("playedInGame"),
        "started": bool(started) if started in (0, 1) else None,
        "mins": stats.get("minsPlayed"),
        "cleanSheet60": stats.get("cleanSheet60"),
        "goalsConceded": stats.get("goalsConceded"),
    }


def fetch_games(client: Any, games: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Federation rejects repeated anyGame roots; read each game once, never each player."""
    return [client.query(GAME_QUERY, {"id": game["id"]})["anyGame"] for game in games]


def game_list(client: Any, code: str, *, start: datetime = START, end: datetime = END) -> list[dict[str, Any]]:
    league = LEAGUES.get(code)
    if not league:
        raise ValueError("Only the requested foreign leagues are authorized")
    after = None
    cursors: set[str] = set()
    found: dict[str, dict[str, Any]] = {}
    for _ in range(200):
        page = client.query(LIST_QUERY, {"league": league, "after": after})["football"]["competition"]["pastGames"]
        reached = False
        for node in page.get("nodes") or []:
            date = when(node["date"])
            reached |= date < start
            if start <= date < end and node.get("statusTyped") == "played":
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


def eligible_calendar(code: str, calendar: pd.DataFrame) -> pd.DataFrame:
    """Predeclared interrupted Ligue 1 training fixture; official table result is retained elsewhere."""
    if code != "FL1":
        return calendar
    for day, home, away in FL1_ADMIN:
        calendar = calendar[
            ~((calendar["date"] == pd.Timestamp(day)) & (calendar["home"] == home) & (calendar["away"] == away))
        ]
    return calendar.copy()


def reconcile(
    client: Any, code: str, games: list[dict[str, Any]], calendar: pd.DataFrame, *, sources: Path | None = None
) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    """Reconcile the provider's paged index with the complete independent fixture denominator.

    A missing index entry is looked up through Sorare's date feed, never fabricated from
    a club's score or guessed from a player's name. Only exact competition/pair/date joins.
    """
    known = set(calendar["home"]) | set(calendar["away"])
    identities = {game["id"]: game for game in games}

    def matching(game: dict[str, Any]) -> list[int]:
        home, away = club_name(game["homeTeam"], known), club_name(game["awayTeam"], known)
        day = pd.Timestamp(when(game["date"]).date())
        return list(
            calendar.index[
                (calendar["home"] == home)
                & (calendar["away"] == away)
                & ((calendar["date"] - day).abs() <= pd.Timedelta(days=1))
            ]
        )

    covered = set()
    errors = []
    for game in games:
        try:
            candidates = matching(game)
            if len(candidates) == 1:
                covered.add(candidates[0])
        except (ValueError, KeyError) as error:
            errors.append(str(error))
    missing = set(calendar.index) - covered
    before = len(missing)
    recovered = []
    # At most twenty date windows; a broadly broken mapping must be repaired, not hammered.
    days = sorted({calendar.loc[index, "date"] for index in missing})
    if len(days) > 20:
        raise ValueError(f"{len(days)} missing date windows; audit literal club identities first")
    for day in days:
        try:
            result = client.query(
                DATE_QUERY,
                {
                    "from": (day - pd.Timedelta(hours=12)).isoformat() + "Z",
                    "to": (day + pd.Timedelta(hours=36)).isoformat() + "Z",
                },
            )
            for competition in result.get("competitionGames") or []:
                if (competition.get("competition") or {}).get("slug") != LEAGUES[code]:
                    continue
                for game in competition.get("games") or []:
                    candidates = matching(game)
                    if len(candidates) == 1 and candidates[0] in missing:
                        identities[game["id"]] = game
                        missing.remove(candidates[0])
                        recovered.append({"id": game["id"], "date": game["date"], "status": game.get("statusTyped")})
        except (SorareError, ValueError, KeyError, TypeError) as error:
            errors.append(str(error)[:400])
    # A replay can be absent from the competition feed. Verify the actual club's
    # calendar as a second source path, preserving its response as a reproduction.
    club_checks = []
    for index in sorted(missing.copy()):
        row = calendar.loc[index]
        club_slugs = {
            g[side]["slug"]
            for g in identities.values()
            for side in ("homeTeam", "awayTeam")
            if g[side].get("slug") and club_name(g[side], known) == row["home"]
        }
        if len(club_slugs) != 1:
            continue
        day = row["date"]
        variables = {
            "club": next(iter(club_slugs)),
            "from": (day - pd.Timedelta(hours=12)).isoformat() + "Z",
            "to": (day + pd.Timedelta(hours=36)).isoformat() + "Z",
        }
        try:
            page = client.query(CLUB_QUERY, variables)["football"]["club"]["games"]
            club_checks.append(
                {"variables": variables, "games": page.get("nodes") or [], "pageInfo": page.get("pageInfo")}
            )
            if (page.get("pageInfo") or {}).get("hasNextPage"):
                raise ValueError("Club reconciliation exceeded its bounded page")
            for game in page.get("nodes") or []:
                if (game.get("competition") or {}).get("slug") != LEAGUES[code]:
                    continue
                candidates = matching(game)
                if len(candidates) == 1 and candidates[0] in missing:
                    identities[game["id"]] = game
                    missing.remove(candidates[0])
                    recovered.append({"id": game["id"], "date": game["date"], "status": game.get("statusTyped")})
        except (SorareError, ValueError, KeyError, TypeError) as error:
            errors.append(str(error)[:400])
    player_checks = []
    if missing and sources is not None:
        retained = [json.loads(p.read_text("utf-8")) for p in sources.glob("*.json")]
        retained = [r for r in retained if isinstance(r, dict) and r.get("raw") and r.get("players")]
        for index in sorted(missing.copy()):
            row = calendar.loc[index]
            day = row["date"]
            # Choose the nearest preceding starter at each club by role/date, never
            # by score. At most two bounded history reads for a missing fixture.
            for label in (row["home"], row["away"]):
                options = []
                for saved in retained:
                    raw = saved["raw"]
                    at = pd.Timestamp(when(raw["date"]).date())
                    if not day - pd.Timedelta(days=30) <= at < day:
                        continue
                    for side in ("homeTeam", "awayTeam"):
                        if club_name(raw[side], known) != label:
                            continue
                        for player in saved["players"]:
                            if (
                                player.get("pos") == "GK"
                                and player.get("started") is True
                                and player.get("team") == raw[side]["slug"]
                            ):
                                options.append((at, player["slug"]))
                if not options:
                    continue
                variables = {
                    "player": max(options)[1],
                    "from": (day - pd.Timedelta(hours=12)).isoformat() + "Z",
                    "to": (day + pd.Timedelta(hours=36)).isoformat() + "Z",
                }
                try:
                    page = client.query(PLAYER_GAMES_QUERY, variables)["anyPlayer"]["allPlayerGameScores"]
                    candidates_games = [node["anyGame"] for node in page.get("nodes") or [] if node.get("anyGame")]
                    player_checks.append(
                        {"variables": variables, "games": candidates_games, "pageInfo": page.get("pageInfo")}
                    )
                    if (page.get("pageInfo") or {}).get("hasNextPage"):
                        raise ValueError("Player history reconciliation exceeded its page")
                    for game in candidates_games:
                        if (game.get("competition") or {}).get("slug") != LEAGUES[code]:
                            continue
                        candidates = matching(game)
                        if len(candidates) == 1 and candidates[0] in missing:
                            identities[game["id"]] = game
                            missing.remove(candidates[0])
                            recovered.append(
                                {"id": game["id"], "date": game["date"], "status": game.get("statusTyped")}
                            )
                except (SorareError, ValueError, KeyError, TypeError) as error:
                    errors.append(str(error)[:400])
                if index not in missing:
                    break
    audit = {
        "playerChecks": player_checks,
        "clubChecks": club_checks,
        "missingBefore": before,
        "missingAfter": len(missing),
        "recovered": recovered,
        "errors": errors,
        "missingFixtures": [
            {"date": str(calendar.loc[i, "date"]), "home": calendar.loc[i, "home"], "away": calendar.loc[i, "away"]}
            for i in sorted(missing)
        ],
    }
    return sorted(identities.values(), key=lambda game: (game["date"], game["id"])), audit


def validate_game(code: str, expected: dict[str, Any], raw: dict[str, Any], at: datetime) -> dict[str, Any]:
    if raw.get("id") != expected["id"] or (raw.get("competition") or {}).get("slug") != LEAGUES[code]:
        raise ValueError("Source game identity or competition mismatch")
    if when(raw["date"]) != when(expected["date"]):
        raise ValueError("Source game date changed; re-enumerate before evaluating")
    people = [player(row) for row in raw.get("playerGameScores") or []]
    if any(not p["slug"] for p in people) or len({p["slug"] for p in people}) != len(people):
        raise ValueError("Missing or duplicate player identity")
    return {"schemaVersion": 2, "readAt": at.isoformat(), "competition": code, "raw": raw, "players": people}


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
            if saved.get("schemaVersion") == 2:
                validate_game(code, game, saved["raw"], when(saved["readAt"]))
                completed.append(ident)
                continue
        pending.append(game)
    if limit is not None:
        pending = pending[:limit]
    for offset in range(len(pending)):
        if time.monotonic() - started > seconds:
            break
        batch = pending[offset : offset + 1]
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
        if offset % 25 == 0 or offset == len(pending) - 1:
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
    parser.add_argument("--cache", type=Path, default=Path("data/raw/football-data-co-uk"))
    parser.add_argument(
        "--use-index", action="store_true", help="reuse the source index already reconciled by this run's sample step"
    )
    args = parser.parse_args()
    with SorareClient(pause=0.75) as client:
        if not client.api_key:
            raise RuntimeError("Collector requires the existing configured Sorare read-only key")
        folder = args.out / args.league
        folder.mkdir(parents=True, exist_ok=True)
        if args.use_index:
            games = json.loads((folder / "games.json").read_text("utf-8"))
            audit = json.loads((folder / "index-reconciliation.json").read_text("utf-8"))
        else:
            games = game_list(client, args.league)
            (folder / "source-index.json").write_text(json.dumps(games), encoding="utf-8")
            calendar = pd.concat(
                [
                    normalize_season(fetch_season_csv(year, args.cache, DIVISIONS[args.league]), year)
                    for year in (2023, 2024, 2025)
                ],
                ignore_index=True,
            )
            calendar = eligible_calendar(args.league, calendar)
            games, audit = reconcile(client, args.league, games, calendar, sources=folder)
            spans = windows(client)
            (folder / "windows.json").write_text(json.dumps(spans), encoding="utf-8")
            (folder / "index-reconciliation.json").write_text(json.dumps(audit, indent=2), encoding="utf-8")
        result = collect(client, args.league, games, args.out, limit=args.limit, seconds=args.seconds)
        if args.limit:
            for game in games:
                path = folder / (hashlib.sha256(game["id"].encode()).hexdigest() + ".json")
                if path.exists():
                    saved = json.loads(path.read_text("utf-8"))
                    if saved.get("schemaVersion") == 2:
                        (folder / "sample.json").write_text(json.dumps(saved), encoding="utf-8")
                        break
        result["sourceCalls"] = client.calls
        if audit["missingAfter"]:
            result["complete"] = False
        from app.research.league_xscore_validation import documented_fl1_gap, documented_training_gap

        result["eligibleComplete"] = (
            result["complete"]
            or (
                args.league == "PL"
                and documented_training_gap(audit)
                and result["saved"] == result["expected"] == 1139
                and not result["failed"]
            )
            or (
                args.league == "FL1"
                and documented_fl1_gap(audit)
                and result["saved"] == result["expected"] in (915, 916)
                and not result["failed"]
            )
        )
        result["eligibilityProtocol"] = 3 if args.league == "FL1" else 2
        (folder / "coverage.json").write_text(json.dumps(result, indent=2), encoding="utf-8")
    print(json.dumps(result))
    return 0 if result["eligibleComplete"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
