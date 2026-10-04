"""Write the league figures of the Audit page (plans/xscore.md P9 X5d; roadmap 10.2c).

    cd backend
    python -m app.jobs.audit_league --fixtures-from data/raw/sorare_history.json [--write]

Replays every week of the local games export from the weeks before it (`keeper.walk_forward`, `outfield.walk_forward`), reads the per-position tables
`keeper_fit` and `outfield_fit` wrote (`data/audit/*_walk_forward.json`: the new number, today's and Sorare's, with 95% intervals), and with `--write` writes
`frontend/lib/data/audit_league.json`, which the Audit page draws. Nothing is sent anywhere.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any

from app.sorare import backtest, gamedata, keeper, league_audit, outfield

AUDIT = Path(__file__).resolve().parents[2] / "data" / "audit"
OUT = Path(__file__).resolve().parents[3] / "frontend" / "lib" / "data" / "audit_league.json"


def _rate(block: dict[str, Any] | None) -> dict[str, Any] | None:
    if not block or not block.get("games"):
        return None
    pair = block["pair"]
    return {"rate": pair["rate"], "lo": pair["lo"], "hi": pair["hi"], "pairs": pair["pairs"], "games": block["games"]}


def build(joined: list[dict[str, Any]], fixtures: list[dict[str, str]], through: str) -> dict[str, Any]:
    ks = keeper.walk_forward(keeper.starts_from_games(joined, fixtures))
    os_ = outfield.walk_forward(outfield.starts_from_games(joined, fixtures))
    cases = [league_audit.Case(w.week, w.date, w.player, "GK", w.said.start, w.score) for w in ks] + [
        league_audit.Case(w.week, w.date, w.player, w.pos, w.said, w.score) for w in os_
    ]
    gk = json.loads((AUDIT / "keeper_walk_forward.json").read_text("utf-8"))
    outs = json.loads((AUDIT / "outfield_walk_forward.json").read_text("utf-8"))
    replay = json.loads((AUDIT / "replay.json").read_text("utf-8"))
    blocks = {"GK": gk, **outs}
    starts = replay["starts"]["sofix"]
    return {
        "asOf": max(c.date for c in cases).date().isoformat(),
        "through": through,
        "starts": len(cases),
        "positions": [
            {"pos": pos, "now": _rate(b.get("new")), "before": _rate(b.get("today")), "sorare": _rate(b.get("sorare"))}
            for pos, b in blocks.items()
        ],
        "weeks": league_audit.weekly_pairs(cases),
        "miss": league_audit.miss_histogram(cases),
        "within7": {
            which: league_audit.pooled_within(list(blocks.values()), key)
            for which, key in (("now", "new"), ("before", "today"), ("sorare", "sorare"))
        },
        "keeper": {
            "games": gk["games"],
            "range": gk["range"],
            "bands": [
                {"said": b["said"], "happened": b["happened"], "n": b["games"]}
                for b in gk["decisive"]
                if b["games"] >= league_audit.FLOOR // 4
            ],
            "said": sum(w.said.p_decisive for w in ks) / max(1, len(ks)),
            "happened": sum(1 for w in ks if w.decisive) / max(1, len(ks)),
        },
        "starts_calibration": {
            "games": starts["games"],
            "right": starts["right"],
            "bands": [{"said": b["said"], "happened": b["was"], "n": b["n"]} for b in starts["buckets"]],
        },
    }


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--games", type=Path, default=gamedata.DEFAULT_GAMES)
    parser.add_argument("--cache", type=Path, default=gamedata.DEFAULT_CACHE)
    parser.add_argument("--fixtures-from", type=Path, required=True)
    parser.add_argument("--through", default="2026-09-30")
    parser.add_argument("--write", action="store_true", help=f"write {OUT.name}")
    args = parser.parse_args(argv)
    fixtures = backtest.read_fixtures(json.loads(args.fixtures_from.read_text("utf-8")))
    joined, _, _ = gamedata.load_joined(args.games, args.cache)
    made = build(joined, fixtures, args.through)
    text = json.dumps(made, separators=(",", ":"))
    print(f"{made['starts']} starts, {len(made['weeks'])} weeks, to {made['asOf']}, {len(text) / 1024:.1f} KB")
    if args.write:
        OUT.parent.mkdir(parents=True, exist_ok=True)
        OUT.write_text(text + "\n", "utf-8")
        print(f"wrote {OUT}")
    return 0


if __name__ == "__main__":  # pragma: no cover
    raise SystemExit(main())
