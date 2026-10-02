"""Score the xScore model on the owner's players' game history and print the report (roadmap 3.1, plans/xscore.md P2).

    python -m app.jobs.xscore_backtest [--history backend/data/raw/sorare_history.json] [--holdout 2026-10-01] [--out report.md]

Reads the file `app.jobs.export_history` wrote, so run that first. Nothing is fetched and nothing is written to the database: the
games on or after `--holdout` are reported apart, because the plan decides every change on the games before it and checks it once on
the ones after.
"""

from __future__ import annotations

import argparse
import json
import sys
from datetime import UTC, datetime
from pathlib import Path

from app.jobs.export_history import DEFAULT_OUT
from app.sorare import backtest

# The weeks held out begin here (plans/xscore.md): none of them is looked at while tuning.
DEFAULT_HOLDOUT = "2026-10-01"


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Score the xScore model and simple baselines on the exported game history."
    )
    parser.add_argument("--history", type=Path, default=DEFAULT_OUT, help="the file app.jobs.export_history wrote")
    parser.add_argument("--holdout", default=DEFAULT_HOLDOUT, help="the first day held out, YYYY-MM-DD")
    parser.add_argument("--out", type=Path, default=None, help="also write the report to this file")
    args = parser.parse_args(argv)
    try:
        raw = json.loads(args.history.read_text("utf-8"))
    except (OSError, ValueError):
        print(f"No history in {args.history}: run `python -m app.jobs.export_history` first.", file=sys.stderr)
        return 1
    players = backtest.read_history(raw)
    if not players:
        print(f"{args.history} holds no players: run `python -m app.jobs.export_history` again.", file=sys.stderr)
        return 1
    holdout = datetime.fromisoformat(args.holdout).replace(tzinfo=UTC)
    fixtures = backtest.read_fixtures(raw)
    if not fixtures:
        print(
            f"{args.history} has no gameweeks: weeks are Monday to Sunday and the gameweek section is left out; "
            "run `python -m app.jobs.export_history` again to add Sorare's gameweeks.",
            file=sys.stderr,
        )
    weeks = backtest.walk_gameweeks(players, fixtures) if fixtures else None
    text = backtest.report(backtest.walk_forward(players, fixtures=fixtures), holdout_from=holdout, weeks=weeks)
    reconfigure = getattr(sys.stdout, "reconfigure", None)
    if reconfigure:  # a Windows console cannot draw every dash of the report: it prints a "?" for one rather than stop
        reconfigure(errors="replace")
    print(text, end="")
    if args.out:
        args.out.write_text(text, "utf-8")
    return 0


if __name__ == "__main__":  # pragma: no cover
    raise SystemExit(main())
