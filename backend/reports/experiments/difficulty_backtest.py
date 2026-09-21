"""Walk-forward backtest of the fixture difficulty formula on past LaLiga seasons.

Research script behind docs/fixture_difficulty.md. It reuses the production code (rating model, difficulty
score and labels, walk-forward loop), so it scores exactly the numbers the board shows.

    cd backend
    .venv\\Scripts\\python reports\\experiments\\difficulty_backtest.py --out <tables.md> [--cache <state.pkl>]

No forecast ever sees its own result, or any later one:
- every Monday of a season the model is fitted only on matches played before that day, then forecasts every
  remaining match of the season;
- the "blind" variant picks its settings for a season from earlier seasons' results only (up to four, like the
  production tuning), and its label cut points from earlier seasons' forecast scores. 2017/18 has nothing
  earlier to tune on, so it uses the code defaults and cut points from its own pre-season forecasts;
- the production settings are scored alongside. They were tuned on 2019/20-2022/23 results, so only
  2023/24-2025/26 are blind for them.

Needs only the cached football-data.co.uk CSVs (no network). --cache skips the forecasting on later runs.
"""

from __future__ import annotations

import argparse
import logging
import sys
import time
import warnings
from concurrent.futures import ProcessPoolExecutor
from pathlib import Path

BACKEND = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(BACKEND))  # runnable as a plain script

import numpy as np  # noqa: E402
import pandas as pd  # noqa: E402

from app.backtest.calibration import label_for, propose_thresholds  # noqa: E402
from app.backtest.data import load_history, promoted_teams  # noqa: E402
from app.backtest.methods import Method, base_rates, closing_odds, dixon_coles, elo_fallback  # noqa: E402
from app.backtest.walkforward import run_walkforward, season_cutoffs  # noqa: E402
from app.jobs.backtest import config_grid, md_table  # noqa: E402
from app.logging_config import configure_logging  # noqa: E402
from app.modeling.dixon_coles import DixonColesConfig, fit_dixon_coles  # noqa: E402
from app.services.fixture_grid import quantile_scale  # noqa: E402
from app.services.rating_predictions import load_config, predict_both_sides  # noqa: E402
from app.services.scoring import LABEL_THRESHOLDS, LABELS, difficulty_label, difficulty_score  # noqa: E402

logger = logging.getLogger("difficulty_backtest")

CACHE_DIR = BACKEND / "data" / "raw" / "football-data-co-uk"
CONFIG_PATH = BACKEND / "artifacts" / "dixon_coles.json"

HISTORY_FROM = 2016  # oldest cached season: history only, nothing earlier to forecast it from
TEST_SEASONS = list(range(2017, 2026))  # 2017/18 … 2025/26
PRODUCTION_TUNED_ON = (2019, 2020, 2021, 2022)  # their results picked the production settings
BLIND_TUNING_SEASONS = 4  # like the production tuning
PLANNING_WEEKS = 8  # the horizon the settings are tuned for, as in reports/backtest_laliga.md
REST_OF_SEASON_WEEKS = 60  # every cutoff forecasts all remaining matches
RUN_LENGTHS = (1, 3, 5, 8)  # the board's Next, Next 3, Next 5 and Next 8
MIN_TEAMS = 10  # clubs with a full run needed to rank a cutoff
SEED = 20260915  # bootstraps and random tie-breaks

PROD = "Dixon-Coles, production settings"
BLIND = "Dixon-Coles, blind settings"
ODDS = "Closing odds (ceiling)"
ELO = "Elo (old scaffold)"
OPPONENT_FORM = "Opponent form (FPL-style)"
BOTH_FORM = "Form of both clubs"
OWN = "Club rating only"
VENUE = "Venue only"

MATCH_METHODS = [BLIND, PROD, ODDS, ELO, VENUE]
FIXTURE_METHODS = [BLIND, PROD, ODDS, ELO, BOTH_FORM, OPPONENT_FORM, VENUE]
RUN_METHODS = [BLIND, PROD, ODDS, ELO, BOTH_FORM, OPPONENT_FORM, OWN, VENUE]

# reports/backtest_laliga.md, sections 2 and 6: the numbers the harness must reproduce on 2023/24-2025/26
PUBLISHED_RPS = {PROD: 0.1953, ODDS: 0.1886, ELO: 0.2050, VENUE: 0.2255}
PUBLISHED_BANDS = {
    "Easy": (2717, 2.32),
    "Easy-ish": (3284, 1.70),
    "Normal": (4746, 1.35),
    "Hard-ish": (3335, 0.95),
    "Hard": (2596, 0.53),
}

# Table-based references. Opponent form, a simple FPL-style difficulty: the opponent's points per game at the venue
# it plays (its home form when you are away), from its last 19 games there within ~13 months, shrunk toward an
# unknown (usually promoted) club. Form of both clubs: the club's own points per game at its venue minus that.
FORM_DAYS = 400
FORM_GAMES = 19
FORM_PRIOR_PPG = 1.1
FORM_PRIOR_GAMES = 5

_MATCHES: pd.DataFrame | None = None


def _init_worker(matches: pd.DataFrame) -> None:
    """Ship the match history to each worker once."""
    global _MATCHES
    _MATCHES = matches


def _matches() -> pd.DataFrame:
    if _MATCHES is None:
        raise RuntimeError("worker was not initialised with the match history")
    return _MATCHES


def season_label(season: int) -> str:
    return f"{season}/{(season + 1) % 100:02d}"


# ---------------------------------------------------------------- scoring helpers


def outcome_of(home_goals, away_goals) -> np.ndarray:
    """0 = home win, 1 = draw, 2 = away win."""
    home_goals, away_goals = np.asarray(home_goals), np.asarray(away_goals)
    return np.where(home_goals > away_goals, 0, np.where(home_goals == away_goals, 1, 2))


def rps_rows(probs: np.ndarray, outcome: np.ndarray) -> np.ndarray:
    """Ranked probability score of each forecast (app.backtest.metrics averages the same thing)."""
    observed = np.eye(3)[outcome]
    gap = np.cumsum(probs, axis=1)[:, :2] - np.cumsum(observed, axis=1)[:, :2]
    return (gap**2).sum(axis=1) / 2


def difficulty_of(win, draw, loss) -> np.ndarray:
    """app.services.scoring.difficulty_score, vectorised; NaN where a method has no forecast."""
    win, draw, loss = (np.clip(np.asarray(x, dtype=float), 0.0, None) for x in (win, draw, loss))
    total = win + draw + loss
    with np.errstate(invalid="ignore", divide="ignore"):
        points = np.where(total > 0, (3 * win + draw) / total, 4 / 3)
    points = np.where(np.isnan(total), np.nan, points)
    return np.clip(100 * (1 - points / 3), 0.0, 100.0)


def check_formula(rows: pd.DataFrame) -> None:
    """The vectorised score and labels must equal scoring.py's, or nothing below means anything."""
    sample = rows[rows["method"] == PROD].sample(5000, random_state=1)
    labels = label_for(sample["difficulty"], LABEL_THRESHOLDS).astype(str)
    for win, draw, loss, score, label in zip(
        sample["p_win"], sample["p_draw"], sample["p_loss"], sample["difficulty"], labels, strict=True
    ):
        official = difficulty_score(win, draw, loss)
        if abs(official - score) > 1e-9 or difficulty_label(official) != label:
            raise ValueError(f"vectorised difficulty disagrees with scoring.py for W/D/L {win}, {draw}, {loss}")
    on_the_cut = label_for(pd.Series(LABEL_THRESHOLDS), LABEL_THRESHOLDS).astype(str).tolist()
    if on_the_cut != [difficulty_label(cut) for cut in LABEL_THRESHOLDS]:
        raise ValueError("label boundaries differ from scoring.difficulty_label")


def with_odds_flag(forecasts: pd.DataFrame, matches: pd.DataFrame) -> pd.DataFrame:
    """Every method is scored on the same matches: those with closing odds."""
    priced = matches.dropna(subset=["odds_h", "odds_d", "odds_a"])[["date", "home", "away"]].assign(has_odds=True)
    flagged = forecasts.merge(priced, on=["date", "home", "away"], how="left", validate="many_to_one")
    return flagged.assign(has_odds=flagged["has_odds"].eq(True))


def convergence_warnings(caught: list[warnings.WarningMessage]) -> int:
    return sum("did not converge" in str(w.message) for w in caught)


# ---------------------------------------------------------------- forecasting (runs in worker processes)


def tuning_task(task: tuple[int, DixonColesConfig, int]) -> dict:
    """RPS and difficulty scores of one candidate setting over one season, as the production tuning measures it."""
    index, config, season = task
    matches = _matches()
    with warnings.catch_warnings(record=True) as caught:
        warnings.simplefilter("always", RuntimeWarning)
        forecasts = run_walkforward(matches, [season], [dixon_coles("candidate", config)], PLANNING_WEEKS)
    forecasts = with_odds_flag(forecasts, matches)
    forecasts = forecasts[forecasts["has_odds"]]
    probs = forecasts[["p_h", "p_d", "p_a"]].to_numpy(dtype=float)
    rps = rps_rows(probs, outcome_of(forecasts["hg"], forecasts["ag"]))
    scores = np.concatenate(
        [
            difficulty_of(forecasts["p_h"], forecasts["p_d"], forecasts["p_a"]),
            difficulty_of(forecasts["p_a"], forecasts["p_d"], forecasts["p_h"]),
        ]
    )
    return {
        "index": index,
        "season": season,
        "rps_sum": float(rps.sum()),
        "n": len(forecasts),
        "scores": scores.astype(np.float32),
        "warnings": convergence_warnings(caught),
    }


def rated_dixon_coles(name: str, config: DixonColesConfig) -> Method:
    """app.backtest.methods.dixon_coles, plus each side's overall rating and the fitted league parameters."""

    def predict(
        history: pd.DataFrame, cutoff: pd.Timestamp, targets: pd.DataFrame, promoted: frozenset[str]
    ) -> pd.DataFrame:
        teams = set(targets["home"]) | set(targets["away"])
        model = fit_dixon_coles(history, cutoff, teams=teams, promoted=promoted, config=config)
        overall = pd.Series(model.attack + model.defence, index=list(model.teams))
        return model.predict(targets["home"], targets["away"]).assign(
            rating_h=overall.reindex(targets["home"]).to_numpy(),
            rating_a=overall.reindex(targets["away"]).to_numpy(),
            home_adv=model.home_adv,
            rho=model.rho,
        )

    return Method(name, predict)


def table_form(history: pd.DataFrame, cutoff: pd.Timestamp) -> pd.DataFrame:
    """Home and away points per game of every club with recent games, from matches before `cutoff` only."""
    cutoff = pd.Timestamp(cutoff)
    recent = history[(history["date"] < cutoff) & (history["date"] >= cutoff - pd.Timedelta(days=FORM_DAYS))]
    hg, ag = recent["hg"].to_numpy(), recent["ag"].to_numpy()
    dates = recent["date"].to_numpy()
    home = pd.DataFrame(
        {"team": recent["home"].to_numpy(), "date": dates, "points": np.select([hg > ag, hg == ag], [3, 1], 0)}
    )
    away = pd.DataFrame(
        {"team": recent["away"].to_numpy(), "date": dates, "points": np.select([ag > hg, hg == ag], [3, 1], 0)}
    )

    def ppg(games: pd.DataFrame) -> pd.Series:
        last = games.sort_values("date", kind="stable").groupby("team").tail(FORM_GAMES)
        totals = last.groupby("team")["points"].agg(["sum", "size"])
        return (totals["sum"] + FORM_PRIOR_GAMES * FORM_PRIOR_PPG) / (totals["size"] + FORM_PRIOR_GAMES)

    form = pd.DataFrame({"home_ppg": ppg(home), "away_ppg": ppg(away)})
    return form.rename_axis("team").reset_index().assign(cutoff=cutoff)


def season_task(task: tuple[int, DixonColesConfig]) -> tuple[pd.DataFrame, pd.DataFrame, int]:
    """Every method's forecast of every remaining match at every Monday of one season."""
    season, blind_config = task
    matches = _matches()
    methods = [
        rated_dixon_coles(PROD, load_config(CONFIG_PATH)),
        rated_dixon_coles(BLIND, blind_config),
        Method(ELO, elo_fallback().predict),
        Method(VENUE, base_rates().predict),
        Method(ODDS, closing_odds().predict),
    ]
    with warnings.catch_warnings(record=True) as caught:
        warnings.simplefilter("always", RuntimeWarning)
        forecasts = run_walkforward(matches, [season], methods, REST_OF_SEASON_WEEKS)
    form = pd.concat([table_form(matches, cutoff) for cutoff in forecasts["cutoff"].unique()], ignore_index=True)
    return forecasts, form, convergence_warnings(caught)


# ---------------------------------------------------------------- blind settings


def preseason_thresholds(matches: pd.DataFrame, season: int, config: DixonColesConfig) -> tuple[float, ...]:
    """Label cut points from a season's own pre-season forecasts, made before any of its results existed."""
    season_matches = matches[matches["season_start"] == season]
    cutoff = season_cutoffs(season_matches)[0]
    teams = set(season_matches["home"]) | set(season_matches["away"])
    model = fit_dixon_coles(matches, cutoff, teams=teams, promoted=promoted_teams(matches, season), config=config)
    table = model.predict(season_matches["home"], season_matches["away"])
    scores = np.concatenate(
        [
            difficulty_of(table["p_h"], table["p_d"], table["p_a"]),
            difficulty_of(table["p_a"], table["p_d"], table["p_h"]),
        ]
    )
    return propose_thresholds(pd.Series(scores))


def blind_settings(matches: pd.DataFrame, tuning: pd.DataFrame, grid: list[DixonColesConfig]) -> dict[int, dict]:
    """Settings and cut points for each season from earlier seasons only."""
    settings: dict[int, dict] = {}
    for season in TEST_SEASONS:
        earlier = [s for s in TEST_SEASONS if s < season][-BLIND_TUNING_SEASONS:]
        if not earlier:
            config = DixonColesConfig()
            settings[season] = {
                "config": config,
                "thresholds": preseason_thresholds(matches, season, config),
                "tuned_on": [],
                "tuning_rps": float("nan"),
            }
            continue
        candidates = tuning[tuning["season"].isin(earlier)]
        pooled = candidates.groupby("index")[["rps_sum", "n"]].sum()
        rps = pooled["rps_sum"] / pooled["n"]
        best = int(rps.idxmin())
        scores = np.concatenate(candidates.loc[candidates["index"] == best, "scores"].tolist())
        settings[season] = {
            "config": grid[best],
            "thresholds": propose_thresholds(pd.Series(scores)),
            "tuned_on": earlier,
            "tuning_rps": float(rps.min()),
        }
    return settings


def compute(matches: pd.DataFrame, workers: int) -> dict:
    grid = config_grid(quick=False)
    tuning_tasks = [(i, config, season) for i, config in enumerate(grid) for season in TEST_SEASONS[:-1]]
    with ProcessPoolExecutor(max_workers=workers, initializer=_init_worker, initargs=(matches,)) as pool:
        logger.info("blind tuning: %d settings x %d seasons", len(grid), len(TEST_SEASONS) - 1)
        tuning = pd.DataFrame(list(pool.map(tuning_task, tuning_tasks, chunksize=4)))
        settings = blind_settings(matches, tuning, grid)
        for season in TEST_SEASONS:
            logger.info("%s blind settings: %s", season_label(season), settings[season]["config"])
        logger.info("forecasting %d seasons: every Monday, every remaining match", len(TEST_SEASONS))
        results = list(pool.map(season_task, [(season, settings[season]["config"]) for season in TEST_SEASONS]))
    forecasts = with_odds_flag(pd.concat([r[0] for r in results], ignore_index=True), matches)
    return {
        "settings": settings,
        "tuning": tuning.drop(columns="scores"),
        "forecasts": forecasts,
        "form": pd.concat([r[1] for r in results], ignore_index=True),
        "fit_warnings": int(tuning["warnings"].sum()) + sum(r[2] for r in results),
    }


# ---------------------------------------------------------------- club view


SIDES = {
    "H": {"team": "home", "opponent": "away", "p_win": "p_h", "p_loss": "p_a", "p_cs": "cs_h", "xg_for": "lam_h",
          "xg_against": "lam_a", "goals_for": "hg", "goals_against": "ag", "rating": "rating_h", "opp_rating": "rating_a"},
    "A": {"team": "away", "opponent": "home", "p_win": "p_a", "p_loss": "p_h", "p_cs": "cs_a", "xg_for": "lam_a",
          "xg_against": "lam_h", "goals_for": "ag", "goals_against": "hg", "rating": "rating_a", "opp_rating": "rating_h"},
}  # fmt: skip
SHARED = ["method", "season_start", "cutoff", "date", "horizon", "has_odds", "home", "away"]


def team_view(forecasts: pd.DataFrame) -> pd.DataFrame:
    """Two rows per forecast, one per club, with the numbers a tile carries."""
    sides = []
    for venue, columns in SIDES.items():
        side = forecasts[SHARED].copy()
        side["venue"] = venue
        side["p_draw"] = forecasts["p_d"].to_numpy()
        for name, source in columns.items():
            side[name] = forecasts[source].to_numpy()
        sides.append(side)
    rows = pd.concat(sides, ignore_index=True)
    gf, ga = rows["goals_for"].to_numpy(), rows["goals_against"].to_numpy()
    rows["expected_points"] = 3 * rows["p_win"] + rows["p_draw"]
    rows["points"] = np.select([gf > ga, gf == ga], [3, 1], 0)
    rows["clean_sheet"] = (ga == 0).astype(int)
    rows["difficulty"] = difficulty_of(rows["p_win"], rows["p_draw"], rows["p_loss"])
    return rows


def with_references(rows: pd.DataFrame, form: pd.DataFrame) -> pd.DataFrame:
    """`ease` (higher = kinder) for every method, plus reference 'difficulties' built on the same fixtures.

    The club-rating reference uses the blind fit's ratings, so it is compared on equal terms with the blind board.
    """
    rows = rows.assign(ease=rows["expected_points"])
    prod = rows[rows["method"] == PROD]
    blind = rows[rows["method"] == BLIND]
    opponent_form = form.rename(columns={"team": "opponent", "home_ppg": "opp_home_ppg", "away_ppg": "opp_away_ppg"})
    own_form = form.rename(columns={"home_ppg": "own_home_ppg", "away_ppg": "own_away_ppg"})
    table = prod.merge(opponent_form, on=["cutoff", "opponent"], how="left", validate="many_to_one").merge(
        own_form, on=["cutoff", "team"], how="left", validate="many_to_one"
    )
    away = table["venue"] == "A"
    opponent_ppg = np.nan_to_num(np.where(away, table["opp_home_ppg"], table["opp_away_ppg"]), nan=FORM_PRIOR_PPG)
    own_ppg = np.nan_to_num(np.where(away, table["own_away_ppg"], table["own_home_ppg"]), nan=FORM_PRIOR_PPG)
    table = table.drop(columns=["opp_home_ppg", "opp_away_ppg", "own_home_ppg", "own_away_ppg"])
    references = [
        table.assign(method=OPPONENT_FORM, ease=-opponent_ppg),
        table.assign(method=BOTH_FORM, ease=own_ppg - opponent_ppg),
        blind.assign(method=OWN, ease=blind["rating"]),
    ]
    return pd.concat([rows, *references], ignore_index=True)


def fresh_cutoffs(matches: pd.DataFrame, forecasts: pd.DataFrame) -> set[pd.Timestamp]:
    """Cutoffs with a new result since the previous Monday (and each season's first); the rest repeat the board."""
    keep: set[pd.Timestamp] = set()
    for _, cutoffs in forecasts.groupby("season_start")["cutoff"].unique().items():
        ordered = sorted(pd.Timestamp(c) for c in cutoffs)
        keep.add(ordered[0])
        for cutoff in ordered[1:]:
            if ((matches["date"] >= cutoff - pd.Timedelta(days=7)) & (matches["date"] < cutoff)).any():
                keep.add(cutoff)
    return keep


def scored_matches(forecasts: pd.DataFrame) -> pd.DataFrame:
    """Match-level scores within the planning horizon, on matches with closing odds."""
    scored = forecasts[forecasts["has_odds"] & (forecasts["horizon"] <= PLANNING_WEEKS)].copy()
    probs = scored[["p_h", "p_d", "p_a"]].to_numpy(dtype=float)
    outcome = outcome_of(scored["hg"], scored["ag"])
    scored["rps"] = rps_rows(probs, outcome)
    scored["log_loss"] = -np.log(np.clip(probs[np.arange(len(scored)), outcome], 1e-12, 1.0))
    scored["correct"] = (probs.argmax(axis=1) == outcome).astype(float)
    return scored


# ---------------------------------------------------------------- measurements


def table(df: pd.DataFrame, formats: dict[str, str] | None = None) -> str:
    return md_table(df.reset_index(drop=True), formats)


def paired_bootstrap(scored: pd.DataFrame, a: str, b: str, draws: int = 4000, seed: int = 20260915) -> dict:
    """Mean RPS difference a − b, with a 95% interval from resampling whole match weeks."""
    keys = ["season_start", "cutoff", "date", "home", "away"]
    pair = scored.loc[scored["method"] == a, [*keys, "rps"]].merge(
        scored.loc[scored["method"] == b, [*keys, "rps"]], on=keys, suffixes=("_a", "_b"), validate="one_to_one"
    )
    diff = (pair["rps_a"] - pair["rps_b"]).to_numpy()
    week = pair["season_start"].astype(str) + " " + pair["date"].dt.to_period("W-SUN").astype(str)
    codes, weeks = pd.factorize(week)
    sums, counts = np.bincount(codes, weights=diff), np.bincount(codes).astype(float)
    picks = np.random.default_rng(seed).integers(0, len(weeks), size=(draws, len(weeks)))
    low, high = np.percentile(sums[picks].sum(axis=1) / counts[picks].sum(axis=1), [2.5, 97.5])
    return {
        "forecasts": len(diff),
        "match weeks": len(weeks),
        "RPS difference": diff.mean(),
        "95% low": low,
        "95% high": high,
    }


def label_rows(rows: pd.DataFrame, cuts: dict[int, tuple[float, ...]]) -> pd.Series:
    """The label each forecast gets with its season's cut points."""
    labels = pd.Series("", index=rows.index, dtype=object)
    for season, thresholds in cuts.items():
        mask = rows["season_start"] == season
        if mask.any():
            labels[mask] = label_for(rows.loc[mask, "difficulty"], thresholds).astype(str)
    return pd.Series(pd.Categorical(labels, categories=list(LABELS), ordered=True), index=rows.index)


BAND_FORMATS = {
    "forecasts": ".0f", "share": ".1%", "expected_ppg": ".2f", "actual_ppg": ".2f", "expected_win": ".1%",
    "actual_win": ".1%", "draw": ".1%", "loss": ".1%", "goals_for": ".2f", "goals_against": ".2f", "clean_sheets": ".1%",
}  # fmt: skip


def band_summary(rows: pd.DataFrame, labels: pd.Series) -> pd.DataFrame:
    frame = rows.assign(label=labels, won=rows["points"].eq(3), drew=rows["points"].eq(1), lost=rows["points"].eq(0))
    summary = frame.groupby("label", observed=False).agg(
        forecasts=("points", "size"),
        expected_ppg=("expected_points", "mean"),
        actual_ppg=("points", "mean"),
        expected_win=("p_win", "mean"),
        actual_win=("won", "mean"),
        draw=("drew", "mean"),
        loss=("lost", "mean"),
        goals_for=("goals_for", "mean"),
        goals_against=("goals_against", "mean"),
        clean_sheets=("clean_sheet", "mean"),
    )
    summary.insert(1, "share", summary["forecasts"] / summary["forecasts"].sum())
    return summary.rename_axis("label").reset_index()


def season_bands(rows: pd.DataFrame, labels: pd.Series) -> pd.DataFrame:
    frame = rows.assign(label=labels)
    ppg = frame.pivot_table(index="season_start", columns="label", values="points", aggfunc="mean", observed=False)
    count = frame.pivot_table(index="season_start", columns="label", values="points", aggfunc="size", observed=False)
    share = count.div(count.sum(axis=1), axis=0)
    out = pd.DataFrame({"season": [season_label(int(s)) for s in ppg.index]})
    for label in LABELS:
        out[label] = [f"{p:.2f} ({s:.0%})" for p, s in zip(ppg[label], share[label], strict=True)]
    falls = [bool(np.all(np.diff(ppg.loc[s, list(LABELS)].to_numpy(dtype=float)) < 0)) for s in ppg.index]
    out["falls at every step"] = ["yes" if f else "no" for f in falls]
    return out


def demeaned_parts(frame: pd.DataFrame, key: list[str], value: str, target: str) -> pd.DataFrame:
    """value and target minus their means within `key`, with the cross products a pooled correlation needs."""
    groups = frame.groupby(key)
    value_dm = frame[value] - groups[value].transform("mean")
    target_dm = frame[target] - groups[target].transform("mean")
    return frame.assign(vt=value_dm * target_dm, vv=value_dm**2, tt=target_dm**2)


def pooled_correlation(parts: pd.DataFrame) -> pd.Series:
    sums = parts.groupby("method")[["vt", "vv", "tt"]].sum()
    return sums["vt"] / np.sqrt(sums["vv"] * sums["tt"])


def within_club_signal(rows: pd.DataFrame, value: str, target: str, methods: list[str]) -> pd.DataFrame:
    """Does the forecast tell a club's easier games from its harder ones?

    Compared among the club's games in the next PLANNING_WEEKS weeks as forecast on one Monday, so every forecast in
    a comparison was made with the same information and the club's own strength drops out. (A season average would
    mix in forecasts made after a game, which already reflect its result, and penalise methods that learn from
    results.) Returns the pooled correlation of value and result, both demeaned within each Monday's games, and the
    average result in the kinder and tougher half of those games (an odd count leaves its middle game out; ties
    are broken at random).
    """
    frame = rows[(rows["horizon"] <= PLANNING_WEEKS) & rows["method"].isin(methods)].sample(frac=1.0, random_state=SEED)
    key = ["method", "season_start", "cutoff", "team"]
    groups = frame.groupby(key)
    size = groups[value].transform("size")
    rank = groups[value].rank(method="first", ascending=False)
    half = size // 2
    frame = demeaned_parts(frame, key, value, target).assign(
        side=np.select([rank <= half, rank > size - half], ["kinder", "tougher"], "middle")
    )
    halves = frame[frame["side"] != "middle"].groupby(["method", "side"])[target].mean().unstack()
    out = pd.DataFrame(
        {
            "forecasts": frame.groupby("method").size(),
            "within-club correlation": pooled_correlation(frame),
            "kinder half": halves["kinder"],
            "tougher half": halves["tougher"],
        }
    )
    out["kinder − tougher"] = out["kinder half"] - out["tougher half"]
    return out.reindex(methods).rename_axis("method").reset_index()


def preseason_thirds(rows: pd.DataFrame, value: str, target: str, methods: list[str]) -> pd.DataFrame:
    """The same question over a whole season, from the forecasts made on the Monday before round 1 only.

    Each club's games are split into its kindest, middle and toughest third by that forecast (ties at random).
    """
    first = rows.groupby("season_start")["cutoff"].transform("min")
    frame = rows[(rows["cutoff"] == first) & rows["method"].isin(methods)].sample(frac=1.0, random_state=SEED)
    key = ["method", "season_start", "team"]
    groups = frame.groupby(key)
    rank = groups[value].rank(method="first", ascending=False)
    frame = demeaned_parts(frame, key, value, target).assign(
        third=np.floor(3 * (rank - 1) / groups[value].transform("size")).astype(int)
    )
    thirds = frame.groupby(["method", "third"])[target].mean().unstack()
    out = pd.DataFrame(
        {
            "games": frame.groupby("method").size(),
            "within-club correlation": pooled_correlation(frame),
            "kindest third": thirds[0],
            "middle third": thirds[1],
            "toughest third": thirds[2],
        }
    )
    out["kindest − toughest"] = out["kindest third"] - out["toughest third"]
    return out.reindex(methods).rename_axis("method").reset_index()


def run_sums(
    rows: pd.DataFrame, cutoffs: set[pd.Timestamp], length: int, methods: list[str] | None = None
) -> pd.DataFrame:
    """Each club's next `length` games by date from every fresh cutoff, summed.

    The board sums the next gameweek columns instead; the CSVs have no gameweek numbers, and the two only differ
    around postponed games.
    """
    frame = rows[rows["cutoff"].isin(list(cutoffs)) & rows["method"].isin(methods or RUN_METHODS)]
    frame = frame.sort_values(["method", "cutoff", "team", "date"], kind="stable")
    frame = frame[frame.groupby(["method", "cutoff", "team"]).cumcount() < length]
    sums = frame.groupby(["method", "season_start", "cutoff", "team"], as_index=False).agg(
        ease=("ease", "sum"),
        points=("points", "sum"),
        games=("points", "size"),
        xg=("xg_for", "sum"),
        goals=("goals_for", "sum"),
        p_cs=("p_cs", "sum"),
        clean_sheets=("clean_sheet", "sum"),
    )
    sums = sums[sums["games"] == length]
    return sums[sums.groupby(["method", "cutoff"])["team"].transform("size") >= MIN_TEAMS]


def rank_correlations(frame: pd.DataFrame, value: str, target: str) -> pd.Series:
    """Spearman correlation across clubs at each cutoff, per method: a Series indexed by (method, cutoff)."""
    keys = ["method", "cutoff"]
    groups = frame.groupby(keys)
    ranks = frame[keys].assign(x=groups[value].rank(), y=groups[target].rank())
    ranked = ranks.groupby(keys)
    dx = ranks["x"] - ranked["x"].transform("mean")
    dy = ranks["y"] - ranked["y"].transform("mean")
    parts = ranks[keys].assign(xy=dx * dy, xx=dx**2, yy=dy**2).groupby(keys)[["xy", "xx", "yy"]].sum()
    with np.errstate(invalid="ignore", divide="ignore"):
        rho = parts["xy"] / np.sqrt(parts["xx"] * parts["yy"])
    return rho.replace([np.inf, -np.inf], np.nan).dropna()


def mean_rank_correlation(frame: pd.DataFrame, value: str, target: str) -> pd.DataFrame:
    """rank_correlations averaged over cutoffs, per method."""
    return rank_correlations(frame, value, target).groupby(level="method").agg(["mean", "count"])


def block_of(cutoffs: pd.Index | pd.Series, seasons: pd.Series) -> np.ndarray:
    """Two-month blocks within a season (Aug–Sep, Oct–Nov, …): runs of up to 8 games overlap within about that."""
    months = pd.DatetimeIndex(cutoffs).month.to_numpy()
    return (seasons.to_numpy() * 10 + (months % 12) // 2).astype(int)


def run_correlation_bootstrap(sums: pd.DataFrame, pairs: list[tuple[str, str]], draws: int = 4000, seed: int = 20260915) -> list[dict]:  # fmt: skip
    """Difference in mean rank correlation a − b, with a 95% interval from resampling two-month blocks of cutoffs."""
    per_cutoff = rank_correlations(sums, "ease", "points").unstack("method")
    season_of = sums.drop_duplicates("cutoff").set_index("cutoff")["season_start"]
    blocks = block_of(per_cutoff.index, season_of.reindex(per_cutoff.index))
    rng = np.random.default_rng(seed)
    records = []
    for a, b in pairs:
        diff = (per_cutoff[a] - per_cutoff[b]).dropna()
        codes, uniques = pd.factorize(blocks[per_cutoff.index.get_indexer(diff.index)])
        sums_by_block, counts = np.bincount(codes, weights=diff.to_numpy()), np.bincount(codes).astype(float)
        picks = rng.integers(0, len(uniques), size=(draws, len(uniques)))
        low, high = np.percentile(sums_by_block[picks].sum(axis=1) / counts[picks].sum(axis=1), [2.5, 97.5])
        records.append({"comparison": f"{a} − {b}", "difference": diff.mean(), "95% low": low, "95% high": high})
    return records


def within_club_bootstrap(rows: pd.DataFrame, pairs: list[tuple[str, str]], draws: int = 4000, seed: int = SEED) -> pd.DataFrame:  # fmt: skip
    """Difference in within-club correlation a − b (as within_club_signal measures it), with a 95% interval from
    resampling club-seasons."""
    methods = sorted({m for pair in pairs for m in pair})
    frame = rows[(rows["horizon"] <= PLANNING_WEEKS) & rows["method"].isin(methods)]
    parts = demeaned_parts(frame, ["method", "season_start", "cutoff", "team"], "ease", "points")
    club_season = ["method", "season_start", "team"]
    wide = parts.groupby(club_season)[["vt", "vv", "tt"]].sum().unstack("method").dropna()
    picks = np.random.default_rng(seed).integers(0, len(wide), size=(draws, len(wide)))

    def correlation(method: str, index: np.ndarray | slice) -> np.ndarray:
        vt, vv, tt = (wide[(part, method)].to_numpy()[index] for part in ("vt", "vv", "tt"))
        return vt.sum(axis=-1) / np.sqrt(vv.sum(axis=-1) * tt.sum(axis=-1))

    records = []
    for a, b in pairs:
        low, high = np.percentile(correlation(a, picks) - correlation(b, picks), [2.5, 97.5])
        whole = slice(None)
        records.append(
            {
                "comparison": f"{a} − {b}",
                "club-seasons": len(wide),
                "difference": float(correlation(a, whole) - correlation(b, whole)),
                "95% low": low,
                "95% high": high,
            }
        )
    return pd.DataFrame(records)


def run_extremes(sums: pd.DataFrame, length: int) -> pd.DataFrame:
    """Points per game the kindest and toughest runs (and the five kindest and toughest) actually brought."""
    sums = sums.sample(frac=1.0, random_state=SEED)  # ties (common for venue only) go to a random club
    groups = sums.groupby(["method", "cutoff"])
    kindest = sums.loc[groups["ease"].idxmax(), ["method", "cutoff", "points"]]
    toughest = sums.loc[groups["ease"].idxmin(), ["method", "cutoff", "points"]]
    pair = kindest.merge(toughest, on=["method", "cutoff"], suffixes=("_kindest", "_toughest"))
    rank = groups["ease"].rank(ascending=False, method="first")
    size = groups["ease"].transform("size")
    out = pair.groupby("method").agg(kindest=("points_kindest", "mean"), toughest=("points_toughest", "mean")) / length
    out["kindest outscored toughest"] = (
        (pair["points_kindest"] > pair["points_toughest"]).groupby(pair["method"]).mean()
    )
    out["five kindest"] = sums[rank <= 5].groupby("method")["points"].mean() / length
    out["five toughest"] = sums[rank > size - 5].groupby("method")["points"].mean() / length
    return out.reindex(RUN_METHODS).rename_axis("method").reset_index()


def kindest_is_strongest(sums: pd.DataFrame) -> dict[str, float]:
    """How often the blind board's kindest run belongs to the club its own fit rates best (toughest: worst)."""
    sums = sums.sample(frac=1.0, random_state=SEED)
    board, own = sums[sums["method"] == BLIND], sums[sums["method"] == OWN]

    def club(frame: pd.DataFrame, largest: bool) -> pd.Series:
        groups = frame.groupby("cutoff")["ease"]
        return frame.loc[groups.idxmax() if largest else groups.idxmin()].set_index("cutoff")["team"]

    own_rank = own.assign(rank=own.groupby("cutoff")["ease"].rank(ascending=False)).set_index(["cutoff", "team"])[
        "rank"
    ]
    kindest, toughest = club(board, True), club(board, False)
    kindest_rank = own_rank.reindex(list(zip(kindest.index, kindest, strict=True))).to_numpy()
    return {
        "kindest run = best-rated club": float((kindest == club(own, True).reindex(kindest.index)).mean()),
        "kindest run = a top-3 club": float(np.mean(kindest_rank <= 3)),
        "toughest run = worst-rated club": float((toughest == club(own, False).reindex(toughest.index)).mean()),
    }


def schedule_swing(rows: pd.DataFrame, cutoffs: set[pd.Timestamp], length: int) -> tuple[pd.DataFrame, pd.DataFrame]:
    """Is a club's next run kinder or tougher than the rest of its own season?

    Forecast swing = run total − length × the club's average over its remaining games; real swing = the same in
    points. Returns the rank correlation across clubs (per method, averaged over cutoffs) and the real swing per
    game of the club with the kindest and toughest forecast swing. Only clubs with at least twice the run left.
    """
    methods = [m for m in RUN_METHODS if m != OWN]
    frame = rows[rows["cutoff"].isin(list(cutoffs)) & rows["method"].isin(methods)]
    frame = frame.sort_values(["method", "cutoff", "team", "date"], kind="stable")
    key = ["method", "cutoff", "team"]
    groups = frame.groupby(key)
    frame = frame.assign(
        order=groups.cumcount(),
        left=groups["points"].transform("size"),
        usual_ease=groups["ease"].transform("mean"),
        usual_points=groups["points"].transform("mean"),
    )
    frame = frame[(frame["order"] < length) & (frame["left"] >= 2 * length)]
    sums = frame.groupby(key, as_index=False).agg(
        ease=("ease", "sum"),
        points=("points", "sum"),
        games=("points", "size"),
        usual_ease=("usual_ease", "first"),
        usual_points=("usual_points", "first"),
    )
    sums = sums[sums["games"] == length]
    sums = sums[sums.groupby(["method", "cutoff"])["team"].transform("size") >= MIN_TEAMS]
    sums = sums.assign(
        swing=sums["ease"] - length * sums["usual_ease"], real_swing=sums["points"] - length * sums["usual_points"]
    )
    shuffled = sums.sample(frac=1.0, random_state=SEED)  # random tie-breaks
    groups = shuffled.groupby(["method", "cutoff"])["swing"]
    kindest, toughest = shuffled.loc[groups.idxmax()], shuffled.loc[groups.idxmin()]
    extremes = pd.DataFrame(
        {
            "kindest swing: real points per game vs usual": kindest.groupby("method")["real_swing"].mean() / length,
            "toughest swing: real points per game vs usual": toughest.groupby("method")["real_swing"].mean() / length,
        }
    )
    return mean_rank_correlation(sums, "swing", "real_swing"), extremes.reindex(methods)


def label_stability(rows: pd.DataFrame) -> pd.DataFrame:
    """How a game's production label moves between an early forecast and the one in its own week."""
    prod = rows[rows["method"] == PROD]
    codes = label_for(prod["difficulty"], LABEL_THRESHOLDS).cat.codes.to_numpy()
    frame = prod[["season_start", "date", "home", "away", "venue", "horizon", "difficulty"]].assign(code=codes)
    key = ["season_start", "date", "home", "away", "venue"]
    final = frame[frame["horizon"] == 1].set_index(key)
    records = []
    for weeks in (2, 3, 5, 8, 13, 20):
        early = frame[frame["horizon"] == weeks].set_index(key)
        joined = final.join(early, how="inner", lsuffix="_final", rsuffix="_early")
        moved = (joined["code_early"].astype(int) - joined["code_final"].astype(int)).abs()
        records.append(
            {
                "forecast made": f"{7 * (weeks - 1)}–{7 * weeks - 1} days before",
                "games": len(joined),
                "same label as in its own week": (moved == 0).mean(),
                "within one label": (moved <= 1).mean(),
                "mean change in difficulty": (joined["difficulty_early"] - joined["difficulty_final"]).abs().mean(),
            }
        )
    return pd.DataFrame(records)


def season_points(games: pd.DataFrame) -> pd.Series:
    hg, ag = games["hg"].to_numpy(), games["ag"].to_numpy()
    home = pd.Series(np.select([hg > ag, hg == ag], [3, 1], 0), index=games["home"].to_numpy())
    away = pd.Series(np.select([ag > hg, hg == ag], [3, 1], 0), index=games["away"].to_numpy())
    return pd.concat([home, away]).groupby(level=0).sum()


def games_played(games: pd.DataFrame) -> pd.Series:
    return pd.concat([games["home"], games["away"]]).value_counts()


# ---------------------------------------------------------------- report sections


def setup_section(matches: pd.DataFrame, forecasts: pd.DataFrame, scored: pd.DataFrame, planning: pd.DataFrame, state: dict, fresh: set) -> str:  # fmt: skip
    test = matches[matches["season_start"].isin(TEST_SEASONS)]
    priced = test.dropna(subset=["odds_h", "odds_d", "odds_a"])
    dc = forecasts[forecasts["method"] == PROD]
    later = scored[scored["season_start"] > max(PRODUCTION_TUNED_ON)]
    check = later.groupby("method").agg(forecasts=("rps", "size"), rps=("rps", "mean")).reindex(list(PUBLISHED_RPS))
    check["published rps"] = pd.Series(PUBLISHED_RPS)
    recent = planning[(planning["method"] == PROD) & (planning["season_start"] > max(PRODUCTION_TUNED_ON))]
    bands = band_summary(recent, label_rows(recent, dict.fromkeys(TEST_SEASONS, LABEL_THRESHOLDS)))
    bands = bands[["label", "forecasts", "actual_ppg"]].assign(
        published_forecasts=[PUBLISHED_BANDS[str(label)][0] for label in bands["label"]],
        published_ppg=[PUBLISHED_BANDS[str(label)][1] for label in bands["label"]],
    )
    return f"""## 0. Setup and reproduction check

- Matches loaded: {len(matches)} ({season_label(HISTORY_FROM)} to {season_label(TEST_SEASONS[-1])}). Test seasons {season_label(TEST_SEASONS[0])} to {season_label(TEST_SEASONS[-1])}: {len(test)} matches, {len(priced)} with closing odds.
- Cutoffs (Mondays): {dc["cutoff"].nunique()}; with at least one new result since the previous Monday: {len(fresh)}.
- Forecasts per method: {len(dc)} (every remaining match at every cutoff), {int((dc["horizon"] <= PLANNING_WEEKS).sum())} within {PLANNING_WEEKS} weeks.
- Model fits that did not converge: {state["fit_warnings"]}.

The harness reproduces `app.jobs.backtest` on 2023/24 to 2025/26 (within {PLANNING_WEEKS} weeks, matches with closing odds):

{table(check.rename_axis("method").reset_index(), {"forecasts": ".0f", "rps": ".4f", "published rps": ".4f"})}

{table(bands, {"forecasts": ".0f", "actual_ppg": ".2f", "published_forecasts": ".0f", "published_ppg": ".2f"})}"""


def settings_section(settings: dict[int, dict], matches: pd.DataFrame, forecasts: pd.DataFrame) -> str:
    fits = forecasts[forecasts["method"] == BLIND].groupby(["season_start", "cutoff"])[["home_adv", "rho"]].first()
    league = fits.groupby("season_start").agg(
        home_adv=("home_adv", "mean"),
        home_adv_low=("home_adv", "min"),
        home_adv_high=("home_adv", "max"),
        rho=("rho", "mean"),
    )
    blind, parameters = [], []
    for season in TEST_SEASONS:
        config = settings[season]["config"]
        games = matches[matches["season_start"] == season]
        blind.append(
            {
                "season": season_label(season),
                "tuned on": ", ".join(season_label(s) for s in settings[season]["tuned_on"])
                or "nothing earlier: code defaults",
                "xi": config.xi,
                "goals_weight": config.goals_weight,
                "ridge": config.ridge,
                "promoted_prior": config.promoted_prior,
                "label cut points": " / ".join(f"{cut:.1f}" for cut in settings[season]["thresholds"]),
            }
        )
        parameters.append(
            {
                "season": season_label(season),
                "home advantage (mean fit)": league.loc[season, "home_adv"],
                "range over the season": f"{league.loc[season, 'home_adv_low']:+.3f} to {league.loc[season, 'home_adv_high']:+.3f}",
                "home goals boost": np.exp(league.loc[season, "home_adv"]) - 1,
                "rho": league.loc[season, "rho"],
                "home wins": (games["hg"] > games["ag"]).mean(),
                "draws": (games["hg"] == games["ag"]).mean(),
                "goals per match": (games["hg"] + games["ag"]).mean(),
            }
        )
    return f"""## 1. Blind settings and fitted league parameters

Settings the blind variant used for each season (production: xi 0.001, goals_weight 0.7, ridge 1.0, promoted_prior 0.0, cut points {" / ".join(f"{c:.1f}" for c in LABEL_THRESHOLDS)}):

{table(pd.DataFrame(blind), {"xi": ".3f", "goals_weight": ".1f", "ridge": ".1f", "promoted_prior": "+.1f"})}

League parameters fitted each Monday (blind settings), averaged over the season, with what happened:

{table(pd.DataFrame(parameters), {"home advantage (mean fit)": "+.3f", "home goals boost": "+.1%", "rho": "+.3f", "home wins": ".1%", "draws": ".1%", "goals per match": ".2f"})}"""


def accuracy_section(scored: pd.DataFrame) -> str:
    pooled = scored.groupby("method").agg(
        forecasts=("rps", "size"), rps=("rps", "mean"), log_loss=("log_loss", "mean"), accuracy=("correct", "mean")
    )
    by_season = scored.pivot_table(index="method", columns="season_start", values="rps", aggfunc="mean")
    by_season.columns = [season_label(int(s)) for s in by_season.columns]
    by_season["all 9"] = scored.groupby("method")["rps"].mean()
    later = scored[scored["season_start"] > max(PRODUCTION_TUNED_ON)]
    by_season["2023/24–2025/26"] = later.groupby("method")["rps"].mean()
    final_week = (
        scored[scored["horizon"] == 1]
        .groupby("method")
        .agg(
            forecasts=("rps", "size"), rps=("rps", "mean"), log_loss=("log_loss", "mean"), accuracy=("correct", "mean")
        )
    )
    # Production vs blind only where they differ in what they knew: blind equals production from 2023/24 on.
    hindsight = scored[scored["season_start"] <= max(PRODUCTION_TUNED_ON)]
    tuned_on = scored[scored["season_start"].isin(PRODUCTION_TUNED_ON)]
    comparisons = [
        (BLIND, ELO, scored, "all 9"),
        (BLIND, VENUE, scored, "all 9"),
        (BLIND, ODDS, scored, "all 9"),
        (PROD, BLIND, hindsight, "2017/18–2022/23"),
        (PROD, BLIND, tuned_on, "2019/20–2022/23"),
        (PROD, ELO, later, "2023/24–2025/26"),
        (PROD, ODDS, later, "2023/24–2025/26"),
    ]
    intervals = pd.DataFrame(
        [
            {"comparison": f"{a} − {b}", "seasons": seasons, **paired_bootstrap(frame, a, b)}
            for a, b, frame, seasons in comparisons
        ]
    )
    formats = {"forecasts": ".0f", "rps": ".4f", "log_loss": ".4f", "accuracy": ".1%"}
    season_formats = {c: ".4f" for c in by_season.columns}
    ci_formats = {
        "forecasts": ".0f",
        "match weeks": ".0f",
        "RPS difference": "+.4f",
        "95% low": "+.4f",
        "95% high": "+.4f",
    }
    return f"""## 2. Match forecasts

Every forecast within {PLANNING_WEEKS} weeks, all 9 seasons (each match forecast once per week ahead):

{table(pooled.reindex(MATCH_METHODS).rename_axis("method").reset_index(), formats)}

RPS by season (lower is better):

{table(by_season.reindex(MATCH_METHODS).rename_axis("method").reset_index(), season_formats)}

Only the last forecast before each match (the week it is played):

{table(final_week.reindex(MATCH_METHODS).rename_axis("method").reset_index(), formats)}

Differences in RPS with 95% intervals from resampling match weeks (negative = first method better):

{table(intervals, ci_formats)}"""


def labels_section(planning: pd.DataFrame, blind_cuts: dict, production_cuts: dict) -> str:
    blind = planning[planning["method"] == BLIND]
    blind_labels = label_rows(blind, blind_cuts)
    later = planning[(planning["method"] == PROD) & (planning["season_start"] > max(PRODUCTION_TUNED_ON))]
    by_venue = (
        blind.assign(label=blind_labels)
        .pivot_table(index="venue", columns="label", values="points", aggfunc="size", observed=False)
        .pipe(lambda t: t.div(t.sum(axis=1), axis=0))
    )
    by_venue.columns = [str(c) for c in by_venue.columns]
    by_venue["mean difficulty"] = blind.groupby("venue")["difficulty"].mean()
    venue_formats = {**{label: ".1%" for label in LABELS}, "mean difficulty": ".1f"}
    return f"""## 3. Difficulty labels against what happened

Blind settings and cut points, all 9 seasons. Every club's forecast within {PLANNING_WEEKS} weeks counts once per week ahead:

{table(band_summary(blind, blind_labels), BAND_FORMATS)}

Production settings and cut points, 2023/24 to 2025/26 (blind for production):

{table(band_summary(later, label_rows(later, production_cuts)), BAND_FORMATS)}

Actual points per game by label in each season (blind; share of forecasts in brackets):

{table(season_bands(blind, blind_labels))}

Labels by venue (blind, all 9 seasons):

{table(by_venue.rename_axis("venue").reset_index(), venue_formats)}"""


def calibration_section(planning: pd.DataFrame) -> str:
    deciles = []
    for method in (BLIND, ODDS):
        rows = planning[planning["method"] == method]
        decile = pd.qcut(rows["expected_points"], 10, labels=list(range(1, 11)))
        deciles.append(
            rows.groupby(decile, observed=True)
            .agg(predicted=("expected_points", "mean"), actual=("points", "mean"))
            .rename(columns=lambda c, m=method: f"{m}: {c}")
        )
    edges = [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0 + 1e-9]
    names = [f"{int(100 * low)}–{int(round(100 * high))}%" for low, high in zip(edges[:-1], edges[1:], strict=True)]
    reliability = []
    for method in (BLIND, ODDS):
        rows = planning[planning["method"] == method]
        bins = pd.cut(rows["p_win"], edges, right=False, labels=names)
        reliability.append(
            rows.assign(won=rows["points"].eq(3))
            .groupby(bins, observed=False)
            .agg(forecasts=("won", "size"), predicted=("p_win", "mean"), actual=("won", "mean"))
            .rename(columns=lambda c, m=method: f"{m}: {c}")
        )
    decile_table = pd.concat(deciles, axis=1).rename_axis("expected-points decile").reset_index()
    win_table = pd.concat(reliability, axis=1).rename_axis("predicted win chance").reset_index()
    decile_formats = {c: (".0f" if c == "expected-points decile" else ".2f") for c in decile_table.columns}
    win_formats = {
        c: (".0f" if c.endswith("forecasts") else ".1%") for c in win_table.columns if c != "predicted win chance"
    }
    return f"""## 4. Calibration

Expected points per game against actual points per game, by decile of the forecast (within {PLANNING_WEEKS} weeks):

{table(decile_table, decile_formats)}

Win chance as forecast against how often the club won:

{table(win_table, win_formats)}"""


def within_team_section(rows: pd.DataFrame) -> str:
    formats = {"forecasts": ".0f", "within-club correlation": ".3f", "kinder half": ".2f", "tougher half": ".2f", "kinder − tougher": "+.2f"}  # fmt: skip
    third_formats = {"games": ".0f", "within-club correlation": ".3f", "kindest third": ".2f", "middle third": ".2f", "toughest third": ".2f", "kindest − toughest": "+.2f"}  # fmt: skip
    lens_rows = []
    for name, value, target in (
        ("Overall: expected points → points", "expected_points", "points"),
        ("Attack: expected goals → goals scored", "xg_for", "goals_for"),
        ("Defence: clean-sheet chance → clean sheets", "p_cs", "clean_sheet"),
    ):
        signal = within_club_signal(rows, value, target, [BLIND]).drop(columns="method")
        lens_rows.append(signal.assign(lens=name))
    lenses = pd.concat(lens_rows, ignore_index=True)
    lenses = lenses[["lens", *[c for c in lenses.columns if c != "lens"]]]
    lens_formats = {**formats, "kinder half": ".3f", "tougher half": ".3f", "kinder − tougher": "+.3f"}
    pairs = [(BLIND, ODDS), (BLIND, ELO), (BLIND, BOTH_FORM), (BLIND, OPPONENT_FORM), (BLIND, VENUE)]
    intervals = within_club_bootstrap(rows, pairs)
    ci_formats = {"club-seasons": ".0f", "difference": "+.3f", "95% low": "+.3f", "95% high": "+.3f"}
    preseason_methods = [m for m in FIXTURE_METHODS if m != ODDS]
    return f"""## 5. Telling a club's easy games from its hard ones

Every Monday, among each club's games in the next {PLANNING_WEEKS} weeks as forecast that Monday, so all forecasts in a
comparison share the same information and the club's own strength drops out: correlation of forecast and result after
removing each Monday's averages, and points per game in the kinder and tougher half of those games (an odd count
leaves its middle game out).

{table(within_club_signal(rows, "ease", "points", FIXTURE_METHODS), formats)}

Closing odds are set just before each game, after the earlier games in the window were played, so they learn from
results inside the comparison; that biases their numbers down, not up.

Differences in within-club correlation, 95% intervals from resampling club-seasons:

{table(intervals, ci_formats)}

A whole season from the pre-season forecasts only (the Monday before round 1, each club's games in thirds; closing
odds left out because they are set during the season):

{table(preseason_thirds(rows, "ease", "points", preseason_methods), third_formats)}

Per lens (blind settings, Mondays as in the first table; results in goals / clean-sheet rate / points):

{table(lenses, lens_formats)}"""


def runs_section(rows: pd.DataFrame, fresh: set[pd.Timestamp]) -> str:
    ranking = pd.DataFrame(index=RUN_METHODS)
    swings = pd.DataFrame(index=[m for m in RUN_METHODS if m != OWN])
    lens = pd.DataFrame(index=[BLIND, PROD])
    extremes, strongest, swing_extremes, intervals = [], [], [], []
    cutoffs = {}
    for length in RUN_LENGTHS:
        name = f"next {length}"
        sums = run_sums(rows, fresh, length)
        rho = mean_rank_correlation(sums, "ease", "points")
        ranking[name] = rho["mean"]
        cutoffs[name] = int(rho["count"].max())
        swing, swing_extreme = schedule_swing(rows, fresh, length)
        swings[name] = swing["mean"]
        swing_extremes.append(swing_extreme.rename_axis("method").reset_index().assign(run=name))
        dc = sums[sums["method"].isin([BLIND, PROD])]
        lens[f"xG → goals, {name}"] = mean_rank_correlation(dc, "xg", "goals")["mean"]
        lens[f"exp. CS → CS, {name}"] = mean_rank_correlation(dc, "p_cs", "clean_sheets")["mean"]
        extremes.append(run_extremes(sums, length).assign(run=name))
        strongest.append({"run": name, **kindest_is_strongest(sums)})
        pairs = [(ODDS, BLIND), (BLIND, ELO), (BLIND, BOTH_FORM), (BLIND, OWN)]
        intervals.extend({"run": name, **record} for record in run_correlation_bootstrap(sums, pairs))
    extreme_table = pd.concat(extremes, ignore_index=True)
    extreme_table = extreme_table[["run", *[c for c in extreme_table.columns if c != "run"]]]
    extreme_formats = {"kindest": ".2f", "toughest": ".2f", "kindest outscored toughest": ".0%", "five kindest": ".2f", "five toughest": ".2f"}  # fmt: skip
    swing_table = pd.concat(swing_extremes, ignore_index=True)
    swing_table = swing_table[["run", *[c for c in swing_table.columns if c != "run"]]]
    swing_formats = {c: "+.2f" for c in swing_table.columns if c not in ("run", "method")}
    ci_formats = {"difference": "+.3f", "95% low": "+.3f", "95% high": "+.3f"}
    return f"""## 6. Ranking runs of fixtures across clubs

At every Monday with new results ({", ".join(f"{k}: {v}" for k, v in cutoffs.items())} cutoffs), each club's next N games.
Rank correlation (Spearman) between the run total and the points the club actually took, averaged over cutoffs:

{table(ranking.rename_axis("method").reset_index(), {c: ".3f" for c in ranking.columns})}

Differences in mean rank correlation, 95% intervals from resampling two-month blocks of cutoffs:

{table(pd.DataFrame(intervals), ci_formats)}

Points per game actually taken by the kindest and toughest run (and the five kindest / five toughest) on the board:

{table(extreme_table, extreme_formats)}

Is the kindest run just the strongest club? (blind board, club rating from the same fit):

{table(pd.DataFrame(strongest), {c: ".0%" for c in strongest[0] if c != "run"})}

Schedule swing: is a club's next run kinder than the rest of its own season? Rank correlation of forecast swing
(run total − N × the club's average remaining game) with the same swing in real points:

{table(swings.rename_axis("method").reset_index(), {c: ".3f" for c in swings.columns})}

What the club with the kindest (toughest) forecast swing then took, in points per game against its own average over
the rest of the season:

{table(swing_table, swing_formats)}

Attack and defence lens totals against goals and clean sheets over the same runs (rank correlation):

{table(lens.rename_axis("method").reset_index(), {c: ".3f" for c in lens.columns})}"""


def lens_buckets(rows: pd.DataFrame, column: str) -> pd.Series:
    """Tile bucket (1 = kindest) on a higher-is-kinder lens, cut the way the board cuts it: quantile_scale over every
    forecast on the board at that cutoff (fixture_grid.lens_scales), then grid.ts scaleBucket."""
    buckets = pd.Series(np.nan, index=rows.index)
    for _, frame in rows.groupby("cutoff"):
        cuts = quantile_scale(frame[column].dropna().tolist()).cuts
        values = frame[column].to_numpy()
        buckets.loc[frame.index] = 1 + sum((values < cut).astype(int) for cut in cuts)
    return buckets


def lens_colour_table(rows: pd.DataFrame) -> pd.DataFrame:
    board = rows[rows["method"] == BLIND]
    board = board.assign(attack=lens_buckets(board, "xg_for"), defence=lens_buckets(board, "p_cs"))
    near = board[board["horizon"] <= PLANNING_WEEKS]
    attack = near.groupby("attack").agg(
        attack_share=("goals_for", "size"), expected_goals=("xg_for", "mean"), goals=("goals_for", "mean")
    )
    defence = near.groupby("defence").agg(
        defence_share=("clean_sheet", "size"), clean_sheet_chance=("p_cs", "mean"), clean_sheets=("clean_sheet", "mean")
    )
    out = attack.join(defence)
    out["attack_share"] /= out["attack_share"].sum()
    out["defence_share"] /= out["defence_share"].sum()
    return out.rename_axis("bucket").reset_index().assign(bucket=lambda t: t["bucket"].astype(int))


def lenses_section(planning: pd.DataFrame, rows: pd.DataFrame) -> str:
    blind = planning[planning["method"] == BLIND]
    colours = lens_colour_table(rows)
    colour_formats = {"bucket": ".0f", "attack_share": ".1%", "expected_goals": ".2f", "goals": ".2f", "defence_share": ".1%", "clean_sheet_chance": ".1%", "clean_sheets": ".1%"}  # fmt: skip
    bins = pd.cut(blind["xg_for"], [0, 0.5, 0.75, 1.0, 1.25, 1.5, 2.0, 2.5, 3.0, np.inf], right=False)
    xg = (
        blind.groupby(bins, observed=True)
        .agg(forecasts=("goals_for", "size"), predicted=("xg_for", "mean"), actual=("goals_for", "mean"))
        .rename_axis("expected goals")
        .reset_index()
    )
    xg["expected goals"] = xg["expected goals"].astype(str)
    quintile = pd.qcut(blind["p_cs"], 5)
    cs = (
        blind.groupby(quintile, observed=True)
        .agg(forecasts=("clean_sheet", "size"), predicted=("p_cs", "mean"), actual=("clean_sheet", "mean"))
        .rename_axis("clean-sheet chance")
        .reset_index()
    )
    cs["clean-sheet chance"] = cs["clean-sheet chance"].astype(str)
    totals = (
        planning[planning["method"].isin([BLIND, PROD, VENUE])]
        .groupby("method")
        .agg(
            expected_goals=("xg_for", "mean"),
            goals=("goals_for", "mean"),
            clean_sheet_chance=("p_cs", "mean"),
            clean_sheets=("clean_sheet", "mean"),
        )
        .reindex([BLIND, PROD, VENUE])
        .rename_axis("method")
        .reset_index()
    )
    return f"""## 7. Attack and defence lenses

Tile colours on the Attack (expected goals) and Defence (clean-sheet chance) lenses, cut as the board cuts them
(15/20/30/20/15% of every forecast on the board at that Monday; bucket 1 = greenest), for games within {PLANNING_WEEKS} weeks:

{table(colours, colour_formats)}

Expected goals (a tile on the Attack lens) against goals scored, blind settings, within {PLANNING_WEEKS} weeks:

{table(xg, {"forecasts": ".0f", "predicted": ".2f", "actual": ".2f"})}

Clean-sheet chance (Defence lens) by quintile against clean sheets kept:

{table(cs, {"forecasts": ".0f", "predicted": ".1%", "actual": ".1%"})}

Per club-match averages:

{table(totals, {"expected_goals": ".3f", "goals": ".3f", "clean_sheet_chance": ".1%", "clean_sheets": ".1%"})}"""


def horizon_section(scored: pd.DataFrame, rows: pd.DataFrame) -> str:
    by_week = scored.pivot_table(index="method", columns="horizon", values="rps", aggfunc="mean").reindex(MATCH_METHODS)
    by_week.columns = [f"week {int(h)}" for h in by_week.columns]
    stability = label_stability(rows)
    stability_formats = {"games": ".0f", "same label as in its own week": ".1%", "within one label": ".1%", "mean change in difficulty": ".1f"}  # fmt: skip
    return f"""## 8. How far ahead

RPS by week ahead (week 1 = the 7 days after the Monday cutoff):

{table(by_week.rename_axis("method").reset_index(), {c: ".4f" for c in by_week.columns})}

How much a game's production label changes between an early forecast and the one in its own week:

{table(stability, stability_formats)}"""


def promoted_section(scored: pd.DataFrame, planning: pd.DataFrame, matches: pd.DataFrame) -> str:
    promoted = {season: promoted_teams(matches, season) for season in TEST_SEASONS}

    def stage(frame: pd.DataFrame) -> np.ndarray:
        first = frame.groupby("season_start")["cutoff"].transform("min")
        return np.where((frame["cutoff"] - first).dt.days < 56, "cutoffs in weeks 1–8", "cutoffs after week 8")

    games = scored[scored["method"].isin([BLIND, ODDS])]
    games = games.assign(
        stage=stage(games),
        involves=[
            "a promoted club plays" if h in promoted[s] or a in promoted[s] else "no promoted club"
            for s, h, a in zip(games["season_start"], games["home"], games["away"], strict=True)
        ],
    )
    gap = games.pivot_table(index=["involves", "stage"], columns="method", values="rps", aggfunc="mean")
    gap["forecasts"] = games[games["method"] == BLIND].groupby(["involves", "stage"]).size()
    gap["gap to closing odds"] = gap[BLIND] - gap[ODDS]
    clubs = planning[planning["method"] == BLIND]
    clubs = clubs.assign(
        stage=stage(clubs),
        club=[
            "promoted club" if t in promoted[s] else "other club"
            for s, t in zip(clubs["season_start"], clubs["team"], strict=True)
        ],
    )
    bias = clubs.groupby(["club", "stage"]).agg(
        forecasts=("points", "size"), expected_ppg=("expected_points", "mean"), actual_ppg=("points", "mean")
    )
    bias["actual − expected"] = bias["actual_ppg"] - bias["expected_ppg"]
    return f"""## 9. Promoted clubs

Match RPS (within {PLANNING_WEEKS} weeks) with and without a promoted club, early and later in the season:

{table(gap.reset_index(), {BLIND: ".4f", ODDS: ".4f", "forecasts": ".0f", "gap to closing odds": "+.4f"})}

Points per game expected and taken, by club:

{table(bias.reset_index(), {"forecasts": ".0f", "expected_ppg": ".2f", "actual_ppg": ".2f", "actual − expected": "+.2f"})}"""


def projection_section(rows_all: pd.DataFrame, matches: pd.DataFrame) -> str:
    records = []
    for season in TEST_SEASONS:
        games = matches[matches["season_start"] == season]
        final = season_points(games)
        clubs = final.index
        season_rows = rows_all[(rows_all["season_start"] == season) & rows_all["method"].isin([BLIND, PROD, ELO])]
        cutoffs = sorted(pd.Timestamp(c) for c in season_rows["cutoff"].unique())
        played = {c: games[games["date"] < c] for c in cutoffs}
        halfway = next(c for c in cutoffs if len(played[c]) >= len(games) // 2)
        for stage, cutoff in (("pre-season", cutoffs[0]), ("half-way", halfway)):
            so_far = (
                season_points(played[cutoff]).reindex(clubs, fill_value=0)
                if len(played[cutoff])
                else pd.Series(0, index=clubs)
            )
            at = season_rows[season_rows["cutoff"] == cutoff]
            projections = {
                method: so_far
                + at[at["method"] == method].groupby("team")["expected_points"].sum().reindex(clubs, fill_value=0)
                for method in (BLIND, PROD, ELO)
            }
            if stage == "pre-season":
                last = season_points(matches[matches["season_start"] == season - 1])
                projections["Last season's points (promoted: relegated clubs' average)"] = last.reindex(clubs).fillna(
                    last.nsmallest(3).mean()
                )
            else:
                per_game = so_far / games_played(played[cutoff]).reindex(clubs)
                projections["Points per game so far × 38"] = per_game * 38
            for method, projected in projections.items():
                records.append(
                    {
                        "stage": stage,
                        "method": method,
                        "season": season,
                        "error": (projected - final).abs().mean(),
                        "rank correlation": projected.rank().corr(final.rank()),
                    }
                )
    frame = pd.DataFrame(records)
    summary = (
        frame.groupby(["stage", "method"], sort=False)
        .agg(**{"mean absolute error (points)": ("error", "mean"), "rank correlation": ("rank correlation", "mean")})
        .reset_index()
    )
    return f"""## 10. Whole-season view (the predicted table)

Final points projected as points so far + the sum of expected points over every remaining game, against the real
final table (mean over the 9 seasons; pre-season = the Monday before round 1, half-way = the first Monday after half
the matches were played):

{table(summary, {"mean absolute error (points)": ".1f", "rank correlation": ".3f"})}"""


def snapshot_section(rows_all: pd.DataFrame, fresh: set[pd.Timestamp], season: int = 2025, start: str = "2026-02-02", length: int = 5) -> str:  # fmt: skip
    prod = rows_all[(rows_all["method"] == PROD) & (rows_all["season_start"] == season)]
    cutoff = min(c for c in fresh if c >= pd.Timestamp(start) and c.year == int(start[:4]))
    at = prod[prod["cutoff"] == cutoff].sort_values(["team", "date"], kind="stable")
    at = at[at.groupby("team").cumcount() < length]
    records = []
    for team, games in at.groupby("team"):
        records.append(
            {
                "club": team,
                f"next {length}: opponent (venue) difficulty": ", ".join(
                    f"{o} ({v}) {d:.0f}"
                    for o, v, d in zip(games["opponent"], games["venue"], games["difficulty"], strict=True)
                ),
                "labels": ", ".join(difficulty_label(d) for d in games["difficulty"]),
                "expected points": games["expected_points"].sum(),
                "points taken": int(games["points"].sum()),
            }
        )
    board = pd.DataFrame(records).sort_values("expected points", ascending=False, ignore_index=True)
    board.insert(0, "board rank", range(1, len(board) + 1))
    board["actual rank"] = board["points taken"].rank(ascending=False, method="min").astype(int)
    rho = board["expected points"].rank().corr(board["points taken"].rank())
    return f"""## 11. One board from the past

The production model's Next {length} as it would have looked on Monday {cutoff:%Y-%m-%d} ({season_label(season)}), and what happened
(rank correlation {rho:.2f}):

{table(board, {"expected points": ".1f"})}"""


def scorecard_section(scored: pd.DataFrame, rows: pd.DataFrame, planning: pd.DataFrame, fresh: set[pd.Timestamp], blind_cuts: dict) -> str:  # fmt: skip
    rps = scored.pivot_table(index="season_start", columns="method", values="rps", aggfunc="mean")
    sums = run_sums(rows, fresh, 5)
    per_cutoff = rank_correlations(sums, "ease", "points").unstack("method")
    season_of = sums.drop_duplicates("cutoff").set_index("cutoff")["season_start"]
    runs = per_cutoff.groupby(season_of.reindex(per_cutoff.index).to_numpy()).mean()
    blind = planning[planning["method"] == BLIND]
    labels = label_rows(blind, blind_cuts)
    records = []
    for season in TEST_SEASONS:
        signal = within_club_signal(rows[rows["season_start"] == season], "ease", "points", [BLIND]).iloc[0]
        in_season = blind[blind["season_start"] == season]
        ppg = in_season.assign(label=labels.loc[in_season.index]).groupby("label", observed=False)["points"].mean()
        venue, model, odds = rps.loc[season, VENUE], rps.loc[season, BLIND], rps.loc[season, ODDS]
        records.append(
            {
                "season": season_label(season),
                "RPS": model,
                "closing odds RPS": odds,
                "venue-only → odds gap closed": (venue - model) / (venue - odds),
                "within-club correlation": signal["within-club correlation"],
                "kinder − tougher half (ppg)": signal["kinder − tougher"],
                "next-5 rank correlation": runs.loc[season, BLIND],
                "next-5, club rating only": runs.loc[season, OWN],
                "Easy ppg": ppg["Easy"],
                "Hard ppg": ppg["Hard"],
            }
        )
    formats = {
        "RPS": ".4f",
        "closing odds RPS": ".4f",
        "venue-only → odds gap closed": ".0%",
        "within-club correlation": ".3f",
        "kinder − tougher half (ppg)": "+.2f",
        "next-5 rank correlation": ".3f",
        "next-5, club rating only": ".3f",
        "Easy ppg": ".2f",
        "Hard ppg": ".2f",
    }
    return f"""## 13. Season by season (blind settings)

RPS within {PLANNING_WEEKS} weeks; "gap closed" = how much of the distance from a venue-only forecast to the closing odds the
model covers; within-club numbers compare each Monday's games in the next {PLANNING_WEEKS} weeks (section 5); Easy / Hard =
points per game with the season's blind cut points.

{table(pd.DataFrame(records), formats)}"""


def worked_example_section(season: int = 2026, cutoff: str = "2026-09-15") -> str:
    """The formula on today's ratings for example fixtures, history loaded as the predict job loads it."""
    history = load_history(range(season - 3, season + 1), CACHE_DIR)
    current = history[history["season_start"] == season]
    teams = sorted(set(current["home"]) | set(current["away"]))
    model = fit_dixon_coles(
        history,
        pd.Timestamp(cutoff),
        teams=teams,
        promoted=promoted_teams(history, season),
        config=load_config(CONFIG_PATH),
    )
    ratings = model.ratings().set_index("team")
    records = []
    for home, away in (("Real Madrid", "Getafe"), ("Getafe", "Real Madrid"), ("Celta", "Villarreal")):
        home_side, away_side = predict_both_sides(model, home, away)
        for team, venue, side in ((home, "H", home_side), (away, "A", away_side)):
            records.append(
                {
                    "fixture": f"{home} v {away}",
                    "club": team,
                    "venue": venue,
                    "attack": ratings.loc[team, "attack"],
                    "defence": ratings.loc[team, "defence"],
                    "xG for": side.xg_for,
                    "xG against": side.xg_against,
                    "win": side.p_win,
                    "draw": side.p_draw,
                    "loss": side.p_loss,
                    "exp. points": side.expected_points,
                    "difficulty": side.difficulty_score,
                    "label": side.difficulty_label,
                    "clean sheet": side.p_clean_sheet,
                }
            )
    formats = {"attack": "+.3f", "defence": "+.3f", "xG for": ".2f", "xG against": ".2f", "win": ".1%", "draw": ".1%", "loss": ".1%", "exp. points": ".2f", "difficulty": ".1f", "clean sheet": ".1%"}  # fmt: skip
    return f"""## 12. Worked example (today's model)

Fitted on {cutoff} with the production settings, on football-data.co.uk results through {history["date"].max():%Y-%m-%d}
({len(history[history["date"] >= pd.Timestamp(cutoff) - pd.Timedelta(days=730)])} matches in the 730-day window):
mu = {model.mu:+.3f} (e^mu = {np.exp(model.mu):.2f} goals for an average away side), home advantage = {model.home_adv:+.3f}
(x{np.exp(model.home_adv):.2f}), rho = {model.rho:+.3f}.

{table(pd.DataFrame(records), formats)}"""


def build_tables(matches: pd.DataFrame, state: dict) -> str:
    settings, forecasts = state["settings"], state["forecasts"]
    rows_all = with_references(team_view(forecasts), state["form"])
    check_formula(rows_all)
    rows = rows_all[rows_all["has_odds"]]
    planning = rows[rows["horizon"] <= PLANNING_WEEKS]
    scored = scored_matches(forecasts)
    fresh = fresh_cutoffs(matches, forecasts)
    blind_cuts = {season: settings[season]["thresholds"] for season in TEST_SEASONS}
    production_cuts = dict.fromkeys(TEST_SEASONS, LABEL_THRESHOLDS)
    sections = [
        ("setup", lambda: setup_section(matches, forecasts, scored, planning, state, fresh)),
        ("settings", lambda: settings_section(settings, matches, forecasts)),
        ("accuracy", lambda: accuracy_section(scored)),
        ("labels", lambda: labels_section(planning, blind_cuts, production_cuts)),
        ("calibration", lambda: calibration_section(planning)),
        ("within team", lambda: within_team_section(rows)),
        ("runs", lambda: runs_section(rows, fresh)),
        ("lenses", lambda: lenses_section(planning, rows)),
        ("horizon", lambda: horizon_section(scored, rows)),
        ("promoted", lambda: promoted_section(scored, planning, matches)),
        ("projection", lambda: projection_section(rows_all, matches)),
        ("snapshot", lambda: snapshot_section(rows_all, fresh)),
        ("worked example", worked_example_section),
        ("scorecard", lambda: scorecard_section(scored, rows, planning, fresh, blind_cuts)),
    ]
    parts = []
    for name, build in sections:
        started = time.perf_counter()
        parts.append(build())
        logger.info("section %s: %.1f s", name, time.perf_counter() - started)
    header = (
        "# Fixture difficulty backtest: result tables\n\nGenerated by `reports/experiments/difficulty_backtest.py`."
    )
    return "\n\n".join([header, *parts]) + "\n"


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--out", type=Path, required=True, help="markdown file for the result tables")
    parser.add_argument("--cache", type=Path, help="pickle of the forecasts: reused when it exists, written otherwise")
    parser.add_argument("--workers", type=int, default=6)
    args = parser.parse_args()

    configure_logging()
    started = time.perf_counter()
    matches = load_history(range(HISTORY_FROM, TEST_SEASONS[-1] + 1), CACHE_DIR)
    logger.info(
        "loaded %d matches, %s to %s",
        len(matches),
        f"{matches['date'].min():%Y-%m-%d}",
        f"{matches['date'].max():%Y-%m-%d}",
    )
    if args.cache and args.cache.exists():
        state = pd.read_pickle(args.cache)
        logger.info("forecasts from %s", args.cache)
    else:
        state = compute(matches, args.workers)
        if args.cache:
            pd.to_pickle(state, args.cache)
    logger.info("forecasting done after %.0f s", time.perf_counter() - started)
    args.out.write_text(build_tables(matches, state), encoding="utf-8")
    logger.info("tables → %s (%.0f s)", args.out, time.perf_counter() - started)


if __name__ == "__main__":
    main()
