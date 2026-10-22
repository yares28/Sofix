"""Small batched actual Sorare fixture assignments, separate from expensive game scores."""

from __future__ import annotations

import argparse
import json
from datetime import datetime
from pathlib import Path
from typing import Any

from app.research.european_data import COMPETITIONS
from app.research.league_xscore_data import when
from app.sorare.client import SorareClient

QUERY = """
query($ids:[ID!]!){nodes(ids:$ids){...on Game{
 id date competition{slug} homeTeam{slug} awayTeam{slug}
 so5Fixture{slug startDate endDate cutOffDate}
}}}
"""
BATCH = 25


def actual_window(row: dict[str, Any]) -> tuple[str, datetime]:
    fixture = row.get("so5Fixture")
    if not fixture or not fixture.get("slug") or not fixture.get("cutOffDate"):
        raise ValueError("Missing actual Sorare fixture assignment")
    cutoff = when(fixture["cutOffDate"])
    if cutoff >= when(row["date"]):
        raise ValueError("Actual Sorare cutoff is not before the game")
    return fixture["slug"], cutoff


def validate(code: str, expected: dict[str, Any], row: dict[str, Any]) -> None:
    if row.get("id") != expected["id"] or (row.get("competition") or {}).get("slug") != COMPETITIONS[code].sorare:
        raise ValueError("Wrong metadata game/competition identity")
    if when(row["date"]) != when(expected["date"]):
        raise ValueError("Metadata game time changed; review source index")
    if any(
        (row.get(side) or {}).get("slug") != (expected.get(side) or {}).get("slug") for side in ("homeTeam", "awayTeam")
    ):
        raise ValueError("Metadata actual team changed; review source index")


def collect(client: Any, code: str, expected: list[dict[str, Any]], folder: Path) -> dict[str, dict[str, Any]]:
    folder.mkdir(parents=True, exist_ok=True)
    path = folder / "metadata.json"
    cached = json.loads(path.read_text(encoding="utf-8")) if path.exists() else {}
    if len({r["id"] for r in expected}) != len(expected):
        raise ValueError("Repeated metadata source identity")
    kept = {}
    pending = []
    for game in expected:
        if game["id"] in cached:
            row = cached[game["id"]]
            validate(code, game, row)
            kept[game["id"]] = row
        else:
            pending.append(game)
    for offset in range(0, len(pending), BATCH):
        batch = {r["id"]: r for r in pending[offset : offset + BATCH]}
        rows = client.query(QUERY, {"ids": list(batch)})["nodes"]
        found = {}
        for row in rows:
            if not row or row.get("id") not in batch or row["id"] in found:
                raise ValueError("Unexpected or repeated metadata identity")
            validate(code, batch[row["id"]], row)
            found[row["id"]] = row
        if set(found) != set(batch):
            raise ValueError("Missing metadata nodes; partial list is not complete")
        kept.update(found)
        # Retain each bounded batch for an interrupted run; no forecast/model writes.
        path.write_text(json.dumps(kept, separators=(",", ":")), encoding="utf-8")
        print(f"{code}: retained actual fixture assignments {len(kept)}/{len(expected)}", flush=True)
    return kept


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--league", choices=COMPETITIONS, required=True)
    parser.add_argument("--root", type=Path, default=Path("data/raw/european-xscore"))
    args = parser.parse_args()
    folder = args.root / args.league
    expected = json.loads((folder / "index.json").read_text(encoding="utf-8"))
    with SorareClient(pause=0.75) as client:
        rows = collect(client, args.league, expected, folder)
    print(f"{args.league}: {len(rows)} actual fixture responses retained; null assignments remain null")


if __name__ == "__main__":
    main()
