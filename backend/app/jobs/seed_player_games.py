"""Import the local LaLiga games export, keeping every existing daily reading.

    python -m app.jobs.seed_player_games [--games data/raw/sorare_games.jsonl] [--write]

The default is a dry run with no database connection or network calls. After the owner's explicit approval, --write
fills missing actuals in the configured database and rebuilds player_sheets. It never migrates or fetches from Sorare.
"""

from __future__ import annotations

import argparse
import json
from collections import Counter
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from sqlalchemy.orm import Session

from app.services.publish import put
from app.services.timeutil import as_utc
from app.sorare import player_games, sheets

DEFAULT_GAMES = Path(__file__).resolve().parents[2] / "data" / "raw" / "sorare_games.jsonl"


def history_from_games(games: list[dict[str, Any]]) -> dict[str, list[dict[str, Any]]]:
    """Export actuals only: projections in this file were not frozen at a lock."""
    history: dict[str, list[dict[str, Any]]] = {}
    for game in games:
        if not game["id"]:
            raise ValueError("missing game id")
        date = as_utc(datetime.fromisoformat(game["date"])).isoformat()
        home, away = game["home"], game["away"]
        for slug, player in game["players"].items():
            if not slug:
                raise ValueError("missing player slug")
            played = player.get("played")
            row = {
                "gameId": game["id"],
                "date": date,
                "competition": "laliga-es",
                "home": home["name"],
                "away": away["name"],
                "status": "FINAL" if played is True else "DID_NOT_PLAY" if played is False else None,
                **{key: player[key] for key in ("score", "played", "started", "mins") if key in player},
            }
            stats = player.get("stats")
            if stats is not None:
                row["stats"] = [
                    {"stat": key, "statValue": count, "totalScore": points}
                    for key, (count, points) in stats.items()
                    if count
                ]
                row["yellow"] = int((stats.get("yellow_card") or [0])[0])
                row["red"] = bool((stats.get("red_card") or [0])[0])
                team = player.get("team")
                venue = "H" if team and team == home["slug"] else "A" if team and team == away["slug"] else None
                if venue and player.get("pos") in {"GK", "DEF", "MID", "FWD"} and player.get("level") is not None:
                    row["stats"].append(
                        {
                            "stat": "_context",
                            "pos": player["pos"],
                            "team": team,
                            "venue": venue,
                            "level": player["level"],
                        }
                    )
            history.setdefault(slug, []).append(row)
    return history


def read_export(path: Path) -> list[dict[str, Any]]:
    """Validate every line before opening a database; do not silently import a truncated export."""
    games = []
    for number, line in enumerate(path.read_text("utf-8").splitlines(), 1):
        if not line.strip():
            continue
        try:
            game = json.loads(line)
            history_from_games([game])
        except (ValueError, KeyError, TypeError, AttributeError) as exc:
            raise ValueError(f"Invalid games export at line {number}") from exc
        games.append(game)
    if not games:
        raise ValueError("Games export is empty")
    return games


def run(db: Session, history: dict[str, list[dict[str, Any]]], now: datetime) -> int:
    """Fill absent actuals, including statement-only rows; daily readings always win on overlap."""
    count = player_games.save(db, history, now, only_missing=True)
    put(db, sheets.KEY, sheets.from_kept(db), now)
    return count


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--games", type=Path, default=DEFAULT_GAMES)
    parser.add_argument(
        "--write", action="store_true", help="fill missing actuals in the configured database (owner approval required)"
    )
    args = parser.parse_args(argv)
    games = read_export(args.games)
    history = history_from_games(games)
    seasons = Counter(player_games.season_start(as_utc(datetime.fromisoformat(game["date"]))).year for game in games)
    dates = sorted(game["date"][:10] for game in games)
    print(
        f"{len(games)} games, {len(history)} players, {sum(map(len, history.values()))} player-game rows; {dates[0]} to {dates[-1]}"
    )
    print("; ".join(f"{year}/{(year + 1) % 100:02d}: {count}" for year, count in sorted(seasons.items())))
    if not args.write:
        print("Dry run: no database connection. Use --write only after owner approval.")
        return 0
    from app.db import SessionLocal

    with SessionLocal() as db:
        count = run(db, history, datetime.now(UTC))
    print(f"Processed {count} unique player-game rows; existing readings retained; player_sheets rebuilt.")
    return 0


if __name__ == "__main__":  # pragma: no cover
    raise SystemExit(main())
