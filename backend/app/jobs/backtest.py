"""Tune and backtest the LaLiga difficulty model on historical seasons.

    python -m app.jobs.backtest            # full run
    python -m app.jobs.backtest --quick    # small grid, fewer seasons (smoke test)
    python -m app.jobs.backtest --refresh  # re-download the season in progress

Tuning uses the 2019/20–2022/23 seasons. The report scores 2023/24–2025/26, which the
tuning never saw.
"""
from __future__ import annotations

import argparse
import itertools
import json
from concurrent.futures import ProcessPoolExecutor
from dataclasses import asdict
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import pandas as pd

from app.backtest.calibration import CURRENT_THRESHOLDS, band_table, clean_sheet_calibration, propose_thresholds, with_difficulty
from app.backtest.data import load_history, promoted_teams
from app.backtest.methods import base_rates, closing_odds, dixon_coles, elo_fallback
from app.backtest.metrics import summarize
from app.backtest.walkforward import run_ranking, run_walkforward, team_perspective
from app.modeling.dixon_coles import DixonColesConfig, fit_dixon_coles

ROOT = Path(__file__).resolve().parents[2]
CACHE_DIR = ROOT / "data" / "raw" / "football-data-co-uk"
REPORT_PATH = ROOT / "reports" / "backtest_laliga.md"
CONFIG_PATH = ROOT / "artifacts" / "dixon_coles.json"

FIRST_SEASON, CURRENT_SEASON = 2016, 2026
TUNE_SEASONS, TEST_SEASONS = [2019, 2020, 2021, 2022], [2023, 2024, 2025]
HORIZON_BUCKETS = [(1, 1, "1 week"), (2, 3, "2–3 weeks"), (4, 5, "4–5 weeks"), (6, 8, "6–8 weeks")]


def config_grid(quick: bool) -> list[DixonColesConfig]:
    if quick:
        values = itertools.product([0.0, 0.002], [1.0, 0.6], [2.0], [-0.2])
    else:
        values = itertools.product([0.0, 0.001, 0.002, 0.003, 0.005], [1.0, 0.7, 0.4], [1.0, 4.0], [0.0, -0.2])
    return [DixonColesConfig(xi=xi, goals_weight=w, ridge=r, promoted_prior=p) for xi, w, r, p in values]


def with_known_odds(predictions: pd.DataFrame, matches: pd.DataFrame) -> pd.DataFrame:
    """Score every method on the same matches: those with closing odds."""
    known = matches.dropna(subset=["odds_h", "odds_d", "odds_a"])[["date", "home", "away"]]
    return predictions.merge(known, on=["date", "home", "away"], how="inner", validate="many_to_one")


_WORKER_MATCHES: pd.DataFrame | None = None


def _init_worker(matches: pd.DataFrame) -> None:
    """Ship the match history to each worker once, not once per config."""
    global _WORKER_MATCHES
    _WORKER_MATCHES = matches


def evaluate_config(config: DixonColesConfig, seasons: list[int], matches: pd.DataFrame | None = None) -> float:
    """Mean RPS of one config over the given seasons (NaN if the run fails)."""
    matches = _WORKER_MATCHES if matches is None else matches
    try:
        predictions = with_known_odds(run_walkforward(matches, seasons, [dixon_coles("candidate", config)]), matches)
        return float(summarize(predictions, ["method"])["rps"].iloc[0])
    except Exception as exc:  # one bad config must not sink the whole grid
        print(f"config {config} failed: {exc!r}")
        return float("nan")


def tune(matches: pd.DataFrame, seasons: list[int], grid: list[DixonColesConfig], workers: int) -> tuple[DixonColesConfig, pd.DataFrame]:
    print(f"tuning {len(grid)} configs on seasons {seasons} with {workers} workers")
    if workers <= 1:
        scores = [evaluate_config(config, seasons, matches) for config in grid]
    else:
        with ProcessPoolExecutor(max_workers=workers, initializer=_init_worker, initargs=(matches,)) as pool:
            scores = list(pool.map(evaluate_config, grid, [seasons] * len(grid)))
    if np.all(np.isnan(scores)):
        raise RuntimeError("every tuning config failed")
    best = grid[int(np.nanargmin(scores))]
    table = pd.DataFrame([{**asdict(c), "rps": s} for c, s in zip(grid, scores)]).sort_values("rps", ignore_index=True)
    return best, table


def horizon_bucket(horizon: pd.Series) -> pd.Series:
    labels = pd.Series("later", index=horizon.index)
    for low, high, label in HORIZON_BUCKETS:
        labels[(horizon >= low) & (horizon <= high)] = label
    return labels


# ---------------------------------------------------------------- report helpers

def md_table(df: pd.DataFrame, formats: dict[str, str] | None = None) -> str:
    formats = formats or {}
    header = "| " + " | ".join(df.columns) + " |"
    divider = "|" + "|".join("---" for _ in df.columns) + "|"
    body = []
    for _, row in df.iterrows():
        cells = []
        for column in df.columns:
            value = row[column]
            if isinstance(value, float) and np.isnan(value):
                cells.append("—")
            elif column in formats:
                cells.append(format(value, formats[column]))
            else:
                cells.append(str(value))
        body.append("| " + " | ".join(cells) + " |")
    return "\n".join([header, divider, *body])


def goal_bias(test: pd.DataFrame) -> pd.DataFrame:
    """Average forecast vs actual goals per match side, for methods that forecast goals."""
    has_goals = test.dropna(subset=["lam_h", "lam_a"])
    return has_goals.groupby("method").agg(
        predicted_home=("lam_h", "mean"), actual_home=("hg", "mean"),
        predicted_away=("lam_a", "mean"), actual_away=("ag", "mean"),
        predicted_cs_home=("cs_h", "mean"), actual_cs_home=("ag", lambda g: (g == 0).mean()),
        predicted_cs_away=("cs_a", "mean"), actual_cs_away=("hg", lambda g: (g == 0).mean()),
    ).reset_index()


def season_labels(seasons: list[int]) -> str:
    return ", ".join(f"{s}/{(s + 1) % 100:02d}" for s in seasons)


def build_report(
    matches: pd.DataFrame, best: DixonColesConfig, tuning: pd.DataFrame, test: pd.DataFrame, tune_best: pd.DataFrame,
    tune_seasons: list[int], test_seasons: list[int],
) -> str:
    metric_formats = {"rps": ".4f", "log_loss": ".4f", "accuracy": ".1%", "clean_sheet_brier": ".4f", "matches": ".0f"}

    overall = summarize(test, ["method"]).sort_values("rps")
    by_horizon = summarize(test.assign(horizon_bucket=horizon_bucket(test["horizon"])), ["horizon_bucket", "method"])
    order = {label: i for i, (_, _, label) in enumerate(HORIZON_BUCKETS)}
    rps_by_horizon = by_horizon.pivot(index="method", columns="horizon_bucket", values="rps")
    rps_by_horizon = rps_by_horizon[sorted(rps_by_horizon.columns, key=lambda c: order.get(c, len(order)))]
    rps_by_horizon = rps_by_horizon.reset_index().sort_values(rps_by_horizon.columns[0])
    per_tuning_season = summarize(tune_best, ["season_start"])[["season_start", "matches", "rps", "accuracy"]]

    early = test[test["cutoff"].dt.month.isin([8, 9])]
    early_vs_rest = pd.concat([
        summarize(early, ["method"]).assign(period="Aug–Sep cutoffs"),
        summarize(test[~test.index.isin(early.index)], ["method"]).assign(period="Oct–May cutoffs"),
    ]).pivot(index="method", columns="period", values="rps").reset_index()

    ranking = run_ranking(test).rename(columns={"mean": "spearman_next5", "count": "cutoffs"}).sort_values("spearman_next5", ascending=False)

    model_name = "Dixon-Coles (tuned)"
    tuned_tune_rows = with_difficulty(team_perspective(tune_best))
    tuned_test_rows = with_difficulty(team_perspective(test[test["method"] == model_name]))
    proposed = propose_thresholds(tuned_tune_rows["difficulty"])
    band_formats = {"expected_ppg": ".2f", "actual_ppg": ".2f", "win_rate": ".1%", "share": ".1%", "fixtures": ".0f"}

    current_season = int(matches["season_start"].max())
    latest_cutoff = matches["date"].max() + pd.Timedelta(days=1)
    current_teams = matches.loc[matches["season_start"] == current_season, ["home", "away"]].stack().unique()
    current_model = fit_dixon_coles(matches, latest_cutoff, teams=current_teams,
                                    promoted=promoted_teams(matches, current_season), config=best)
    ratings = current_model.ratings()
    ratings = ratings[ratings["team"].isin(current_teams)].reset_index(drop=True)
    ratings.insert(0, "rank", range(1, len(ratings) + 1))

    top_grid = tuning.head(8)[["xi", "goals_weight", "ridge", "promoted_prior", "rps"]]
    half_life = "no decay" if best.xi == 0 else f"{np.log(2) / best.xi:.0f} days"
    test_labels, tune_labels = season_labels(test_seasons), season_labels(tune_seasons)

    return f"""# LaLiga difficulty model — backtest report

Generated {datetime.now(timezone.utc):%Y-%m-%d %H:%M} UTC from football-data.co.uk results ({season_labels([int(matches["season_start"].min())])} → {season_labels([current_season])}).

**Method.** Every Monday of a season, each model is fitted only on matches played before that day and
forecasts every match in the next 8 weeks. Settings were tuned on {tune_labels}; all numbers below are
from **{test_labels}**, which tuning never saw. Every method is scored on the same {overall['matches'].iloc[0]:.0f}
forecasts (matches with closing odds), each match forecast once per horizon.

Metrics: **RPS** (ranked probability score, lower is better; the main score), **log loss** (lower is better),
**accuracy** (most likely outcome was right), **clean-sheet Brier** (lower is better).

## 1. Chosen settings

- Time decay xi = {best.xi} per day (half-life: {half_life})
- Goals weight = {best.goals_weight} (rest is the shots-on-target proxy)
- Ridge = {best.ridge}, promoted-team prior = {best.promoted_prior}

Best configurations on the tuning seasons:

{md_table(top_grid, {"rps": ".4f"})}

Tuned model per tuning season. 2019/20 (restart without crowds) and 2020/21 (no crowds all season)
had much weaker home advantage, so settings that suit them may not suit normal seasons:

{md_table(per_tuning_season, {"season_start": ".0f", "rps": ".4f", "accuracy": ".1%", "matches": ".0f"})}

## 2. Overall accuracy (test seasons)

{md_table(overall, metric_formats)}

## 3. RPS by how far ahead the forecast is

{md_table(rps_by_horizon, {c: ".4f" for c in rps_by_horizon.columns if c != "method"})}

## 4. Early season vs rest of season (RPS)

{md_table(early_vs_rest, {c: ".4f" for c in early_vs_rest.columns if c != "method"})}

## 5. Ranking runs of fixtures (what an FDR is for)

Spearman correlation between each team's forecast points over its next 5 matches and the points it
actually got, averaged over cutoffs (1 = perfect ranking, 0 = no better than random).

{md_table(ranking, {"spearman_next5": ".3f", "cutoffs": ".0f"})}

## 6. Difficulty labels (tuned model, test seasons)

Current thresholds from `app/services/scoring.py` {CURRENT_THRESHOLDS}:

{md_table(band_table(tuned_test_rows, CURRENT_THRESHOLDS), band_formats)}

Proposed thresholds {proposed} (15 / 20 / 30 / 20 / 15 % of fixtures, fitted on the tuning seasons):

{md_table(band_table(tuned_test_rows, proposed), band_formats)}

## 7. Clean-sheet calibration (tuned model, test seasons)

{md_table(clean_sheet_calibration(tuned_test_rows), {"predicted": ".1%", "observed": ".1%", "fixtures": ".0f"})}

Forecast vs actual goals and clean sheets per match (test seasons):

{md_table(goal_bias(test), {c: (".1%" if "cs" in c else ".3f") for c in goal_bias(test).columns if c != "method"})}

## 8. Current ratings ({season_labels([current_season])}, data through {matches['date'].max():%Y-%m-%d})

Log-scale: +0.10 attack ≈ 10% more goals than an average team; +0.10 defence ≈ 10% fewer conceded.
Home advantage = {current_model.home_adv:+.3f}, rho = {current_model.rho:+.3f}.

{md_table(ratings, {"attack": "+.3f", "defence": "+.3f", "overall": "+.3f"})}
"""


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--quick", action="store_true", help="small grid and one season each (smoke test)")
    parser.add_argument("--refresh", action="store_true", help="re-download the season in progress")
    parser.add_argument("--workers", type=int, default=6)
    args = parser.parse_args()

    tune_seasons = TUNE_SEASONS[-1:] if args.quick else TUNE_SEASONS
    test_seasons = TEST_SEASONS[-1:] if args.quick else TEST_SEASONS

    matches = load_history(range(FIRST_SEASON, CURRENT_SEASON + 1), CACHE_DIR, refresh_latest=args.refresh)
    print(f"loaded {len(matches)} matches, {matches['date'].min():%Y-%m-%d} → {matches['date'].max():%Y-%m-%d}")

    best, tuning = tune(matches, tune_seasons, config_grid(args.quick), args.workers)
    print("best config:", best)

    tune_best = run_walkforward(matches, tune_seasons, [dixon_coles("Dixon-Coles (tuned)", best)])
    static = DixonColesConfig(xi=0.0, goals_weight=1.0, ridge=best.ridge, promoted_prior=0.0)
    methods = [
        dixon_coles("Dixon-Coles (tuned)", best),
        dixon_coles("Dixon-Coles (no form, goals only)", static),
        elo_fallback(),
        base_rates(),
        closing_odds(),
    ]
    print(f"backtesting {len(methods)} methods on seasons {test_seasons}")
    test = with_known_odds(run_walkforward(matches, test_seasons, methods), matches)

    report = build_report(matches, best, tuning, test, with_known_odds(tune_best, matches), tune_seasons, test_seasons)
    REPORT_PATH.parent.mkdir(parents=True, exist_ok=True)
    REPORT_PATH.write_text(report, encoding="utf-8")
    CONFIG_PATH.parent.mkdir(parents=True, exist_ok=True)
    CONFIG_PATH.write_text(json.dumps({"model": "dixon-coles", **asdict(best)}, indent=2), encoding="utf-8")
    print(f"report → {REPORT_PATH}\nconfig → {CONFIG_PATH}")


if __name__ == "__main__":
    main()
