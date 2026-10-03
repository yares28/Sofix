"""How much does the game move a goalkeeper's score? (plans/xscore.md, P8; roadmap 9.5)

Research script. It joins the goalkeepers' games of the xScore backtest's history export to the pre-match numbers of the production
rating model (Dixon-Coles, the settings in artifacts/dixon_coles.json: the clean-sheet chance and the goals his side is expected to
concede), by date and club, and answers three questions on the games a keeper STARTED:

1. What does a start score when his side concedes 0, 1, 2, 3, 4 or more? (Sorare's rules: a clean sheet is a decisive action worth at
   least 60; each goal conceded costs 3 more than that of the all-around table.)
2. Is today's "if he starts" number too high against the strongest attacks, and does a number built from the game's goals expected
   (`game`: the chance of each number of goals conceded times what a start scored then) correct it?
3. Is any of it closer than today's number to what he scored? Fitted on one set of games and scored on others: the levels are fitted
   on 2025/26 and scored on 2026/27, and, over all games, on each keeper with his own games left out.

    cd backend
    python reports/experiments/keeper_opponent.py --history data/raw/sorare_history.json [--history more.json ...]
        [--cache data/raw/football-data-co-uk] [--holdout 2026-10-01]

Needs the cached football-data.co.uk CSVs (no network) and a history file per `python -m app.jobs.export_history`; extra files are
more goalkeepers (`--players slug,slug --out more.json`). Read only: nothing is written. A keeper-season counts only when his current
club played on the date of every one of his league games that season (a club he left would not).
"""

from __future__ import annotations

import argparse
import json
import logging
import sys
from math import exp, factorial
from pathlib import Path

BACKEND = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(BACKEND))  # runnable as a plain script

import numpy as np  # noqa: E402
import pandas as pd  # noqa: E402

from app.backtest.data import load_history  # noqa: E402
from app.backtest.methods import dixon_coles  # noqa: E402
from app.backtest.walkforward import run_walkforward  # noqa: E402
from app.services.rating_predictions import load_config  # noqa: E402
from app.sorare import backtest  # noqa: E402

# Sorare's club name -> football-data.co.uk's, for the clubs of the seasons the history covers (2025/26 and 2026/27).
CLUB = {
    "Alavés": "Alaves",
    "Deportivo Alavés": "Alaves",
    "D. Alavés": "Alaves",
    "Athletic Club": "Ath Bilbao",
    "Atlético de Madrid": "Ath Madrid",
    "Atlético Madrid": "Ath Madrid",
    "FC Barcelona": "Barcelona",
    "Barcelona": "Barcelona",
    "Real Betis": "Betis",
    "RC Celta": "Celta",
    "Celta de Vigo": "Celta",
    "Elche CF": "Elche",
    "Elche": "Elche",
    "RCD Espanyol de Barcelona": "Espanol",
    "Espanyol": "Espanol",
    "Getafe CF": "Getafe",
    "Girona FC": "Girona",
    "Levante UD": "Levante",
    "RCD Mallorca": "Mallorca",
    "CA Osasuna": "Osasuna",
    "Real Oviedo": "Oviedo",
    "Rayo Vallecano": "Vallecano",
    "Real Madrid": "Real Madrid",
    "Real Sociedad": "Sociedad",
    "Sevilla FC": "Sevilla",
    "Valencia CF": "Valencia",
    "Villarreal CF": "Villarreal",
    "Real Club Deportivo de La Coruña": "La Coruna",
    "Real Racing Club de Santander": "Santander",
    "Málaga CF": "Malaga",
}
LEVELS_OF = 5  # goals conceded: 0, 1, 2, 3, 4 or more
TOP_ATTACKS = {"Barcelona", "Real Madrid", "Ath Madrid"}


def goal_probs(lam: float) -> np.ndarray:
    """The chance of 0, 1, 2, 3 and 4 or more goals conceded when the side is expected to concede `lam` (Poisson)."""
    p = np.array([exp(-lam) * lam**k / factorial(k) for k in range(LEVELS_OF - 1)])
    return np.append(p, 1 - p.sum())


def fit_levels(games: pd.DataFrame) -> np.ndarray:
    """What a start scored when his side conceded 0, 1, 2, 3, 4+ (the games pooled)."""
    return np.array(
        [games.loc[games["conceded"].clip(upper=LEVELS_OF - 1) == k, "score"].mean() for k in range(LEVELS_OF)]
    )


def structural(lam: float, levels: np.ndarray) -> float:
    return float(goal_probs(lam) @ levels)


def read_players(paths: list[Path]) -> tuple[dict[str, dict], list[dict]]:
    players: dict[str, dict] = {}
    fixtures: list[dict] = []
    for path in paths:
        raw = json.loads(path.read_text("utf-8"))
        players.update(backtest.read_history(raw))
        fixtures = fixtures or backtest.read_fixtures(raw)
    return players, fixtures


def premarket(cache: Path) -> tuple[pd.DataFrame, pd.Timestamp]:
    """Every 2025/26 and 2026/27 league match with the model's forecast from the Monday before it."""
    matches = load_history(range(2016, 2027), cache, refresh_latest=False)
    logging.disable(logging.CRITICAL)
    forecasts = run_walkforward(
        matches,
        [2025, 2026],
        [dixon_coles("dc", load_config(BACKEND / "artifacts" / "dixon_coles.json"))],
        horizon_weeks=1,
    )
    forecasts = forecasts[forecasts["horizon"] == 1].copy()
    forecasts["day"] = forecasts["date"].dt.normalize()
    return forecasts, matches["date"].max()


def side_numbers(forecasts: pd.DataFrame, club: str, day: pd.Timestamp) -> dict | None:
    for shift in (0, -1, 1):  # the history's day is UTC, the CSV's is local
        found = forecasts[
            (forecasts["day"] == day + pd.Timedelta(days=shift))
            & ((forecasts["home"] == club) | (forecasts["away"] == club))
        ]
        if len(found):
            r = found.iloc[0]
            home = r["home"] == club
            return {
                "cs": float(r["cs_h"] if home else r["cs_a"]),
                "xga": float(r["lam_a"] if home else r["lam_h"]),
                "opp": r["away"] if home else r["home"],
                "conceded": int(r["ag"] if home else r["hg"]),
            }
    return None


def keeper_games(players: dict[str, dict], forecasts: pd.DataFrame, last_csv_day: pd.Timestamp) -> pd.DataFrame:
    rows = []
    for slug, entry in players.items():
        club = CLUB.get(str(entry.get("club")))
        if entry.get("pos") != "GK" or not club:
            continue
        for g in entry["games"]:
            if not g.get("played") or g.get("competition") != "laliga-es" or g.get("status") == "PENDING":
                continue
            day = pd.Timestamp(g["date"]).tz_convert("UTC").tz_localize(None).normalize()
            numbers = side_numbers(forecasts, club, day)
            rows.append(
                {
                    "player": slug,
                    "name": entry["name"],
                    "club": club,
                    "day": day,
                    "season": 2026 if day >= pd.Timestamp("2026-07-01") else 2025,
                    "started": bool(g.get("started")),
                    "score": float(g["score"]),
                    "could": day <= last_csv_day,
                    "matched": numbers is not None,
                    **(numbers or {}),
                }
            )
    df = pd.DataFrame(rows)
    seasons = (
        df[df["could"]].groupby(["name", "club", "season"]).agg(games=("score", "size"), matched=("matched", "sum"))
    )
    good = {key for key, r in seasons.iterrows() if r["matched"] / r["games"] >= 0.9 and r["games"] >= 3}
    df["valid"] = [(n, c, s) in good for n, c, s in zip(df["name"], df["club"], df["season"], strict=True)]
    return df[df["valid"] & df["matched"] & df["started"]].sort_values("day").reset_index(drop=True)


def squared_difference(d: pd.DataFrame, a: str, b: str) -> tuple[float, float, float]:
    diff = (d[a] - d["score"]) ** 2 - (d[b] - d["score"]) ** 2
    rng = np.random.default_rng(0)
    means = [diff.to_numpy()[rng.integers(0, len(diff), len(diff))].mean() for _ in range(2000)]
    lo, hi = np.percentile(means, [2.5, 97.5])
    return float(diff.mean()), float(lo), float(hi)


def table(label: str, d: pd.DataFrame, columns: list[str]) -> None:
    print(f"\n### {label}: {len(d)} games started\n")
    print(
        "| number | typical miss (MAE) | squared miss (RMSE) | level (bias) | squared miss minus today's [95%] |\n|---|---|---|---|---|"
    )
    for c in columns:
        err = d[c] - d["score"]
        extra = "" if c == "today" else "{:+.1f} [{:+.1f}, {:+.1f}]".format(*squared_difference(d, c, "today"))
        print(f"| {c} | {err.abs().mean():.2f} | {np.sqrt((err**2).mean()):.2f} | {err.mean():+.2f} | {extra} |")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument(
        "--history", type=Path, action="append", required=True, help="a history file (repeat for more goalkeepers)"
    )
    parser.add_argument("--cache", type=Path, default=BACKEND / "data" / "raw" / "football-data-co-uk")
    parser.add_argument("--holdout", default="2026-10-01", help="games on or after this day are reported apart")
    args = parser.parse_args(argv)
    players, fixtures = read_players(args.history)
    forecasts, last_csv_day = premarket(args.cache)
    use = keeper_games(players, forecasts, last_csv_day)
    today = {
        (r.player, r.date.date()): r.expected
        for r in backtest.walk_conditional(players, fixtures=fixtures)
        if r.pos == "GK" and r.model == "start:today"
    }
    use["today"] = [
        today.get(
            (p, d.date()),
            today.get((p, (d - pd.Timedelta(days=1)).date()), today.get((p, (d + pd.Timedelta(days=1)).date()))),
        )
        for p, d in zip(use["player"], use["day"], strict=True)
    ]
    use = use[use["today"].notna()].reset_index(drop=True)
    print(
        f"{len(use)} games started by {use['name'].nunique()} goalkeepers (2025/26: {(use.season == 2025).sum()}, 2026/27: {(use.season == 2026).sum()})"
    )

    levels = fit_levels(use)
    print("\n### What a start scored when his side conceded 0, 1, 2, 3, 4 or more\n")
    print("| conceded | games | mean score |\n|---|---|---|")
    for k in range(LEVELS_OF):
        part = use[use["conceded"].clip(upper=LEVELS_OF - 1) == k]
        print(f"| {k}{'+' if k == LEVELS_OF - 1 else ''} | {len(part)} | {part['score'].mean():.1f} |")

    print("\n### Against the strongest attacks (today's number, the game's number, what he scored)\n")
    print(
        "| opponent | games | scored | today | game | goals conceded | clean sheet chance |\n|---|---|---|---|---|---|---|"
    )
    use["game"] = [structural(x, levels) for x in use["xga"]]  # in sample: used for the table above only
    for label, mask in (
        *[(name, use["opp"] == name) for name in sorted(TOP_ATTACKS)],
        ("all the others", ~use["opp"].isin(TOP_ATTACKS)),
    ):
        d = use[mask]
        if len(d):
            print(
                f"| {label} | {len(d)} | {d.score.mean():.1f} | {d.today.mean():.1f} | {d.game.mean():.1f} | {d.conceded.mean():.2f} | {d.cs.mean():.2f} |"
            )

    # Scored on games the levels were not fitted on.
    train, test = use[use["season"] == 2025].copy(), use[use["season"] == 2026].copy()
    if len(train) and len(test):
        lv = fit_levels(train)
        for d in (train, test):
            d["game"], d["pooled"] = [structural(x, lv) for x in d["xga"]], float(train["score"].mean())
        table("scored on 2026/27, levels fitted on 2025/26", test, ["today", "pooled", "game"])
    out = []
    for name in use["name"].unique():
        mine, other = use[use["name"] == name].copy(), use[use["name"] != name]
        lv = fit_levels(other)
        mine["game"], mine["pooled"] = [structural(x, lv) for x in mine["xga"]], float(other["score"].mean())
        # How much of the game's effect the other keepers support: the least-squares weight of (game - average) on (score - average).
        average = float(other["score"].mean())
        gap = np.array([structural(x, lv) for x in other["xga"]]) - average
        weight = float(((other["score"].to_numpy() - average) * gap).sum() / (gap**2).sum())
        mine["weight"] = weight
        mine["blend"] = mine["pooled"] + weight * (
            mine["game"] - mine["pooled"]
        )  # the keeper average plus that share of the game's effect
        out.append(mine)
    loo = pd.concat(out).sort_values("day")
    weights = loo.groupby("name")["weight"].first()
    print(
        f"\nShare of the game's effect the other keepers support (one weight per keeper left out): min {weights.min():.2f}, median {weights.median():.2f}, max {weights.max():.2f}"
    )
    # Does the keeper's own level add anything? His average miss from the games before, pulled to zero (k games' worth): walk-forward.
    for k in (10, 20, 40):
        adjusted = []
        for _, r in loo.iterrows():
            before = loo[(loo["player"] == r["player"]) & (loo["day"] < r["day"])]
            miss = (before["score"] - before["blend"]).sum() if len(before) else 0.0
            adjusted.append(r["blend"] + float(miss) / (len(before) + k))
        loo[f"blend+keeper{k}"] = adjusted
    columns = ["today", "pooled", "game", "blend", "blend+keeper10", "blend+keeper20", "blend+keeper40"]
    table("every game, each keeper's own games left out of the levels and the weight", loo, columns)
    hard = loo[loo["opp"].isin(TOP_ATTACKS)]
    if len(hard):
        table("only the games against Barcelona, Real Madrid or Atletico", hard, columns)
    easy = loo[~loo["opp"].isin(TOP_ATTACKS)]
    table("all the other games", easy, columns)
    cut = pd.Timestamp(args.holdout)
    held = loo[loo["day"] >= cut]
    print(f"\nHeld-out weeks (from {args.holdout}): {len(held)} games started" + ("" if len(held) else ": none yet"))
    if len(held):
        table("held out", held, columns)
    return 0


if __name__ == "__main__":  # pragma: no cover
    raise SystemExit(main())
