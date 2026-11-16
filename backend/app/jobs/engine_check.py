"""The score engine's ruler: every number scored the same way on the same starts (plans/score-engine.md §5, E0).

    cd backend
    python -m app.jobs.engine_check [--holdout 2026-10-01] [--fixtures-from <file with Sorare's gameweeks>] [--json out.json]
    python -m app.jobs.engine_check --engine [--holdout 2026-10-01 | --holdout 2025-08-01 --until 2026-10-01 --refit]
    python -m app.jobs.engine_check --tune          # fit the engine on 2023/24-2024/25 into artifacts/score_engine.json

Reads the local games export (`app.jobs.export_games`) joined to the football model (`app.sorare.gamedata`) and, for every LaLiga
start from `--holdout` on (the weeks no number was tuned on), prints per position, for each number: how far it was from the score
(the typical and the squared miss), how often it landed within 3, 7, 10 and 15 points, which way it leans, its chance of a decisive
action against what happened band by band, and its difference from the shipped number with a 95% interval (whole weeks resampled).

The numbers today: the shipped keeper and outfield lines as production runs them (no Sorare projection, 26 Oct 2026), and Sorare's
projection, the yardstick. `--engine` adds the score engine's phases (`app.sorare.engine.walk`): E1 to E3 as all-around parts on top of
the shipped line's decisive part, E4 as a whole score, and the all-around part alone, each chance of a decisive kind band by band and
E3's minutes. `--refit` refits the shipped lines each week on the weeks before it (from 2025/26, as production fits them), for the
build window; without it they are the fitted files production runs (through 30 Sep 2026), for the held-out weeks. Nothing is sent
anywhere; Sorare's gameweeks only group the weeks (the calendar week does without them).
"""

from __future__ import annotations

import argparse
import json
from collections import defaultdict
from dataclasses import dataclass, replace
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


def _diff(block: dict[str, Any], metric: str = "absolute") -> str:
    d = (block.get("diff") or {}).get(metric) or {}
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
            f"| number | starts | typical miss | squared miss | leans | ±3 | ±7 | ±15 | typical miss minus {BASE}'s [95%] "
            f"| squared miss minus {BASE}'s [95%] |",
            "|---|---|---|---|---|---|---|---|---|---|",
        ]
        for model, b in numbers.items():
            w = b["within"]
            lines.append(
                f"| {model} | {b['n']} | {b['mae']:.2f} | {b['rmse']:.2f} | {b['bias']:+.2f} | "
                f"{_pct(w['3'])} | {_pct(w['7'])} | {_pct(w['15'])} | {_diff(b)} | {_diff(b, 'squared')} |"
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


def shipped_and_sorare(
    joined: list[dict[str, Any]], fixtures: list[dict[str, str]], since: datetime, until: datetime | None = None
) -> list[Said]:
    """Every LaLiga start from `since` on, as the shipped lines say it today (no Sorare projection) and as Sorare projected it."""
    rows: list[Said] = []
    goalkeeping = keeper.load()
    for k in keeper.starts_from_games(joined, fixtures):
        if k.date < since or (until is not None and k.date >= until):
            continue
        if goalkeeping is not None:
            out = goalkeeping.predict(k.numbers, None)
            rows.append(Said(BASE, k.player, "GK", k.date, k.week, k.score, out.start, out.p_decisive, k.decisive))
        if k.proj is not None:
            rows.append(Said("sorare", k.player, "GK", k.date, k.week, k.score, k.proj))
    lines = outfield.load()
    for s in outfield.starts_from_games(joined, fixtures):
        if s.date < since or (until is not None and s.date >= until):
            continue
        model = lines.get(s.pos)
        if model is not None:
            out = model.outcome(s.numbers, s.home, s.own_dec, s.own_score, None)
            rows.append(Said(BASE, s.player, s.pos, s.date, s.week, s.score, out.start, out.p_decisive, s.decisive))
        if s.proj is not None:
            rows.append(Said("sorare", s.player, s.pos, s.date, s.week, s.score, s.proj))
    return rows


SHIPPED_FROM = datetime(2025, 8, 1, tzinfo=UTC)  # the shipped lines are fitted on 2025/26 on


def shipped_refit(
    joined: list[dict[str, Any]], fixtures: list[dict[str, str]], since: datetime, until: datetime
) -> list[Said]:
    """The shipped lines walked forward: each week's starts from a line fitted on the earlier weeks' starts (2025/26 on), no projection."""
    rows: list[Said] = []
    keepers = [k for k in keeper.starts_from_games(joined, fixtures) if k.date >= SHIPPED_FROM]
    for week in sorted({k.week for k in keepers if since <= k.date < until}):
        now = [k for k in keepers if k.week == week]
        model = keeper.fit([k for k in keepers if k.date < min(one.date for one in now)])
        if model is not None:
            for k in now:
                out = model.predict(k.numbers, None)
                rows.append(Said(BASE, k.player, "GK", k.date, k.week, k.score, out.start, out.p_decisive, k.decisive))
    starts = [s for s in outfield.starts_from_games(joined, fixtures) if s.date >= SHIPPED_FROM]
    for pos in outfield.POSITIONS:
        mine = [s for s in starts if s.pos == pos]
        for week in sorted({s.week for s in mine if since <= s.date < until}):
            now = [s for s in mine if s.week == week]
            line = outfield.fit([s for s in mine if s.date < min(one.date for one in now)], pos)
            if line is not None:
                for s in now:
                    o = line.outcome(s.numbers, s.home, s.own_dec, s.own_score, None)
                    rows.append(Said(BASE, s.player, pos, s.date, s.week, s.score, o.start, o.p_decisive, s.decisive))
    return rows


def engine_said(
    joined: list[dict[str, Any]], shipped: list[Said], settings: Any, since: datetime, until: datetime | None
) -> tuple[list[Said], list[Said], list[Any]]:
    """The engine's phases on the starts the shipped number told: whole scores, all-around parts, and the cases (for the kinds)."""
    from app.sorare.engine import walk

    told = {(r.player, r.date): r for r in shipped if r.model == BASE}
    scores: list[Said] = []
    parts: list[Said] = []
    cases = []
    for c in walk.walk(joined, settings, since.isoformat(), until.isoformat() if until else None):
        base = told.get((c.player, c.when))
        if base is None or base.p_decisive is None:
            continue
        cases.append(c)
        p, (with_one, without) = base.p_decisive, c.levels
        level_part = p * with_one + (1 - p) * without  # E1.4: the shipped line's decisive part
        for phase in ("e1", "e2", "e3"):
            scores.append(replace(base, model=phase, said=min(100.0, max(0.0, c.said[phase] + level_part))))
            parts.append(replace(base, model=phase, score=c.all_around, said=c.said[phase], p_decisive=None))
        scores.append(replace(base, model="e4", said=c.said["e4"], p_decisive=c.p_decisive, decisive=c.level >= 1))
        scores.append(replace(base, model="e4 before the eleven", said=c.said["e4_usual"], p_decisive=None))
        parts.append(replace(base, model="e4", score=c.all_around, said=c.said["e4_aa"], p_decisive=None))
        parts.append(replace(base, score=c.all_around, said=base.said - level_part, p_decisive=None))
    return scores, parts, cases


def kinds_render(cases: list[Any]) -> str:
    """E4's chance of each decisive kind against what happened, per position, band by band; then E3's minutes."""
    from app.sorare.engine import decisive

    lines = ["E4's chance of each kind, said → happened (starts):", ""]
    for pos in POSITIONS:
        mine = [c for c in cases if c.pos == pos]
        for kind in decisive.KINDS:
            rows = [
                Said("k", c.player, pos, c.when, "", 0.0, 0.0, c.kinds[kind], c.happened[kind])
                for c in mine
                if c.kinds.get(kind, 0.0) > 0
            ]
            if sum(1 for r in rows if r.decisive) < 5:
                continue
            lines.append(
                f"- {pos} {kind}: "
                + ", ".join(f"said {_pct(x['said'])} → {_pct(x['happened'])} ({x['n']})" for x in _bands(rows))
            )
    misses = np.array([abs(c.minutes_said - c.minutes) for c in cases]) if cases else np.zeros(1)
    lines += [
        "",
        f"E3's minutes as a starter: within 15 of what he played {_pct(float(np.mean(misses <= 15)))}, "
        f"typical miss {np.mean(misses):.1f}",
    ]
    return "\n".join(lines)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--games", type=Path, default=gamedata.DEFAULT_GAMES)
    parser.add_argument("--cache", type=Path, default=gamedata.DEFAULT_CACHE)
    parser.add_argument("--fixtures-from", type=Path, default=None, help="a file with Sorare's gameweeks (`fixtures`)")
    parser.add_argument("--holdout", default="2026-10-01", help="the first day scored (YYYY-MM-DD)")
    parser.add_argument("--until", default=None, help="the day the scoring stops, not included (YYYY-MM-DD)")
    parser.add_argument(
        "--engine", action="store_true", help="add the score engine's phases (artifacts/score_engine.json)"
    )
    parser.add_argument(
        "--refit", action="store_true", help="walk the shipped lines forward instead of using their files"
    )
    parser.add_argument("--tune", action="store_true", help="fit the engine on 2023/24-2024/25 and write its file")
    parser.add_argument("--json", type=Path, default=None, help="also write the numbers here")
    args = parser.parse_args(argv)
    fixtures = backtest.read_fixtures(json.loads(args.fixtures_from.read_text("utf-8"))) if args.fixtures_from else []
    since = datetime.fromisoformat(args.holdout).replace(tzinfo=UTC)
    until = datetime.fromisoformat(args.until).replace(tzinfo=UTC) if args.until else None
    if args.engine or args.tune:
        from app.sorare.engine import data, walk

        joined, last_day = data.load(args.games, args.cache)
        if args.tune:
            walk.save(walk.ARTIFACT, walk.tune(joined))
            print(f"wrote {walk.ARTIFACT}")
            return 0
    else:
        joined, _, last_day = gamedata.load_joined(args.games, args.cache)
    if args.refit:
        rows = shipped_refit(joined, fixtures, since, until or datetime.now(UTC))
    else:
        rows = shipped_and_sorare(joined, fixtures, since, until)
    parts: list[Said] = []
    cases: list[Any] = []
    if args.engine:
        settings = walk.load()
        if settings is None:
            print("no engine file: run --tune first")
            return 1
        scores, parts, cases = engine_said(joined, rows, settings, since, until)
        rows = rows + scores
    table = rulers(rows)
    end = until.date() if until else last_day.date()
    print(f"LaLiga starts from {args.holdout} to {end} (football-data.co.uk's last match day {last_day.date()})\n")
    print(render(table))
    if args.engine:
        print("All-around part alone (the shipped line's: its number minus its decisive part)\n")
        print(render(rulers(parts)))
        print(kinds_render(cases))
    if args.json:
        args.json.write_text(json.dumps(table, indent=2, default=str), "utf-8")
    return 0


if __name__ == "__main__":  # pragma: no cover
    raise SystemExit(main())
