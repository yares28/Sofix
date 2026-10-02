"""Keep every game of the owner's players, for the xScore backtest (roadmap 3.1, plans/xscore.md P2).

    python -m app.jobs.export_history [--out backend/data/raw/sorare_history.json] [--since 2025-08-01] [--players a,b]

The refresh job only keeps ten weeks of each player's games and forgets them between runs, which is too short to test a
model on. This reads them back as far as the season before, once, into a local file that is not committed: per game the
score, whether he played and started, his minutes and the competition. Read only against Sorare's public API, a player at a
time, and a stopped run goes on where it stopped.

Without a key Sorare allows queries of complexity 500, so a window of 28 days is asked for at most eight games, and a window that
comes back full is cut in two until nothing is lost to the page limit. Asking too fast is refused too: a refusal is waited out and
the same question asked again, and a run that is still refused after a few waits stops, to be started again later.
"""

from __future__ import annotations

import argparse
import json
import logging
import sys
import time
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any

from app.db import SessionLocal
from app.logging_config import configure_logging
from app.models import ReadModel
from app.sorare.client import SorareClient, SorareError
from app.sorare.model import SORARE_POSITION

logger = logging.getLogger(__name__)

DEFAULT_OUT = Path(__file__).resolve().parents[2] / "data" / "raw" / "sorare_history.json"
DEFAULT_SINCE = datetime(2025, 8, 1, tzinfo=UTC)  # the start of 2025/26
WINDOW = timedelta(days=28)
PAGE = 8  # games asked for in one window: what the keyless complexity limit allows
COOL_DOWN = 75.0  # seconds to wait after Sorare refuses a question for coming too fast
RATE_WAITS = 3  # waits a refused question gets before the run stops

QUERY = """
query($p:String!,$from:ISO8601DateTime!,$to:ISO8601DateTime!){ anyPlayer(slug:$p){
  ... on Player { displayName position activeClub { name } activeNationalTeam { name }
    allPlayerGameScores(from:$from, to:$to, first: 8) { nodes {
      score scoreStatus
      anyGame { id date competition { slug } }
      anyPlayerGameStats { playedInGame ... on PlayerGameStats { gameStarted minsPlayed } }
    } } } } }
"""

__all__ = ["RATE_WAITS", "RateLimited", "SorareError", "collection_players", "fetch_player", "run"]


class RateLimited(SorareError):
    """Sorare kept refusing a question after every wait: the run stops there and can be started again later."""


class _Patient:
    """The client, except that a refusal for coming too fast is waited out and the same question asked again.

    A refused question then costs one call, not the windows of the player already read, and a run that was refused does not
    go on to be refused for every player after him.
    """

    def __init__(self, client: Any, cool_down: float) -> None:
        self.client, self.cool_down = client, cool_down

    def query(self, text: str, variables: dict[str, Any] | None = None) -> dict[str, Any]:
        waited = 0
        while True:
            try:
                answer: dict[str, Any] = self.client.query(text, variables)
                return answer
            except SorareError as exc:
                if "rate limited" not in str(exc):
                    raise
                if waited == RATE_WAITS:
                    raise RateLimited(str(exc)) from exc
                waited += 1
                logger.info("export: rate limited, waiting %.0f s (%d of %d)", self.cool_down, waited, RATE_WAITS)
                time.sleep(self.cool_down)


def _iso(moment: datetime) -> str:
    return moment.astimezone(UTC).isoformat().replace("+00:00", "Z")


def _row(node: dict[str, Any]) -> dict[str, Any]:
    stats = node.get("anyPlayerGameStats") or {}
    game = node["anyGame"]
    return {
        "date": game["date"],
        "competition": (game.get("competition") or {}).get("slug"),
        "gameId": game["id"],
        "score": node.get("score") or 0.0,
        "played": bool(stats.get("playedInGame")),
        "started": bool(stats.get("gameStarted")),
        "mins": stats.get("minsPlayed"),
        "status": node.get("scoreStatus"),
    }


def _window(client: Any, slug: str, start: datetime, end: datetime, meta: dict[str, Any]) -> list[dict[str, Any]]:
    """The games in [start, end], cut in two whenever the answer fills the page, so none is lost to the page limit."""
    data = client.query(QUERY, {"p": slug, "from": _iso(start), "to": _iso(end)})
    player = data.get("anyPlayer")
    if not player:
        raise SorareError(f"{slug}: Sorare has no such player")
    if not meta:
        meta.update(
            name=player.get("displayName"),
            pos=SORARE_POSITION.get(player.get("position") or ""),
            club=(player.get("activeClub") or {}).get("name"),
            nation=(player.get("activeNationalTeam") or {}).get("name"),
        )
    nodes = (player.get("allPlayerGameScores") or {}).get("nodes") or []
    if len(nodes) >= PAGE and end - start > timedelta(hours=12):
        middle = start + (end - start) / 2
        return _window(client, slug, start, middle, meta) + _window(client, slug, middle, end, meta)
    return [_row(node) for node in nodes]


def fetch_player(client: Any, slug: str, start: datetime, end: datetime) -> dict[str, Any]:
    """One player: who he is and every game from `start` to `end`, once each, oldest first."""
    meta: dict[str, Any] = {}
    seen: dict[str, dict[str, Any]] = {}
    cursor = start
    while cursor < end:
        upto = min(cursor + WINDOW, end)
        for row in _window(client, slug, cursor, upto, meta):
            seen[row["gameId"]] = row  # a game on the edge of two windows is asked for twice and kept once
        cursor = upto
    return {**meta, "games": sorted(seen.values(), key=lambda row: row["date"])}


def collection_players(page: dict[str, Any]) -> dict[str, str]:
    """The owner's players, each once, with his position, from the published page's `collection`."""
    found: dict[str, str] = {}
    for card in page.get("collection") or []:
        if card.get("player"):
            found.setdefault(card["player"], card.get("pos"))
    return found


def _load(out: Path) -> dict[str, Any]:
    try:
        data = json.loads(out.read_text("utf-8"))
    except (OSError, ValueError):
        return {}
    return data if isinstance(data, dict) else {}


def run(
    client: Any,
    players: list[str],
    out: Path,
    *,
    since: datetime,
    until: datetime,
    pause: float = 0.5,
    cool_down: float = COOL_DOWN,
) -> dict[str, Any]:
    """Fetch each player not already in the file, writing it after every player so a stopped run loses nothing."""
    saved = _load(out)
    kept: dict[str, Any] = saved.get("players") or {} if saved.get("since") == since.isoformat() else {}
    result: dict[str, Any] = {"players": 0, "games": 0, "failed": [], "skipped": 0}
    patient = _Patient(client, cool_down)
    for slug in players:
        if slug in kept:
            result["skipped"] += 1
            continue
        try:
            kept[slug] = fetch_player(patient, slug, since, until)
        except RateLimited:
            logger.warning(
                "export: stopped at %s, Sorare is still refusing; run it again later to go on from here", slug
            )
            result["stoppedAt"] = slug
            break
        except SorareError as exc:
            logger.warning("export: %s left out (%s)", slug, str(exc)[:160])
            result["failed"].append(slug)
            continue
        result["players"] += 1
        result["games"] += len(kept[slug]["games"])
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text(
            json.dumps(
                {"exportedAt": _iso(datetime.now(UTC)), "since": since.isoformat(), "players": kept},
                separators=(",", ":"),
            ),
            "utf-8",
        )
        if pause:
            time.sleep(pause)
    return result


def main(argv: list[str] | None = None) -> int:
    configure_logging()
    parser = argparse.ArgumentParser(description="Export the owner's players' game history for the xScore backtest.")
    parser.add_argument("--out", type=Path, default=DEFAULT_OUT)
    parser.add_argument("--since", default=DEFAULT_SINCE.date().isoformat(), help="the first day, YYYY-MM-DD")
    parser.add_argument(
        "--players", default=None, help="comma-separated Sorare player slugs (default: the owner's collection)"
    )
    parser.add_argument("--pause", type=float, default=0.5, help="seconds between players")
    parser.add_argument("--call-pause", type=float, default=1.0, help="seconds between questions to Sorare")
    args = parser.parse_args(argv)
    since = datetime.fromisoformat(args.since).replace(tzinfo=UTC)
    if args.players:
        slugs = [s.strip() for s in args.players.split(",") if s.strip()]
    else:
        with SessionLocal() as db:
            row = db.get(ReadModel, "sorare")
            slugs = list(collection_players(dict(row.payload)) if row and isinstance(row.payload, dict) else {})
    if not slugs:
        print("No players: the collection is not published yet.", file=sys.stderr)
        return 1
    with SorareClient(pause=args.call_pause) as client:
        result = run(
            client, slugs, args.out, since=since, until=datetime.now(UTC) + timedelta(days=8), pause=args.pause
        )
    print(json.dumps({**result, "out": str(args.out)}, indent=2))
    return 0 if not result["failed"] and "stoppedAt" not in result else 2


if __name__ == "__main__":  # pragma: no cover
    raise SystemExit(main())
