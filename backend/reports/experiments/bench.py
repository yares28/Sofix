"""Score one candidate change against the blind nine-season replay.

    cd backend
    .venv\\Scripts\\python reports\\experiments\\bench.py --variant spread=1.15 --cache %TEMP%\\fdr_state.pkl --workers 10

The baseline is the replay behind docs/fixture_difficulty.md: every Monday of 2017/18-2025/26, settings for each
season tuned only on earlier seasons. A variant inherits those settings and changes one thing, then runs through
the same Mondays, matches, metrics and bootstraps. The difference is the change, measured the way the published
numbers were measured.

    --variant spread=1.15            any DixonColesConfig field, comma separated
    --variant ridge=0.5,xi=0.002
    --variant blend=0.3              blend bookmaker prices into the next week's matches
    --variant blend=0.3,blend_weeks=3
    --variant drift=2.0              re-weight the recent matches of clubs the fit keeps getting wrong
    --variant drift=2.0,drift_threshold=3.0,drift_slack=0.5,drift_matches=12,drift_boost_matches=6
    --variant spread=1.0             self-test: must come out exactly 0.000 against the baseline

Reads the same cached CSVs as difficulty_backtest.py (no network) and shares its --cache state file, so a variant
costs one replay of the candidate rather than two of everything.
"""

from __future__ import annotations

import argparse
import logging
import sys
import time
from concurrent.futures import ProcessPoolExecutor
from dataclasses import fields, replace
from pathlib import Path

BACKEND = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(BACKEND))
sys.path.insert(0, str(Path(__file__).resolve().parent))  # difficulty_backtest is a sibling script

import difficulty_backtest as replay  # noqa: E402
import pandas as pd  # noqa: E402

from app.backtest.methods import Method, blend_with_market  # noqa: E402
from app.backtest.walkforward import run_walkforward  # noqa: E402
from app.logging_config import configure_logging  # noqa: E402
from app.modeling.dixon_coles import DixonColesConfig, fit_dixon_coles  # noqa: E402
from app.services.drift import DriftSettings, club_residuals, club_weights, recent_match_weights  # noqa: E402

logger = logging.getLogger("bench")

VARIANT = "Candidate"
BASELINE = replay.BLIND
CEILING = replay.ODDS
COMPARED = [VARIANT, BASELINE, CEILING]
RUN_LENGTHS = replay.RUN_LENGTHS


# ---------------------------------------------------------------- the candidate


class Recipe:
    """One change to the blind settings, written as `key=value` pairs.

    Config fields (spread, ridge, xi, window_days, goals_weight, promoted_prior, max_goals) replace that field
    of each season's blind settings. `blend` and `blend_weeks` add the bookmaker blend on top.
    """

    CONFIG_FIELDS = {f.name for f in fields(DixonColesConfig)}
    EXTRA = {
        "blend": float,
        "blend_weeks": int,
        "drift": float,
        "drift_threshold": float,
        "drift_slack": float,
        "drift_matches": int,
        "drift_boost_matches": int,
    }

    def __init__(self, text: str) -> None:
        self.text = text
        self.overrides: dict[str, float] = {}
        self.blend = 0.0
        self.blend_weeks = 1
        self.drift = 0.0
        defaults = DriftSettings()
        self.drift_threshold = defaults.threshold
        self.drift_slack = defaults.slack
        self.drift_matches = defaults.matches
        self.drift_boost_matches = defaults.boost_matches
        for part in filter(None, (p.strip() for p in text.split(","))):
            key, _, raw = part.partition("=")
            key = key.strip()
            if not raw:
                raise SystemExit(f"--variant needs key=value pairs, got {part!r}")
            if key in self.EXTRA:
                setattr(self, key, self.EXTRA[key](raw))
            elif key in self.CONFIG_FIELDS:
                self.overrides[key] = int(raw) if key in {"window_days", "max_goals"} else float(raw)
            else:
                known = ", ".join(sorted(self.CONFIG_FIELDS | set(self.EXTRA)))
                raise SystemExit(f"unknown setting {key!r}; try one of: {known}")

    def config(self, blind: DixonColesConfig) -> DixonColesConfig:
        return replace(blind, **self.overrides) if self.overrides else blind

    def drift_settings(self) -> DriftSettings:
        return DriftSettings(
            slack=self.drift_slack,
            threshold=self.drift_threshold,
            matches=self.drift_matches,
            boost=self.drift,
            boost_matches=self.drift_boost_matches,
        )

    def is_noop(self, blind: dict[int, dict]) -> bool:
        unchanged = all(self.config(s["config"]) == s["config"] for s in blind.values())
        return self.blend == 0.0 and self.drift == 0.0 and unchanged


def variant_method(name: str, config: DixonColesConfig, recipe: Recipe) -> Method:
    """The candidate, carrying the same extra columns the replay's own methods carry."""

    def predict(
        history: pd.DataFrame, cutoff: pd.Timestamp, targets: pd.DataFrame, promoted: frozenset[str]
    ) -> pd.DataFrame:
        teams = set(targets["home"]) | set(targets["away"])
        model = fit_dixon_coles(history, cutoff, teams=teams, promoted=promoted, config=config)
        if recipe.drift:
            # Fit once to see where the model is fighting the results, then again paying those clubs
            # more attention. The first fit is what the test judges, so nothing here sees the future.
            settings = recipe.drift_settings()
            train = history[history["date"] >= pd.Timestamp(cutoff) - pd.Timedelta(days=config.window_days)]
            boosts = club_weights(club_residuals(model, train), settings)
            weights = recent_match_weights(train, boosts, settings)
            if weights is not None:
                model = fit_dixon_coles(
                    history, cutoff, teams=teams, promoted=promoted, config=config, match_weights=weights
                )
        overall = pd.Series(model.attack + model.defence, index=list(model.teams))
        table = model.predict(targets["home"], targets["away"]).assign(
            rating_h=overall.reindex(targets["home"]).to_numpy(),
            rating_a=overall.reindex(targets["away"]).to_numpy(),
            home_adv=model.home_adv,
            rho=model.rho,
        )
        if recipe.blend:
            table = blend_with_market(table, targets, cutoff, recipe.blend, recipe.blend_weeks)
        return table

    return Method(name, predict)


def variant_task(task: tuple[int, DixonColesConfig, Recipe]) -> pd.DataFrame:
    season, config, recipe = task
    method = variant_method(VARIANT, config, recipe)
    return run_walkforward(replay._matches(), [season], [method], replay.REST_OF_SEASON_WEEKS)


def forecast_variant(matches: pd.DataFrame, settings: dict[int, dict], recipe: Recipe, workers: int) -> pd.DataFrame:
    tasks = [(season, recipe.config(settings[season]["config"]), recipe) for season in replay.TEST_SEASONS]
    with ProcessPoolExecutor(max_workers=workers, initializer=replay._init_worker, initargs=(matches,)) as pool:
        frames = list(pool.map(variant_task, tasks))
    return replay.with_odds_flag(pd.concat(frames, ignore_index=True), matches)


# ---------------------------------------------------------------- measurements


def match_scores(scored: pd.DataFrame) -> pd.DataFrame:
    table = (
        scored[scored["method"].isin(COMPARED)]
        .groupby("method")
        .agg(
            forecasts=("rps", "size"), rps=("rps", "mean"), log_loss=("log_loss", "mean"), accuracy=("correct", "mean")
        )
    )
    return table.reindex(COMPARED).rename_axis("method").reset_index()


def clean_sheet_scores(planning: pd.DataFrame) -> pd.DataFrame:
    rows = planning[planning["method"].isin([VARIANT, BASELINE])].dropna(subset=["p_cs"])
    table = rows.groupby("method").agg(
        forecasts=("p_cs", "size"), predicted=("p_cs", "mean"), observed=("clean_sheet", "mean")
    )
    table["gap"] = table["predicted"] - table["observed"]
    table["brier"] = rows.assign(e=(rows["p_cs"] - rows["clean_sheet"]) ** 2).groupby("method")["e"].mean()
    return table.reindex([VARIANT, BASELINE]).rename_axis("method").reset_index()


def decile_calibration(planning: pd.DataFrame) -> pd.DataFrame:
    """Expected against actual points per game by decile of the forecast: where the extremes sit."""
    parts = []
    for method in COMPARED:
        rows = planning[planning["method"] == method]
        if rows.empty:
            continue
        decile = pd.qcut(rows["expected_points"], 10, labels=list(range(1, 11)))
        parts.append(
            rows.groupby(decile, observed=True)
            .agg(expected=("expected_points", "mean"), actual=("points", "mean"))
            .rename(columns=lambda c, m=method: f"{m}: {c}")
        )
    return pd.concat(parts, axis=1).rename_axis("expected-points decile").reset_index()


def extreme_gap(planning: pd.DataFrame, method: str) -> float:
    """How far the top and bottom deciles miss, in points per game (0 = the extremes are right)."""
    rows = planning[planning["method"] == method]
    decile = pd.qcut(rows["expected_points"], 10, labels=list(range(1, 11)))
    means = rows.groupby(decile, observed=True).agg(expected=("expected_points", "mean"), actual=("points", "mean"))
    ends = means.loc[[1, 10]]
    return float((ends["actual"] - ends["expected"]).abs().mean())


def by_horizon(scored: pd.DataFrame) -> pd.DataFrame:
    """RPS by how far ahead the forecast was made: a change that only touches near games is diluted in the pool."""
    buckets = pd.cut(scored["horizon"], [0, 1, 3, 5, 8], labels=["1 week", "2–3", "4–5", "6–8"])
    table = (
        scored[scored["method"].isin(COMPARED)]
        .assign(bucket=buckets)
        .pivot_table(index="method", columns="bucket", values="rps", aggfunc="mean", observed=True)
    )
    return table.reindex(COMPARED).rename_axis("method").reset_index()


def label_churn(rows: pd.DataFrame, weeks: int = 5) -> pd.DataFrame:
    """How often a tile keeps its colour from `weeks` out to the game's own week.

    A change that moves late forecasts (the market blend does) buys accuracy by making tiles move. This is
    the price, in the production cut points the board actually uses.
    """
    key = ["season_start", "date", "home", "away", "venue"]
    records = []
    for method in [VARIANT, BASELINE]:
        frame = rows[rows["method"] == method]
        codes = replay.label_for(frame["difficulty"], replay.LABEL_THRESHOLDS).cat.codes.to_numpy()
        frame = frame[[*key, "horizon", "difficulty"]].assign(code=codes)
        joined = (
            frame[frame["horizon"] == 1]
            .set_index(key)
            .join(frame[frame["horizon"] == weeks].set_index(key), how="inner", lsuffix="_final", rsuffix="_early")
        )
        moved = (joined["code_early"].astype(int) - joined["code_final"].astype(int)).abs()
        records.append(
            {
                "method": method,
                "games": len(joined),
                "same label": (moved == 0).mean(),
                "within one label": (moved <= 1).mean(),
                "mean move in difficulty": (joined["difficulty_early"] - joined["difficulty_final"]).abs().mean(),
            }
        )
    return pd.DataFrame(records)


def run_rankings(rows: pd.DataFrame, fresh: set[pd.Timestamp]) -> tuple[pd.DataFrame, pd.DataFrame]:
    """Mean rank correlation across clubs per run length, and the candidate − baseline interval."""
    means, intervals = {}, []
    for length in RUN_LENGTHS:
        sums = replay.run_sums(rows, fresh, length, methods=COMPARED)
        means[f"Next {length}"] = replay.mean_rank_correlation(sums, "ease", "points")["mean"]
        record = replay.run_correlation_bootstrap(sums, [(VARIANT, BASELINE)])[0]
        intervals.append({"run": f"Next {length}", **{k: v for k, v in record.items() if k != "comparison"}})
    table = pd.DataFrame(means).reindex(COMPARED).rename_axis("method").reset_index()
    return table, pd.DataFrame(intervals)


# ---------------------------------------------------------------- the gate


def verdict(rps: dict, near: dict, within: pd.Series, runs: pd.DataFrame) -> tuple[str, list[str]]:
    """CLAUDE.md's rule: a change ships only if an interval of the difference excludes 0 in its favour.

    RPS decides (lower is better). The within-club and run-ranking intervals are reported alongside: a change
    that wins on RPS but loses either of those is worse for the board than for a bookmaker, so it stops here.
    """
    notes = []
    better = rps["95% high"] < 0
    worse = rps["95% low"] > 0
    notes.append(f"RPS {rps['RPS difference']:+.4f} ({rps['95% low']:+.4f} to {rps['95% high']:+.4f})")
    notes.append(f"RPS on next week's games {near['RPS difference']:+.4f} ({near['95% low']:+.4f} to {near['95% high']:+.4f})")  # fmt: skip
    notes.append(f"within-club correlation {within['difference']:+.3f} ({within['95% low']:+.3f} to {within['95% high']:+.3f})")  # fmt: skip
    hurt_runs = [row["run"] for _, row in runs.iterrows() if row["95% high"] < 0]
    hurt_within = within["95% high"] < 0
    if worse:
        return "DON'T SHIP: worse than the baseline", notes
    if not better:
        return "DON'T SHIP: no measurable difference (the interval covers 0)", notes
    if hurt_within or hurt_runs:
        hurt = ", ".join(["within-club"] * hurt_within + hurt_runs)
        return f"DON'T SHIP: better match forecasts but worse board ordering ({hurt})", notes
    return "SHIP: better on RPS, with nothing else measurably worse", notes


# ---------------------------------------------------------------- report


def report(recipe: Recipe, matches: pd.DataFrame, forecasts: pd.DataFrame) -> str:
    rows = replay.team_view(forecasts)
    rows = rows.assign(ease=rows["expected_points"])
    planning = rows[rows["has_odds"] & (rows["horizon"] <= replay.PLANNING_WEEKS)]
    scored = replay.scored_matches(forecasts)
    fresh = replay.fresh_cutoffs(matches, forecasts)

    rps = replay.paired_bootstrap(scored, VARIANT, BASELINE)
    ceiling = replay.paired_bootstrap(scored, VARIANT, CEILING)
    next_week = replay.paired_bootstrap(scored[scored["horizon"] == 1], VARIANT, BASELINE)
    within = replay.within_club_bootstrap(rows, [(VARIANT, BASELINE)]).iloc[0]
    run_table, run_intervals = run_rankings(rows, fresh)
    call, notes = verdict(rps, next_week, within, run_intervals)
    deciles = decile_calibration(planning)

    seasons = (
        scored[scored["method"].isin([VARIANT, BASELINE])]
        .groupby(["season_start", "method"])["rps"]
        .mean()
        .unstack("method")
        .rename(index=replay.season_label)
    )
    seasons["difference"] = seasons[VARIANT] - seasons[BASELINE]
    signal = replay.within_club_signal(rows, "ease", "points", [VARIANT, BASELINE, CEILING])

    fmt = {"forecasts": ".0f", "rps": ".4f", "log_loss": ".4f", "accuracy": ".1%"}
    cs_fmt = {"forecasts": ".0f", "predicted": ".1%", "observed": ".1%", "gap": "+.1%", "brier": ".4f"}
    ci_fmt = {"forecasts": ".0f", "match weeks": ".0f", "RPS difference": "+.4f", "95% low": "+.4f", "95% high": "+.4f"}
    run_ci_fmt = {"difference": "+.3f", "95% low": "+.3f", "95% high": "+.3f"}
    within_fmt = {"forecasts": ".0f", "within-club correlation": ".3f", "kinder half": ".2f", "tougher half": ".2f", "kinder − tougher": "+.2f"}  # fmt: skip

    return f"""# Candidate: `{recipe.text}`

**{call}**

{chr(10).join(f"- {note}" for note in notes)}

Baseline: the blind replay ({len(replay.TEST_SEASONS)} seasons, settings per season from earlier seasons only).
The candidate uses the same per-season settings with the change applied. Ceiling: {CEILING}.

## Match forecasts

{replay.table(match_scores(scored), fmt)}

Candidate − baseline, 95% interval from resampling match weeks:

{replay.table(pd.DataFrame([rps]), ci_fmt)}

Candidate − ceiling (how much of the gap to the market is left):

{replay.table(pd.DataFrame([ceiling]), ci_fmt)}

By how far ahead the forecast was made (mean RPS):

{replay.table(by_horizon(scored), {c: ".4f" for c in by_horizon(scored).columns if c != "method"})}

Candidate − baseline on next week's games only:

{replay.table(pd.DataFrame([next_week]), ci_fmt)}

Per season (mean RPS):

{replay.table(seasons.rename_axis("season").reset_index(), {VARIANT: ".4f", BASELINE: ".4f", "difference": "+.4f"})}

## Calibration

{replay.table(deciles, {c: (".0f" if c == "expected-points decile" else ".2f") for c in deciles.columns})}

Extreme-decile error (mean absolute miss in the top and bottom decile, points per game):
candidate {extreme_gap(planning, VARIANT):.3f}, baseline {extreme_gap(planning, BASELINE):.3f}, ceiling {extreme_gap(planning, CEILING):.3f}.

Clean sheets:

{replay.table(clean_sheet_scores(planning), cs_fmt)}

## The board

Telling a club's easy games from its hard ones (same-Monday comparison):

{replay.table(signal, within_fmt)}

Candidate − baseline, 95% interval from resampling club-seasons:

{replay.table(pd.DataFrame([within]), {"club-seasons": ".0f", "difference": "+.3f", "95% low": "+.3f", "95% high": "+.3f"})}

Tiles keeping their colour from 4–5 weeks out to the game's own week:

{replay.table(label_churn(rows), {"games": ".0f", "same label": ".1%", "within one label": ".1%", "mean move in difficulty": ".1f"})}

Ranking clubs' runs (mean Spearman across clubs):

{replay.table(run_table, {f"Next {n}": ".3f" for n in RUN_LENGTHS})}

Candidate − baseline per run length, 95% intervals from resampling two-month blocks of Mondays:

{replay.table(run_intervals, run_ci_fmt)}
"""


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--variant", required=True, help="key=value pairs, e.g. spread=1.15 or blend=0.3")
    parser.add_argument("--out", type=Path, help="write the report here as well as to the log")
    parser.add_argument("--cache", type=Path, help="baseline replay state, shared with difficulty_backtest.py")
    parser.add_argument("--workers", type=int, default=6)
    args = parser.parse_args()
    configure_logging()
    started = time.perf_counter()

    recipe = Recipe(args.variant)
    matches = replay.load_history(range(replay.HISTORY_FROM, replay.TEST_SEASONS[-1] + 1), replay.CACHE_DIR)
    if args.cache and args.cache.exists():
        logger.info("baseline from %s", args.cache)
        state = pd.read_pickle(args.cache)
    else:
        logger.info("no cached baseline: running the blind replay first (a few minutes)")
        state = replay.compute(matches, args.workers)
        if args.cache:
            pd.to_pickle(state, args.cache)
    if recipe.is_noop(state["settings"]):
        logger.info("this variant changes nothing: the report is a self-test and every difference must be 0")

    logger.info("replaying the candidate over %d seasons", len(replay.TEST_SEASONS))
    variant = forecast_variant(matches, state["settings"], recipe, args.workers)
    baseline = state["forecasts"]
    forecasts = pd.concat([baseline[baseline["method"].isin([BASELINE, CEILING])], variant], ignore_index=True)

    text = report(recipe, matches, forecasts)
    if args.out:
        args.out.write_text(text, encoding="utf-8")
        logger.info("report → %s (%.0f s)", args.out, time.perf_counter() - started)
    # The tables carry a real minus sign, which a cp1252 console cannot print.
    sys.stdout.reconfigure(errors="replace")
    print(text)


if __name__ == "__main__":
    main()
