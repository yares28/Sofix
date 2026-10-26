"""The score engine's ruler: every number scored the same way on the same starts (plans/score-engine.md §5, E0).

    cd backend
    python -m app.jobs.engine_check [--holdout 2026-10-01] [--fixtures-from <file with Sorare's gameweeks>] [--json out.json]

Reads the local games export (`app.jobs.export_games`) joined to the football model (`app.sorare.gamedata`) and, for every LaLiga
start from `--holdout` on (the weeks no number was tuned on), prints per position, for each number: how far it was from the score
(the typical and the squared miss), how often it landed within 3, 7, 10 and 15 points, which way it leans, its chance of a decisive
action against what happened band by band, and its difference from the shipped number with a 95% interval (whole weeks resampled).

The numbers today: the shipped keeper and outfield lines as production runs them (no Sorare projection, 26 Oct 2026), and Sorare's
projection, the yardstick. Each engine phase adds its own. Nothing is sent anywhere; Sorare's gameweeks only group the weeks (the
calendar week does without them).
"""

from __future__ import annotations

import argparse
import json
from collections import defaultdict
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import numpy as np

from app.sorare import backtest, gamedata, keeper, league, outfield

BASE = "shipped"
BANDS = (
    0.0,
    0.1,
    0.2,
    0.3,
    0.4,
    0.6,
    1.0,
)  # of the chance of a decisive action, where it is checked against what happened
POSITIONS = ("GK", "DEF", "MID", "FWD")


@dataclass(frozen=True)
class Said:
    """What one number said for one start, and what happened."""

    model: str
    player: str
    pos: str
    date: datetime
    week: str
    score: float
    said: float
    p_decisive: float | None = None
    decisive: bool | None = None


def _row(s: Said) -> backtest.Row:
    return backtest.Row(
        model=s.model,
        player=s.player,
        pos=s.pos,
        date=s.date,
        week=s.week,
        competition=gamedata.COMPETITION,
        klass="league",
        before=0,
        score=s.score,
        played=True,
        started=True,
        expected=s.said,
    )


def _bands(rows: list[Said]) -> list[dict[str, Any]]:
    told = [r for r in rows if r.p_decisive is not None and r.decisive is not None]
    out = []
    for low, high in zip(BANDS, BANDS[1:], strict=False):
        inside = [r for r in told if low < (r.p_decisive or 0.0) <= high]
        if inside:
            out.append(
                {
                    "band": [low, high],
                    "n": len(inside),
                    "said": float(np.mean([r.p_decisive for r in inside])),
                    "happened": float(np.mean([bool(r.decisive) for r in inside])),
                }
            )
    return out


def rulers(rows: list[Said], base: str = BASE) -> dict[str, dict[str, dict[str, Any]]]:
    """Per position and number: its misses, its share within each distance, its lean, its decisive bands and its difference from `base`."""
    out: dict[str, dict[str, dict[str, Any]]] = {}
    for pos in POSITIONS:
        mine = [r for r in rows if r.pos == pos]
        if not mine:
            continue
        by_model: dict[str, list[Said]] = defaultdict(list)
        for r in mine:
            by_model[r.model].append(r)
        table: dict[str, dict[str, Any]] = {}
        for model, part in by_model.items():
            block: dict[str, Any] = {
                "n": len(part),
                "weeks": len({r.week for r in part}),
                **league._misses(np.array([r.said for r in part]), np.array([r.score for r in part])),
                "bands": _bands(part),
            }
            if model != base and base in by_model:
                pooled = [_row(r) for r in part + by_model[base]]
                block["diff"] = {m: backtest.compare(pooled, model, base, metric=m) for m in ("absolute", "squared")}
            table[model] = block
        out[pos] = table
    return out


def _pct(value: float) -> str:
    return f"{value * 100:.0f}%"


def _diff(block: dict[str, Any]) -> str:
    d = (block.get("diff") or {}).get("absolute") or {}
    if d.get("diff") is None:
        return ""
    return f"{d['diff']:+.2f} [{d['lo']:+.2f}, {d['hi']:+.2f}]"


def render(table: dict[str, dict[str, dict[str, Any]]]) -> str:
    """The tables as they go into plans/score-engine.md."""
    lines: list[str] = []
    for pos, numbers in table.items():
        lines += [
            f"**{pos}**",
            "",
            f"| number | starts | typical miss | squared miss | leans | ±3 | ±7 | ±15 | typical miss minus {BASE}'s [95%] |",
            "|---|---|---|---|---|---|---|---|---|",
        ]
        for model, b in numbers.items():
            w = b["within"]
            lines.append(
                f"| {model} | {b['n']} | {b['mae']:.2f} | {b['rmse']:.2f} | {b['bias']:+.2f} | "
                f"{_pct(w['3'])} | {_pct(w['7'])} | {_pct(w['15'])} | {_diff(b)} |"
            )
        for model, b in numbers.items():
            if b["bands"]:
                lines += [
                    "",
                    f"{model}'s chance of a decisive action: "
                    + ", ".join(f"said {_pct(x['said'])} → {_pct(x['happened'])} ({x['n']})" for x in b["bands"]),
                ]
        lines.append("")
    return "\n".join(lines)


def shipped_and_sorare(joined: list[dict[str, Any]], fixtures: list[dict[str, str]], since: datetime) -> list[Said]:
    """Every LaLiga start from `since` on, as the shipped lines say it today (no Sorare projection) and as Sorare projected it."""
    rows: list[Said] = []
    goalkeeping = keeper.load()
    for k in keeper.starts_from_games(joined, fixtures):
        if k.date < since:
            continue
        if goalkeeping is not None:
            out = goalkeeping.predict(k.numbers, None)
            rows.append(Said(BASE, k.player, "GK", k.date, k.week, k.score, out.start, out.p_decisive, k.decisive))
        if k.proj is not None:
            rows.append(Said("sorare", k.player, "GK", k.date, k.week, k.score, k.proj))
    lines = outfield.load()
    for s in outfield.starts_from_games(joined, fixtures):
        if s.date < since:
            continue
        model = lines.get(s.pos)
        if model is not None:
            out = model.outcome(s.numbers, s.home, s.own_dec, s.own_score, None)
            rows.append(Said(BASE, s.player, s.pos, s.date, s.week, s.score, out.start, out.p_decisive, s.decisive))
        if s.proj is not None:
            rows.append(Said("sorare", s.player, s.pos, s.date, s.week, s.score, s.proj))
    return rows


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--games", type=Path, default=gamedata.DEFAULT_GAMES)
    parser.add_argument("--cache", type=Path, default=gamedata.DEFAULT_CACHE)
    parser.add_argument("--fixtures-from", type=Path, default=None, help="a file with Sorare's gameweeks (`fixtures`)")
    parser.add_argument("--holdout", default="2026-10-01", help="the first day scored (YYYY-MM-DD)")
    parser.add_argument("--json", type=Path, default=None, help="also write the numbers here")
    args = parser.parse_args(argv)
    fixtures = backtest.read_fixtures(json.loads(args.fixtures_from.read_text("utf-8"))) if args.fixtures_from else []
    joined, _, last_day = gamedata.load_joined(args.games, args.cache)
    since = datetime.fromisoformat(args.holdout).replace(tzinfo=UTC)
    table = rulers(shipped_and_sorare(joined, fixtures, since))
    print(f"LaLiga starts from {args.holdout} to {last_day.date()} (football-data.co.uk's last match day)\n")
    print(render(table))
    if args.json:
        args.json.write_text(json.dumps(table, indent=2, default=str), "utf-8")
    return 0


if __name__ == "__main__":  # pragma: no cover
    raise SystemExit(main())
