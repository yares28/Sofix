"""Keep every LaLiga game, player by player, for the new xScore (plans/xscore.md P9 X1; roadmap 10.1).

    python -m app.jobs.export_games [--out backend/data/raw/sorare_games.jsonl] [--since 2025-08-01] [--call-pause 2.0]

The history export keeps the owner's players only. The new xScore is built and tracked on every player of every game, so this reads
each played LaLiga game once: who played for which side, his score split into the decisive level and the all-around points, the
projection and grade Sorare gave before kick-off, the penalties and set pieces he took, each stat he made with the points it earned, the
two official elevens and the result. Read only against Sorare's public API without a key, which allows queries of complexity 500: the
list of games is paged 35 at a time, and each game is asked as two light questions (scores and elevens; stats). A refusal for asking too
fast is waited out, as in `export_history`, and a stopped run goes on where it stopped: the file is one line per game, so nothing already
read is read again, and a line cut in half by a stopped run is dropped and its game read again.
"""

from __future__ import annotations

import argparse
import json
import logging
import sys
import time
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from app.jobs.export_history import RateLimited, _iso, _Patient
from app.logging_config import configure_logging
from app.sorare.client import SorareClient, SorareError
from app.sorare.model import SORARE_POSITION

logger = logging.getLogger(__name__)

DEFAULT_OUT = Path(__file__).resolve().parents[2] / "data" / "raw" / "sorare_games.jsonl"
DEFAULT_SINCE = datetime(2025, 8, 1, tzinfo=UTC)  # the start of 2025/26
COMPETITION = "laliga-es"
PAGE = 35  # games per page: 50 is over the keyless complexity limit (557 of 500)
COOL_DOWN = 75.0  # seconds to wait after Sorare refuses a question for coming too fast

LIST_QUERY = """
query($after:String){ football { competition(slug:"__COMPETITION__") { pastGames(first: __PAGE__, after: $after) {
  nodes { id date statusTyped homeGoals awayGoals homeTeam { slug name } awayTeam { slug name } }
  pageInfo { hasNextPage endCursor } } } } }
""".replace("__COMPETITION__", COMPETITION).replace("__PAGE__", str(PAGE))

SCORES_QUERY = """
query($id:ID!){ anyGame(id:$id){ ... on Game {
  homeFormation { startingLineupAvailable startingLineup { slug } bench { slug } }
  awayFormation { startingLineupAvailable startingLineup { slug } bench { slug } }
  playerGameScores { score scoringVersion positionTyped projection { score grade reliabilityBasisPoints } anyPlayer { slug }
    anyPlayerGameStats { playedInGame ... on PlayerGameStats { gameStarted minsPlayed penaltyTaken setPieceTaken cornerTaken
      attFreekickTotal anyTeam { slug } } }
    ... on PlayerGameScore { allAroundScore decisiveScore { totalScore } } } } } }
"""

STATS_QUERY = """
query($id:ID!){ anyGame(id:$id){ ... on Game { playerGameScores { anyPlayer { slug }
  ... on PlayerGameScore { detailedScore { stat statValue totalScore } } } } } }
"""

# In `detailedScore` but not a stat he made: the decisive level has its own field, and the minutes sit beside it.
NOT_STATS = frozenset({"level_score", "mins_played"})

__all__ = ["RateLimited", "fetch_game", "fetch_game_list", "run"]


def fetch_game_list(client: Any, since: datetime) -> list[dict[str, Any]]:
    """Every played LaLiga game from `since` on, oldest first, with its teams and result.

    Sorare lists them newest first, so the paging stops at the first page that reaches back before `since`. A game that was
    postponed or is still to be played is left out.
    """
    found: list[dict[str, Any]] = []
    after: str | None = None
    while True:
        page = client.query(LIST_QUERY, {"after": after})["football"]["competition"]["pastGames"]
        reached = False
        for node in page.get("nodes") or []:
            if datetime.fromisoformat(node["date"].replace("Z", "+00:00")) < since:
                reached = True
                continue
            if node.get("statusTyped") != "played":
                continue
            found.append(
                {
                    "id": node["id"],
                    "date": node["date"],
                    "home": {"slug": node["homeTeam"]["slug"], "name": node["homeTeam"]["name"]},
                    "away": {"slug": node["awayTeam"]["slug"], "name": node["awayTeam"]["name"]},
                    "homeGoals": node.get("homeGoals"),
                    "awayGoals": node.get("awayGoals"),
                }
            )
        info = page.get("pageInfo") or {}
        if reached or not info.get("hasNextPage"):
            return sorted(found, key=lambda game: game["date"])
        after = info.get("endCursor")


def _formation(node: dict[str, Any] | None) -> dict[str, Any]:
    node = node or {}
    return {
        "available": bool(node.get("startingLineupAvailable")),
        "start": [[player["slug"] for player in row] for row in node.get("startingLineup") or []],
        "bench": [player["slug"] for player in node.get("bench") or []],
    }


def _player(node: dict[str, Any]) -> dict[str, Any]:
    stats = node.get("anyPlayerGameStats") or {}
    projection = node.get("projection") or {}
    return {
        "pos": SORARE_POSITION.get(node.get("positionTyped") or ""),
        "team": (stats.get("anyTeam") or {}).get("slug"),
        "score": node.get("score") or 0.0,
        "ver": node.get("scoringVersion"),
        "level": (node.get("decisiveScore") or {}).get("totalScore"),
        "aa": node.get("allAroundScore") or 0.0,
        "proj": projection.get("score"),
        "grade": projection.get("grade"),
        "rel": projection.get("reliabilityBasisPoints"),
        "played": bool(stats.get("playedInGame")),
        "started": bool(stats.get("gameStarted")),
        "mins": stats.get("minsPlayed") or 0,
        "pen": stats.get("penaltyTaken") or 0,
        "setp": stats.get("setPieceTaken") or 0,
        "corners": stats.get("cornerTaken") or 0,
        "fk": stats.get("attFreekickTotal") or 0,
        "stats": {},
    }


def fetch_game(client: Any, game: dict[str, Any]) -> dict[str, Any]:
    """One game from the list: both elevens and every player's score and stats, two questions to Sorare."""
    scores = client.query(SCORES_QUERY, {"id": game["id"]})["anyGame"]
    players = {node["anyPlayer"]["slug"]: _player(node) for node in scores.get("playerGameScores") or []}
    detail = client.query(STATS_QUERY, {"id": game["id"]})["anyGame"]
    for node in detail.get("playerGameScores") or []:
        row = players.get(node["anyPlayer"]["slug"])
        if row is None:
            continue
        for item in node.get("detailedScore") or []:
            if item["stat"] not in NOT_STATS and item.get("statValue"):
                row["stats"][item["stat"]] = [item["statValue"], item.get("totalScore") or 0.0]
    return {
        **game,
        "xi": {"home": _formation(scores.get("homeFormation")), "away": _formation(scores.get("awayFormation"))},
        "players": players,
    }


def _load(out: Path) -> list[dict[str, Any]]:
    """The games already in the file. A line cut in half by a stopped run is dropped from the file, so the next append is clean."""
    try:
        text = out.read_text("utf-8")
    except OSError:
        return []
    lines = [line for line in text.splitlines() if line.strip()]
    kept: list[dict[str, Any]] = []
    for line in lines:
        try:
            row = json.loads(line)
        except ValueError:
            continue
        if isinstance(row, dict) and "id" in row:
            kept.append(row)
    if len(kept) != len(lines) or not text.endswith("\n"):
        out.write_text("".join(json.dumps(row, separators=(",", ":")) + "\n" for row in kept), "utf-8")
    return kept


def run(
    client: Any,
    games: list[dict[str, Any]],
    out: Path,
    *,
    pause: float = 2.0,
    cool_down: float = COOL_DOWN,
    limit: int | None = None,
) -> dict[str, Any]:
    """Read each game not already in the file, appending its line at once so a stopped run loses nothing.

    `limit` stops after that many games read, to try the export on a few before the whole season.
    """
    out.parent.mkdir(parents=True, exist_ok=True)
    have = {row["id"] for row in _load(out)}
    result: dict[str, Any] = {"games": 0, "players": 0, "failed": [], "skipped": 0}
    patient = _Patient(client, cool_down)
    for game in games:
        if game["id"] in have:
            result["skipped"] += 1
            continue
        if limit is not None and result["games"] >= limit:
            break
        try:
            row = fetch_game(patient, game)
        except RateLimited:
            logger.warning("export_games: stopped at %s, Sorare is still refusing; run it again later", game["id"])
            result["stoppedAt"] = game["id"]
            break
        except SorareError as exc:
            logger.warning("export_games: %s left out (%s)", game["id"], str(exc)[:160])
            result["failed"].append(game["id"])
            continue
        with out.open("a", encoding="utf-8") as handle:
            handle.write(json.dumps(row, separators=(",", ":")) + "\n")
        result["games"] += 1
        result["players"] += len(row["players"])
        if pause:
            time.sleep(pause)
    return result


def main(argv: list[str] | None = None) -> int:
    configure_logging()
    parser = argparse.ArgumentParser(description="Export every LaLiga game, player by player, for the new xScore.")
    parser.add_argument("--out", type=Path, default=DEFAULT_OUT)
    parser.add_argument("--since", default=DEFAULT_SINCE.date().isoformat(), help="the first day, YYYY-MM-DD")
    parser.add_argument("--call-pause", type=float, default=2.0, help="seconds between questions to Sorare")
    parser.add_argument("--limit", type=int, default=None, help="read at most this many games (to try it first)")
    args = parser.parse_args(argv)
    since = datetime.fromisoformat(args.since).replace(tzinfo=UTC)
    with SorareClient(pause=args.call_pause) as client:
        try:
            games = fetch_game_list(_Patient(client, COOL_DOWN), since)
        except RateLimited:
            print("Sorare is refusing the list of games; try again later.", file=sys.stderr)
            return 1
        print(f"{len(games)} played LaLiga games since {_iso(since)[:10]}; reading the ones not in {args.out}")
        result = run(client, games, args.out, pause=0, limit=args.limit)
    print(json.dumps(result))
    return 1 if result.get("stoppedAt") else 0


if __name__ == "__main__":
    sys.exit(main())
