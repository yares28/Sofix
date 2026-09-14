import numpy as np
import pandas as pd
import pytest

from app.backtest.methods import base_rates, closing_odds, dixon_coles, elo_fallback
from app.backtest.walkforward import run_walkforward
from app.jobs.backtest import build_report, config_grid, horizon_bucket, md_table, tune, with_known_odds
from app.modeling.dixon_coles import DixonColesConfig
from tests.conftest import simulate_league


@pytest.fixture(scope="module")
def big_league():
    return simulate_league(seasons=(2020, 2021, 2022), repeats=2, n_teams=10, seed=5)


def test_config_grids():
    assert len(config_grid(quick=True)) == 4
    assert len(config_grid(quick=False)) == 60


def test_with_known_odds_drops_matches_without_prices(big_league):
    matches = big_league.copy()
    matches.loc[matches.index[:5], "odds_h"] = np.nan
    preds = run_walkforward(matches, [2021], [base_rates()], horizon_weeks=2)
    kept = with_known_odds(preds, matches)
    dropped = set(map(tuple, matches.loc[matches.index[:5], ["date", "home", "away"]].to_numpy()))
    assert not set(map(tuple, kept[["date", "home", "away"]].to_numpy())) & dropped
    assert len(kept) <= len(preds)


def test_with_known_odds_rejects_duplicate_match_rows(big_league):
    doubled = pd.concat([big_league, big_league.iloc[:1]])
    preds = run_walkforward(big_league, [2021], [base_rates()], horizon_weeks=1)
    with pytest.raises(Exception, match="many-to-one"):
        with_known_odds(preds, doubled)


def test_tune_picks_the_lowest_rps_and_survives_a_bad_config(big_league):
    grid = [DixonColesConfig(xi=0.0), DixonColesConfig(xi=0.0, window_days=0)]  # second has no data -> fails
    best, table = tune(big_league, [2021], grid, workers=1)
    assert best == grid[0]
    assert table["rps"].isna().sum() == 1
    with pytest.raises(RuntimeError, match="every tuning config failed"):
        tune(big_league, [2021], grid[1:], workers=1)


def test_horizon_bucket_labels_everything():
    labels = horizon_bucket(pd.Series([1, 2, 5, 8, 12]))
    assert labels.tolist() == ["1 week", "2–3 weeks", "4–5 weeks", "6–8 weeks", "later"]


def test_md_table_formats_and_blanks_nan():
    table = md_table(pd.DataFrame({"a": [0.12345, np.nan], "b": ["x", "y"]}), {"a": ".2f"})
    assert "| 0.12 | x |" in table and "| — | y |" in table


def test_build_report_end_to_end(big_league):
    best = DixonColesConfig(xi=0.001)
    methods = [dixon_coles("Dixon-Coles (tuned)", best), elo_fallback(), base_rates(), closing_odds()]
    test = with_known_odds(run_walkforward(big_league, [2022], methods), big_league)
    tune_best = with_known_odds(run_walkforward(big_league, [2021], [methods[0]]), big_league)
    tuning = pd.DataFrame([{"xi": 0.001, "goals_weight": 0.7, "ridge": 2.0, "promoted_prior": -0.2, "rps": 0.2}])

    report = build_report(big_league, best, tuning, test, tune_best, [2021], [2022])

    for heading in ["## 1. Chosen settings", "## 2. Overall accuracy", "## 5. Ranking runs", "## 8. Current ratings"]:
        assert heading in report
    assert "tuned on 2021/22" in report and "from **2022/23**" in report
    assert "Team 00" in report
