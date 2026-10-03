"""Replay today's xScore on every LaLiga player and write the numbers (plans/xscore.md P9 X2; roadmap 10.2).

    python -m app.jobs.league_replay --fixtures-from backend/data/raw/sorare_history.json
        [--games backend/data/raw/sorare_games.jsonl] [--out backend/data/audit/replay_league.json]

Reads the games `app.jobs.export_games` wrote (every player of every LaLiga game since August 2025) and Sorare's gameweeks from the
owner's history file, scores today's formula on all of it and against Sorare's own projection, and writes the numbers the Audit's
catalogue starts from (`app.sorare.league.replay`). Numbers only, no player's name: the file is committed, the games are not. Nothing
is fetched and nothing is written to the database.
"""

from __future__ import annotations

import argparse
import json
import sys
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from app.sorare import gamedata, league

DEFAULT_OUT = Path(__file__).resolve().parents[2] / "data" / "audit" / "replay_league.json"


def _share(value: float | None) -> str:
    return "–" if value is None else f"{value:.0%}"


def summary(found: dict[str, Any]) -> str:
    """The few lines worth reading at once: how the xScore did, and how Sorare's projection did on the same games."""
    lines = [
        f"{found['games']} games, {found['players']} players, {found['from']} to {found['to']}",
    ]
    for kind, label in (("shown", "the tile's number"), ("expected", "the expected score")):
        for name, figure in found["xscore"][kind].items():
            if figure:
                within = figure["within"]
                lines.append(
                    f"{label}, on {name} games ({figure['games']}): typical miss {figure['mae']:.1f}, lean {figure['bias']:+.1f}, "
                    f"within 3: {_share(within['3'])}, 7: {_share(within['7'])}, 10: {_share(within['10'])}, 15: {_share(within['15'])}"
                )
    pairs = found["pairs"]["today"]
    lines.append(
        f"picks the better of two players: {_share(pairs['rate'])} of {pairs['pairs']} pairs (a coin flip is 50%)"
    )
    versus = found["vsSorare"]
    if versus["games"]:
        lines.append(
            f"on {versus['games']} starts: today's number within 7: {_share(versus['today']['within']['7'])}, Sorare's "
            f"projection: {_share(versus['sorare']['within']['7'])}; today's nearer in {_share(versus['closer'])} of games"
        )
    return "\n".join(lines)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Replay today's xScore on every LaLiga player and write the numbers.")
    parser.add_argument("--games", type=Path, default=gamedata.DEFAULT_GAMES)
    parser.add_argument(
        "--fixtures-from",
        type=Path,
        required=True,
        help="a history file of app.jobs.export_history (Sorare's gameweeks)",
    )
    parser.add_argument("--out", type=Path, default=DEFAULT_OUT)
    args = parser.parse_args(argv)
    try:
        games = gamedata.read_games(args.games)
        fixtures = json.loads(args.fixtures_from.read_text("utf-8")).get("fixtures") or []
    except (OSError, ValueError) as exc:
        print(f"Cannot read the inputs: {exc}", file=sys.stderr)
        return 1
    if not games or not fixtures:
        print(
            "The games or the gameweeks are missing: run `python -m app.jobs.export_games` and `export_history` first.",
            file=sys.stderr,
        )
        return 1
    found = league.replay(games, fixtures, datetime.now(UTC))
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(found, indent=1, sort_keys=True) + "\n", "utf-8")
    print(summary(found))
    print(f"wrote {args.out}")
    return 0


if __name__ == "__main__":  # pragma: no cover
    raise SystemExit(main())
