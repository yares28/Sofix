"""Fit the goalkeeper's number and say whether it beats today's (plans/xscore.md P9 X3; roadmap 10.3).

    cd backend
    python -m app.jobs.keeper_fit --fixtures-from data/raw/sorare_history.json [--through 2026-09-30] [--write]

Reads the games export (`app.jobs.export_games`) joined to the football model's forecast, shots and over/under prices
(`app.sorare.gamedata`), takes every keeper start, and:

1. predicts each week's starts from the weeks before it only (`keeper.walk_forward`) and prints how far that was from what the keeper
   scored, beside today's "if he starts" (the last five games, `forecast.py`), the keepers' plain average and Sorare's own
   projection, with how often each was within a few points, how often it put the better of two keepers first, and the 95% interval
   of the difference (resampling whole gameweeks, as the Audit does);
2. with `--write`, fits the model on every start up to `--through` and writes `artifacts/keeper_score.json`, which the refresh reads.

Read only apart from that file.
"""

from __future__ import annotations

import argparse
import json
import sys
from collections import defaultdict
from collections.abc import Sequence
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any

import numpy as np

from app.sorare import backtest, gamedata, keeper, league
from app.sorare.audit import FLOOR

BANDS = (
    0.0,
    0.12,
    0.2,
    0.27,
    0.35,
    1.0,
)  # of the chance of a decisive action: where it is checked against what happened


def _row(model: str, w: keeper.Walked, expected: float) -> backtest.Row:
    return backtest.Row(
        model=model,
        player=w.player,
        pos="GK",
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


def _block(rows: list[tuple[keeper.Walked, float]], model: str) -> dict[str, Any]:
    """How one number did on these starts: how far from the score and how often within a few points, and how often it put the
    better of two keepers of one gameweek first."""
    if not rows:
        return {"games": 0}
    said = np.array([value for _, value in rows], dtype=float)
    score = np.array([w.score for w, _ in rows], dtype=float)
    pair = backtest.pair_accuracy([_row(model, w, value) for w, value in rows], model)
    return {
        "games": len(rows),
        **league._misses(said, score),
        "pair": {k: pair[k] for k in ("rate", "lo", "hi", "pairs")},
    }


def evaluate(
    walked: Sequence[keeper.Walked],
    today: dict[tuple[str, datetime], float],
    average: dict[tuple[str, datetime], float] | None = None,
) -> dict[str, Any]:
    """The new number against today's "if he starts", the keepers' average and Sorare's projection, on the starts the new number was
    predicted for (each from the weeks before it). Numbers only."""
    found = [(w, today[(w.player, w.date)]) for w in walked if (w.player, w.date) in today]
    new = [(w, w.said.start) for w in walked]
    sorare = [(w, w.proj) for w in walked if w.proj is not None]
    pooled = (
        [_row("today", w, value) for w, value in found]
        + [_row("new", w, w.said.start) for w, _ in found]
        + [_row("sorare", w, w.proj) for w, _ in found if w.proj is not None]
    )
    out: dict[str, Any] = {
        "games": len(walked),
        "weeks": len({w.week for w in walked}),
        "from": min(w.date for w in walked).date().isoformat() if walked else None,
        "to": max(w.date for w in walked).date().isoformat() if walked else None,
        "new": _block(new, "new"),
        "today": _block(found, "today"),
        "sorare": _block(sorare, "sorare"),
        "diff": {metric: backtest.compare(pooled, "new", "today", metric=metric) for metric in ("absolute", "squared")},
        "diffSorare": {"squared": backtest.compare(pooled, "new", "sorare", metric="squared")},
        "range": float(np.mean([w.said.low <= w.score <= w.said.high for w in walked])) if walked else None,
        "decisive": [],
    }
    if average:
        out["average"] = _block(
            [(w, average[(w.player, w.date)]) for w in walked if (w.player, w.date) in average], "average"
        )
    for low, high in zip(BANDS, BANDS[1:], strict=False):
        inside = [w for w in walked if low < w.said.p_decisive <= high]
        if inside:
            out["decisive"].append(
                {
                    "band": [low, high],
                    "games": len(inside),
                    "said": float(np.mean([w.said.p_decisive for w in inside])),
                    "happened": float(np.mean([w.decisive for w in inside])),
                }
            )
    return out


def _percent(value: float | None) -> str:
    return "–" if value is None else f"{value * 100:.1f}%"


def _line(name: str, block: dict[str, Any]) -> str:
    if not block.get("games"):
        return f"| {name} | 0 | – | – | – | – | – |"
    if block["games"] < FLOOR:
        return f"| {name} | {block['games']} | too few to tell | | | | |"
    pair = block["pair"]
    interval = "" if pair["lo"] is None else f" [{pair['lo'] * 100:.1f}, {pair['hi'] * 100:.1f}]"
    return (
        f"| {name} | {block['games']} | {block['mae']:.2f} | {block['rmse']:.2f} | {block['bias']:+.2f} | "
        f"{_percent(block['within']['7'])} | {_percent(pair['rate'])}{interval} |"
    )


def render(table: dict[str, Any]) -> str:
    """The table as it goes into plans/xscore.md."""
    lines = [
        f"{table['games']} keeper starts over {table['weeks']} gameweeks, {table['from']} to {table['to']}, each predicted from the weeks before it.",
        "",
        "| number | starts | typical miss | squared miss (RMSE) | leans | within ±7 | better of two keepers [95%] |",
        "|---|---|---|---|---|---|---|",
        _line('today\'s "if he starts"', table["today"]),
    ]
    if "average" in table:
        lines.append(_line("the keepers' average", table["average"]))
    lines += [_line("Sorare's projection", table["sorare"]), _line("the new number", table["new"]), ""]
    for metric, label in (("squared", "squared miss"), ("absolute", "typical miss")):
        d = table["diff"][metric]
        if d["diff"] is not None:
            lines.append(
                f"The new number's {label} minus today's: {d['diff']:+.2f} [{d['lo']:+.2f}, {d['hi']:+.2f}] over {d['weeks']} gameweeks"
                + (" (too few to tell)" if d["n"] < FLOOR else "")
            )
    s = table["diffSorare"]["squared"]
    if s["diff"] is not None:
        lines.append(f"Minus Sorare's projection (squared miss): {s['diff']:+.2f} [{s['lo']:+.2f}, {s['hi']:+.2f}]")
    lines += [
        "",
        f"The range held {_percent(table['range'])} of scores (aim 80%).",
        "",
        "| chance of a decisive action | starts | said | happened |",
        "|---|---|---|---|",
    ]
    for band in table["decisive"]:
        lines.append(
            f"| {band['band'][0]:.0%} to {band['band'][1]:.0%} | {band['games']} | {_percent(band['said'])} | {_percent(band['happened'])} |"
        )
    return "\n".join(lines)


def running_average(
    starts: Sequence[keeper.Start], walked: Sequence[keeper.Walked]
) -> dict[tuple[str, datetime], float]:
    """The mean score of every start before each predicted start's gameweek: the plain average a keeper number has to beat."""
    first: dict[str, datetime] = defaultdict(lambda: datetime.max.replace(tzinfo=UTC))
    for w in walked:
        first[w.week] = min(first[w.week], w.date)
    return {(w.player, w.date): float(np.mean([s.score for s in starts if s.date < first[w.week]])) for w in walked}


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--games", type=Path, default=gamedata.DEFAULT_GAMES)
    parser.add_argument("--cache", type=Path, default=gamedata.DEFAULT_CACHE)
    parser.add_argument(
        "--fixtures-from",
        type=Path,
        required=True,
        help="a history file of app.jobs.export_history, for Sorare's gameweeks",
    )
    parser.add_argument(
        "--through", default=None, help="fit only on starts up to this day (YYYY-MM-DD); the rest stay unseen"
    )
    parser.add_argument("--write", action="store_true", help=f"write {keeper.ARTIFACT.name}")
    parser.add_argument("--json", type=Path, default=None, help="also write the evaluation's numbers here")
    args = parser.parse_args(argv)

    fixtures = backtest.read_fixtures(json.loads(args.fixtures_from.read_text("utf-8")))
    joined, unmatched, last_day = gamedata.load_joined(args.games, args.cache)
    starts = keeper.starts_from_games(joined, fixtures)
    print(
        f"{len(starts)} keeper starts; football-data.co.uk holds matches up to {last_day.date()}; unmatched clubs: {sorted(unmatched)}"
    )
    walked = keeper.walk_forward(starts)
    players = gamedata.players_of(joined)
    today = {
        (row.player, row.date): float(row.start)
        for row in backtest.walk_forward(players, fixtures=fixtures)
        if row.model == "today" and row.pos == "GK" and row.started and row.start is not None
    }
    table = evaluate(walked, today, running_average(starts, walked))
    print(render(table))
    seasons = defaultdict(list)
    for w in walked:
        seasons[gamedata.season_of(w.date.isoformat())].append(w)
    for season, part in sorted(seasons.items()):
        print(f"\n### {season} only\n")
        print(render(evaluate(part, today, running_average(starts, part))))
    if args.json:
        args.json.write_text(json.dumps(table, indent=2, default=str), "utf-8")
    if args.write:
        cut = (
            None
            if args.through is None
            else datetime.fromisoformat(args.through).replace(tzinfo=UTC) + timedelta(days=1)
        )
        fitted = keeper.fit([s for s in starts if cut is None or s.date < cut], through=args.through)
        if fitted is None:
            print("too few starts to fit a model", file=sys.stderr)
            return 1
        keeper.save(keeper.ARTIFACT, fitted)
        print(f"\nwrote {keeper.ARTIFACT} ({fitted.starts} starts through {fitted.through})")
    return 0


if __name__ == "__main__":  # pragma: no cover
    raise SystemExit(main())
