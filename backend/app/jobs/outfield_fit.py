"""Fit the outfield positions' number and say whether it beats today's (plans/xscore.md P9 X4; roadmap 10.4).

    cd backend
    python -m app.jobs.outfield_fit --fixtures-from data/raw/sorare_history.json [--through 2026-09-30] [--write]

As `app.jobs.keeper_fit`, for defenders, midfielders and forwards: each week's starts predicted from the weeks before it only
(`outfield.walk_forward`), scored against today's "if he starts" (the last five games), the position's plain average and Sorare's projection,
by how far from the score, how often within a few points and how often the better of two players of the position and gameweek went first,
with 95% intervals from resampling whole gameweeks. With `--write`, fits each position on every start up to `--through` and writes
`artifacts/outfield_score.json`, which the refresh reads.
"""

from __future__ import annotations

import argparse
import json
from collections import defaultdict
from collections.abc import Sequence
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any

import numpy as np

from app.sorare import backtest, gamedata, league, outfield
from app.sorare.audit import FLOOR


def _row(model: str, w: outfield.Walked, expected: float) -> backtest.Row:
    return backtest.Row(
        model=model,
        player=w.player,
        pos=w.pos,
        date=w.date,
        week=w.week,
        competition=gamedata.COMPETITION,
        klass="league",
        before=0,
        score=w.score,
        played=True,
        started=True,
        expected=expected,
    )


def _block(pairs: list[tuple[outfield.Walked, float]], model: str) -> dict[str, Any]:
    if not pairs:
        return {"games": 0}
    said = np.array([v for _, v in pairs], dtype=float)
    score = np.array([w.score for w, _ in pairs], dtype=float)
    pair = backtest.pair_accuracy([_row(model, w, v) for w, v in pairs], model)
    return {
        "games": len(pairs),
        **league._misses(said, score),
        "pair": {k: pair[k] for k in ("rate", "lo", "hi", "pairs")},
    }


def evaluate(
    walked: Sequence[outfield.Walked], today: dict[tuple[str, datetime], float], average: dict[str, float] | None = None
) -> dict[str, Any]:
    """Per position: the new number against today's, the position's average and Sorare's projection, on the starts the new number was
    predicted for. `average` is each position's mean score over all its starts (an approximation of a plain average)."""
    out: dict[str, Any] = {}
    for pos in outfield.POSITIONS:
        mine = [w for w in walked if w.pos == pos]
        if not mine:
            continue
        found = [(w, today[(w.player, w.date)]) for w in mine if (w.player, w.date) in today]
        pooled = (
            [_row("today", w, v) for w, v in found]
            + [_row("new", w, w.said) for w, _ in found]
            + [_row("sorare", w, w.proj) for w, _ in found if w.proj is not None]
        )
        out[pos] = {
            "games": len(mine),
            "weeks": len({w.week for w in mine}),
            "new": _block([(w, w.said) for w in mine], "new"),
            "today": _block(found, "today"),
            "sorare": _block([(w, w.proj) for w in mine if w.proj is not None], "sorare"),
            "average": _block([(w, average[pos]) for w in mine], "average") if average else None,
            "diff": {m: backtest.compare(pooled, "new", "today", metric=m) for m in ("absolute", "squared")},
        }
    return out


def _pct(v: float | None) -> str:
    return "–" if v is None else f"{v * 100:.1f}%"


def _line(name: str, b: dict[str, Any] | None) -> str:
    if not b or not b.get("games"):
        return f"| {name} | 0 | – | – | – | – | – |"
    if b["games"] < FLOOR:
        return f"| {name} | {b['games']} | too few to tell | | | | |"
    p = b["pair"]
    ci = "" if p["lo"] is None else f" [{p['lo'] * 100:.1f}, {p['hi'] * 100:.1f}]"
    return f"| {name} | {b['games']} | {b['mae']:.2f} | {b['rmse']:.2f} | {b['bias']:+.2f} | {_pct(b['within']['7'])} | {_pct(p['rate'])}{ci} |"


def render(table: dict[str, Any]) -> str:
    lines: list[str] = []
    for pos, t in table.items():
        lines += [
            f"**{pos}**: {t['games']} starts over {t['weeks']} gameweeks, each predicted from the weeks before it.",
            "",
            "| number | starts | typical miss | squared miss (RMSE) | leans | within ±7 | better of two [95%] |",
            "|---|---|---|---|---|---|---|",
            _line('today\'s "if he starts"', t["today"]),
            _line("the position's average", t["average"]),
            _line("Sorare's projection", t["sorare"]),
            _line("the new number", t["new"]),
            "",
        ]
        for metric, label in (("squared", "squared miss"), ("absolute", "typical miss")):
            d = t["diff"][metric]
            if d["diff"] is not None:
                lines.append(
                    f"The new number's {label} minus today's: {d['diff']:+.2f} [{d['lo']:+.2f}, {d['hi']:+.2f}] over {d['weeks']} gameweeks"
                )
        lines.append("")
    return "\n".join(lines)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--games", type=Path, default=gamedata.DEFAULT_GAMES)
    parser.add_argument("--cache", type=Path, default=gamedata.DEFAULT_CACHE)
    parser.add_argument("--fixtures-from", type=Path, required=True)
    parser.add_argument("--through", default=None, help="fit only on starts up to this day (YYYY-MM-DD)")
    parser.add_argument("--write", action="store_true", help=f"write {outfield.ARTIFACT.name}")
    parser.add_argument("--json", type=Path, default=None, help="also write the evaluation's numbers here")
    args = parser.parse_args(argv)

    fixtures = backtest.read_fixtures(json.loads(args.fixtures_from.read_text("utf-8")))
    joined, unmatched, last_day = gamedata.load_joined(args.games, args.cache)
    starts = outfield.starts_from_games(joined, fixtures)
    print(
        f"{len(starts)} outfield starts; football-data.co.uk holds matches up to {last_day.date()}; unmatched clubs: {sorted(unmatched)}"
    )
    walked = outfield.walk_forward(starts)
    players = gamedata.players_of(joined)
    today = {
        (r.player, r.date): float(r.start)
        for r in backtest.walk_forward(players, fixtures=fixtures)
        if r.model == "today" and r.started and r.start is not None and r.pos in outfield.POSITIONS
    }
    by_pos: dict[str, list[float]] = defaultdict(list)
    for s in starts:
        by_pos[s.pos].append(s.score)
    average = {pos: float(np.mean(v)) for pos, v in by_pos.items()}
    table = evaluate(walked, today, average)
    print(render(table))
    if args.json:
        args.json.write_text(json.dumps(table, indent=2, default=str), "utf-8")
    if args.write:
        cut = (
            None
            if args.through is None
            else datetime.fromisoformat(args.through).replace(tzinfo=UTC) + timedelta(days=1)
        )
        models = outfield.fit_all([s for s in starts if cut is None or s.date < cut], through=args.through)
        outfield.save(outfield.ARTIFACT, models)
        subs = outfield.subs_from_games(
            [g for g in joined if cut is None or datetime.fromisoformat(g["date"].replace("Z", "+00:00")) < cut]
        )
        outfield.save_subs(outfield.SUB_ARTIFACT, subs)
        print(f"wrote {outfield.SUB_ARTIFACT}: " + ", ".join(f"{p} {m.games} appearances" for p, m in subs.items()))
        print(f"wrote {outfield.ARTIFACT}: " + ", ".join(f"{p} {m.starts} starts" for p, m in models.items()))
    return 0


if __name__ == "__main__":  # pragma: no cover
    raise SystemExit(main())
