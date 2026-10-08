"""Regenerate the recorded stat-sheet export for local comparisons and browser fixtures.

    cd backend
    python -m app.jobs.stat_sheets [--games data/raw/sorare_games.jsonl] [--write]

Reads the local games export (`app.jobs.export_games`) and, with `--write`, writes `frontend/lib/data/stat_sheets.json`.
Production pages and missions read the daily player_sheets read model instead. Nothing is sent anywhere.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

from app.sorare import gamedata, sheets

OUT = Path(__file__).resolve().parents[3] / "frontend" / "lib" / "data" / "stat_sheets.json"


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--games", type=Path, default=gamedata.DEFAULT_GAMES)
    parser.add_argument("--write", action="store_true", help=f"write {OUT.name}")
    args = parser.parse_args(argv)
    made = sheets.sheets_from_games(gamedata.read_games(args.games))
    text = json.dumps(made, separators=(",", ":"), ensure_ascii=False)
    print(f"{len(made['players'])} players with a sheet, to {made['asOf']}, {len(text) / 1024:.0f} KB")
    if args.write:
        OUT.parent.mkdir(parents=True, exist_ok=True)
        OUT.write_text(text + "\n", "utf-8")
        print(f"wrote {OUT}")
    return 0


if __name__ == "__main__":  # pragma: no cover
    raise SystemExit(main())
