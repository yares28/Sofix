"""Read-only current European product evidence, with no database writes or promotion."""

from __future__ import annotations

import argparse
import json
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from app.research.european_model import fit
from app.services import european_fdr, european_sources
from app.sorare import european_history, foreign_coverage, sync
from app.sorare.client import SorareClient


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--out", type=Path, default=Path("data/raw/european-current"))
    args = parser.parse_args()
    args.out.mkdir(parents=True, exist_ok=True)
    now = datetime.now(UTC)
    year = european_sources.season_at(now)
    calendars = european_sources.calendars(now)
    clubs = {code: european_sources.current_clubs(code, year) for code in european_fdr.VALIDATED}
    model = fit(european_sources.history(calendars), now, teams={t for group in clubs.values() for t in group})
    for code in european_fdr.VALIDATED:
        grid = european_fdr.build_grid(code, year, calendars[code][year], model, now, clubs=clubs[code])
        (args.out / f"{code}-grid.json").write_text(grid.model_dump_json(), encoding="utf-8")
    with SorareClient(pause=0.75) as client:
        if not client.api_key:
            raise RuntimeError("Use the existing unattended read-only key; never export it")
        window = sync.pick_gameweeks(sync.gameweeks(client, now=now), now)["plan"]
        path = args.out / "history.json"
        prior = json.loads(path.read_text(encoding="utf-8")) if path.exists() else {}
        actual, state = european_history.collect(client, now, prior, capture=args.out / "games")
        path.write_text(json.dumps(state, separators=(",", ":")), encoding="utf-8")
        (args.out / "actuals.json").write_text(json.dumps(actual, separators=(",", ":")), encoding="utf-8")
        print(
            json.dumps(
                {"historyComplete": state["complete"], "coverage": state["coverage"], "errors": state["errors"]}
            ),
            flush=True,
        )
        complete = state["complete"]
        squads: dict[str, list[dict[str, Any]]] = {}
        for code in european_fdr.VALIDATED:
            index = foreign_coverage.collect_index(
                client, code, window["slug"], now, clubs=list(clubs[code].values()), squads=squads
            )
            (args.out / f"{code}-squads.json").write_text(json.dumps(index, separators=(",", ":")), encoding="utf-8")
            compact = foreign_coverage.compact_index(index)
            (args.out / f"{code}-identities.json").write_text(
                json.dumps(compact, separators=(",", ":")), encoding="utf-8"
            )
            print(
                json.dumps(
                    {
                        "competition": code,
                        "complete": index["complete"],
                        "clubs": len(index["clubs"]),
                        "players": len(foreign_coverage.rows(index)),
                        "errors": index["errors"],
                        "sourceCalls": client.calls,
                    }
                ),
                flush=True,
            )
            complete &= index["complete"]
        (args.out / "raw-squads.json").write_text(json.dumps(squads, separators=(",", ":")), encoding="utf-8")
    return 0 if complete else 1


if __name__ == "__main__":
    raise SystemExit(main())
