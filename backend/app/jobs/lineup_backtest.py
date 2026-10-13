"""Replay the lineup strategies on two seasons of real games (plans/lineups-and-xscore.md Phase 2; every change to how lineups are picked is judged here).

    cd backend
    python -m app.jobs.lineup_backtest [--pools 600] [--seed 7] [--week 30]

Each pool is 30 players who started in one gameweek (3 keepers, 9 defenders, 9 midfielders, 9 forwards), each with the number the model
would have given him from the weeks before (`outfield.walk_forward`, `keeper.walk_forward`) and what he really scored. Every strategy of
`app.sorare.strategies`, the code the refresh uses, builds a lineup from the pool with those numbers; the lineup is then scored on the real
scores, the captain's counting half as much again. Beside them a random lineup, and the best one in hindsight. "Good" and "great" are
the random lineups' 90th and 99th percentile. Prints only: nothing is written. "Surest starters" is left out: everyone in a pool started.
"""

from __future__ import annotations

import argparse
import random
import sys
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import numpy as np

from app.sorare import gamedata, keeper, outfield, strategies
from app.sorare.model import CLASSIC, Card, Competition, Forecast
from app.sorare.planner import Lineup

CAPTAIN_BONUS = 0.5
SIZES = {"GK": 3, "DEF": 9, "MID": 9, "FWD": 9}
SKIPPED = {"surest"}
COMP = Competition(
    key="replay",
    slug="replay",
    name="Replay",
    group=CLASSIC,
    rarity="limited",
    starters=[("GK",), ("DEF",), ("MID",), ("FWD",), ("DEF", "MID", "FWD")],
    subs=[],
    captain_bonus=CAPTAIN_BONUS,
)


def rows_of(joined: list[dict[str, Any]]) -> dict[str, list[dict[str, Any]]]:
    """Every start the model can number, by gameweek: his club, game, side, the odds, the number said and the score."""
    where: dict[tuple[str, datetime], dict[str, Any]] = {}
    for game in joined:
        when = datetime.fromisoformat(game["date"].replace("Z", "+00:00")).astimezone(UTC)
        chances = (game.get("ctx") or {}).get("forecast")
        for slug, row in game["players"].items():
            if not row["started"]:
                continue
            home = row["team"] == game["home"]["slug"]
            odds = (
                {
                    "win": chances["p_h" if home else "p_a"],
                    "draw": chances["p_d"],
                    "loss": chances["p_a" if home else "p_h"],
                }
                if chances
                else None
            )
            where[(slug, when)] = {"club": row["team"], "game": game["id"], "venue": "H" if home else "A", "odds": odds}
    starts = [
        (w.week, w.date, w.player, "GK", w.score, w.proj, w.said.start, w.said)
        for w in keeper.walk_forward(keeper.starts_from_games(joined))
    ] + [
        (w.week, w.date, w.player, w.pos, w.score, w.proj, w.said, w.shape)
        for w in outfield.walk_forward(outfield.starts_from_games(joined))
    ]
    weeks: dict[str, list[dict[str, Any]]] = {}
    for week, date, player, pos, score, proj, said, shape in starts:
        place = where.get((player, date))
        if place is None or shape is None:
            continue
        weeks.setdefault(week, []).append(
            {"player": player, "pos": pos, "score": score, "proj": proj, "said": said, "shape": shape, **place}
        )
    return weeks


def pool_of(rows: list[dict[str, Any]], rng: random.Random) -> list[dict[str, Any]] | None:
    """30 players, one start each, in the usual shares; None when the week is too thin to draw them."""
    chosen: list[dict[str, Any]] = []
    for pos, size in SIZES.items():
        mine = {r["player"]: r for r in rows if r["pos"] == pos}
        if len(mine) < size:
            return None
        chosen += rng.sample(list(mine.values()), size)
    return chosen


def setup(
    pool: list[dict[str, Any]],
) -> tuple[list[Card], dict[str, Forecast], dict[str, Forecast], dict[str, Forecast], dict]:
    """The cards and three sets of numbers for one pool: the model's, Sorare's own projection (the model's where it has none), and hindsight's."""
    cards = [
        Card(slug=r["player"], player=r["player"], name=r["player"], positions=(r["pos"],), rarity="limited", in_season=True,
             level=0, average=45.0, club=r["club"])
        for r in pool
    ]  # fmt: skip

    def numbers(mu: Any) -> dict[str, Forecast]:
        return {
            r["player"]: Forecast(p_play=1.0, mu=float(mu(r)), shape=r["shape"], links=((r["game"], r["venue"]),))
            for r in pool
        }

    games = {r["player"]: [{"odds": r["odds"]}] if r["odds"] else [] for r in pool}
    return (
        cards,
        numbers(lambda r: r["said"]),
        numbers(lambda r: r["proj"] if r["proj"] is not None else r["said"]),
        numbers(lambda r: r["score"]),
        games,
    )


def total(lineup: Lineup | None, scores: dict[str, float]) -> float | None:
    if lineup is None:
        return None
    points = [scores[c.player] for c in lineup.starters]
    return sum(points) + CAPTAIN_BONUS * points[lineup.captain]


def random_lineup(pool: list[dict[str, Any]], rng: random.Random) -> float:
    """A random card for each slot (the extra one from the rest of the outfield), a random captain."""
    by_pos = {pos: rng.sample([r for r in pool if r["pos"] == pos], 1)[0] for pos in ("GK", "DEF", "MID", "FWD")}
    taken = {r["player"] for r in by_pos.values()}
    extra = rng.choice([r for r in pool if r["pos"] != "GK" and r["player"] not in taken])
    picked = [*by_pos.values(), extra]
    return sum(r["score"] for r in picked) + CAPTAIN_BONUS * rng.choice(picked)["score"]


def replay(weeks: dict[str, list[dict[str, Any]]], pools: int, seed: int) -> dict[str, Any]:
    rng = random.Random(seed)
    names = [s.key for s in strategies.STRATEGIES if s.key not in SKIPPED]
    got: dict[str, list[float]] = {key: [] for key in [*names, "random", "hindsight"]}
    pairs: list[tuple[float, float]] = []  # (hindsight, xScore) on the same pool
    while len(got["random"]) < pools:
        pool = pool_of(weeks[rng.choice(sorted(weeks))], rng)
        if pool is None:
            continue
        cards, model, sorare, hindsight, games = setup(pool)
        scores = {r["player"]: r["score"] for r in pool}
        found = {"hindsight": strategies.pick(strategies.BY_KEY["xscore"], COMP, cards, hindsight, games)}
        for key in names:
            strategy = strategies.BY_KEY[key]
            found[key] = strategies.pick(strategy, COMP, cards, sorare if strategy.source == "sorare" else model, games)
        points = {key: total(lineup, scores) for key, lineup in found.items()}
        if any(v is None for v in (points["xscore"], points["hindsight"])):
            continue
        for key, value in points.items():
            if value is not None:
                got[key].append(value)
        got["random"].append(random_lineup(pool, rng))
        pairs.append((points["hindsight"], points["xscore"]))  # type: ignore[arg-type]
    good, great = (float(v) for v in np.percentile(got["random"], [90, 99]))
    best = float(np.mean([h for h, _ in pairs]))
    table = {
        key: {
            "pools": len(values),
            "mean": float(np.mean(values)),
            "good": float(np.mean(np.array(values) >= good)),
            "great": float(np.mean(np.array(values) >= great)),
            "share": float(np.mean(values)) / best,
        }
        for key, values in got.items()
        if values
    }
    return {"table": table, "good": good, "great": great, "pools": pools}


def render(found: dict[str, Any]) -> str:
    label = {s.key: s.label for s in strategies.STRATEGIES} | {
        "random": "Random lineup",
        "hindsight": "Best in hindsight",
    }
    lines = [
        f"{found['pools']} pools of 30 starters. Good = {found['good']:.0f} points or more, great = {found['great']:.0f} (the random lineups' 90th and 99th percentile).",
        "",
        "| strategy | pools | mean points | good | great | share of best |",
        "|---|---|---|---|---|---|",
    ]
    for key, row in sorted(found["table"].items(), key=lambda item: -item[1]["mean"]):
        lines.append(
            f"| {label.get(key, key)} | {row['pools']} | {row['mean']:.1f} | {row['good']:.1%} | {row['great']:.1%} | {row['share']:.1%} |"
        )
    return "\n".join(lines)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--games", type=Path, default=gamedata.DEFAULT_GAMES)
    parser.add_argument("--cache", type=Path, default=gamedata.DEFAULT_CACHE)
    parser.add_argument("--pools", type=int, default=600)
    parser.add_argument("--seed", type=int, default=7)
    args = parser.parse_args(argv)
    joined, _, _ = gamedata.load_joined(args.games, args.cache)
    weeks = rows_of(joined)
    print(f"{sum(len(v) for v in weeks.values())} numbered starts in {len(weeks)} gameweeks")
    print(render(replay(weeks, args.pools, args.seed)))
    return 0


if __name__ == "__main__":  # pragma: no cover
    sys.exit(main())
