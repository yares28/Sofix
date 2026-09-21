import numpy as np
import pandas as pd
import pytest

from app.backtest.calibration import band_table, clean_sheet_calibration, label_for, propose_thresholds, with_difficulty
from app.backtest.data import normalize_season, promoted_teams
from app.backtest.methods import Method, base_rates, closing_odds, dixon_coles, elo_fallback, market_blend
from app.backtest.metrics import accuracy, brier, log_loss, outcome_index, ranked_probability_score, summarize
from app.backtest.walkforward import run_ranking, run_walkforward, season_cutoffs, team_perspective
from app.modeling.dixon_coles import DixonColesConfig
from tests.conftest import simulate_league

# ---------------------------------------------------------------- metrics


def test_outcome_index():
    assert outcome_index([2, 1, 0], [0, 1, 3]).tolist() == [0, 1, 2]


def test_rps_known_values():
    assert ranked_probability_score(np.array([[1, 0, 0]]), np.array([0])) == 0
    assert ranked_probability_score(np.array([[0, 0, 1]]), np.array([0])) == 1
    # Uniform forecast, draw happens: ((1/3)^2 + (1/3)^2) / 2
    assert ranked_probability_score(np.array([[1 / 3] * 3]), np.array([1])) == pytest.approx(1 / 9)
    # A near miss (draw when home win happened) is punished less than a far miss
    assert ranked_probability_score(np.array([[0, 1, 0]]), np.array([0])) < 1


def test_log_loss_accuracy_brier():
    probs = np.array([[0.5, 0.3, 0.2], [0.2, 0.2, 0.6]])
    outcome = np.array([0, 1])
    assert log_loss(probs, outcome) == pytest.approx(-(np.log(0.5) + np.log(0.2)) / 2)
    assert accuracy(probs, outcome) == 0.5
    assert brier(np.array([0.8, 0.2]), np.array([1, 0])) == pytest.approx(0.04)


def test_summarize_groups():
    df = pd.DataFrame(
        {
            "method": ["a", "a", "b"],
            "p_h": [1.0, 0.0, 0.4],
            "p_d": [0.0, 1.0, 0.3],
            "p_a": [0.0, 0.0, 0.3],
            "cs_h": [0.5, 0.5, np.nan],
            "cs_a": [0.5, 0.5, np.nan],
            "hg": [1, 0, 1],
            "ag": [0, 0, 2],
        }
    )
    table = summarize(df, ["method"]).set_index("method")
    assert table.loc["a", "rps"] == 0 and table.loc["a", "accuracy"] == 1
    assert table.loc["a", "clean_sheet_brier"] == pytest.approx(0.25)
    assert np.isnan(table.loc["b", "clean_sheet_brier"])


def test_summarize_empty_keeps_metric_columns():
    empty = pd.DataFrame(columns=["method", "p_h", "p_d", "p_a", "cs_h", "cs_a", "hg", "ag"])
    assert {"method", "rps", "accuracy"} <= set(summarize(empty, ["method"]).columns)


# ---------------------------------------------------------------- data

RAW = pd.DataFrame(
    {
        "Date": ["18/08/23", "19/08/2023", None],
        "HomeTeam": ["Sevilla ", "Betis", "x"],
        "AwayTeam": ["Valencia", "Sevilla", "y"],
        "FTHG": [1, 2, None],
        "FTAG": [2, 2, None],
        "HST": [5, 4, None],
        "AST": [3, 6, None],
        "HR": [0, 1, None],
        "AR": [1, 0, None],
        "PSCH": [2.1, np.nan, None],
        "PSCD": [3.2, np.nan, None],
        "PSCA": [3.6, np.nan, None],
        "AvgCH": [2.0, 2.5, None],
        "AvgCD": [3.1, 3.0, None],
        "AvgCA": [3.5, 2.9, None],
        "PSH": [2.3, np.nan, None],
        "PSD": [3.3, np.nan, None],
        "PSA": [3.4, np.nan, None],
        "B365H": [2.25, 2.6, None],
        "B365D": [3.25, 3.1, None],
        "B365A": [3.3, 2.8, None],
    }
)


def test_normalize_season_parses_dates_and_prefers_pinnacle_odds():
    df = normalize_season(RAW, 2023)
    assert len(df) == 2
    assert df["date"].tolist() == [pd.Timestamp("2023-08-18"), pd.Timestamp("2023-08-19")]
    assert df.loc[0, "home"] == "Sevilla"
    assert df.loc[0, "odds_h"] == 2.1  # Pinnacle closing
    assert df.loc[1, "odds_h"] == 2.5  # falls back to market-average closing


def test_normalize_season_validates():
    with pytest.raises(ValueError, match="missing columns"):
        normalize_season(RAW.drop(columns=["FTHG"]), 2023)
    with pytest.raises(ValueError, match="itself"):
        normalize_season(RAW.assign(AwayTeam=["Sevilla ", "Betis", "y"]), 2023)
    with pytest.raises(ValueError, match="negative"):
        normalize_season(RAW.assign(FTHG=[-1, 2, None]), 2023)


def test_ambiguous_dates_are_day_first():
    raw = RAW.iloc[:2].assign(Date=["01/02/20", "05/09/2023"])
    assert normalize_season(raw, 2019)["date"].tolist() == [pd.Timestamp("2020-02-01"), pd.Timestamp("2023-09-05")]


def test_odds_come_from_one_complete_valid_source():
    raw = RAW.iloc[:2].assign(PSCH=[2.1, 2.4], PSCD=[np.nan, 3.0], PSCA=[3.6, 1.0])
    df = normalize_season(raw, 2023)
    # Pinnacle incomplete (row 0) or invalid (row 1, odds of 1.0) -> whole set from market average
    assert df.loc[0, ["odds_h", "odds_d", "odds_a"]].tolist() == [2.0, 3.1, 3.5]
    assert df.loc[1, ["odds_h", "odds_d", "odds_a"]].tolist() == [2.5, 3.0, 2.9]


def test_pre_closing_odds_never_take_a_closing_price():
    df = normalize_season(RAW, 2023)
    assert df.loc[0, "odds_pre_h"] == 2.3  # Pinnacle, as published before the closing line
    assert df.loc[1, "odds_pre_h"] == 2.6  # Pinnacle missing -> Bet365; the closing price (2.5) is not used
    assert df.loc[1, ["odds_pre_d", "odds_pre_a"]].tolist() == [3.1, 2.8]


def test_missing_optional_columns_become_nan():
    df = normalize_season(RAW[["Date", "HomeTeam", "AwayTeam", "FTHG", "FTAG"]], 2023)
    assert df[["hst", "ast", "hr", "ar", "odds_h", "odds_pre_h"]].isna().all().all()


def test_red_cards_come_through():
    df = normalize_season(RAW, 2023)
    assert df["hr"].tolist() == [0, 1] and df["ar"].tolist() == [1, 0]


def test_promoted_teams():
    matches = pd.DataFrame(
        {
            "season_start": [2021, 2021, 2022, 2022],
            "home": ["A", "B", "A", "C"],
            "away": ["B", "A", "C", "A"],
        }
    )
    assert promoted_teams(matches, 2022) == {"C"}
    assert promoted_teams(matches, 2021) == frozenset()


# ---------------------------------------------------------------- walk-forward


def test_season_cutoffs_start_on_monday_before_first_match():
    season = pd.DataFrame({"date": pd.to_datetime(["2024-08-15", "2024-09-01"])})  # Thursday
    cutoffs = season_cutoffs(season)
    assert cutoffs[0] == pd.Timestamp("2024-08-12") and cutoffs[0].weekday() == 0
    assert cutoffs[-1] <= pd.Timestamp("2024-09-01")


def test_walkforward_never_leaks_future_results():
    league = simulate_league(seasons=(2020, 2021), repeats=2)
    calls = []

    def spy(history, cutoff, targets, promoted):
        assert history["date"].max() < cutoff
        assert targets["date"].min() >= cutoff
        assert targets["date"].max() < cutoff + pd.Timedelta(weeks=3)
        calls.append(cutoff)
        return pd.DataFrame(
            {"p_h": [0.4] * len(targets), "p_d": 0.3, "p_a": 0.3, "cs_h": 0.3, "cs_a": 0.2, "lam_h": 1.4, "lam_a": 1.1}
        )

    preds = run_walkforward(league, [2021], [Method("spy", spy)], horizon_weeks=3)
    assert calls and len(preds) > 0
    assert preds["horizon"].between(1, 3).all()
    assert (preds["date"] >= preds["cutoff"]).all()


def test_all_methods_produce_valid_probabilities():
    league = simulate_league(seasons=(2020, 2021), repeats=2)
    methods = [dixon_coles("dc", DixonColesConfig()), base_rates(), elo_fallback(), closing_odds()]
    preds = run_walkforward(league, [2021], methods, horizon_weeks=2)
    assert set(preds["method"]) == {"dc", "Base rates", "Elo (current fallback)", "Closing odds (ceiling)"}
    assert np.allclose(preds[["p_h", "p_d", "p_a"]].sum(axis=1), 1.0)
    assert preds.loc[preds["method"] == "dc", ["cs_h", "cs_a"]].notna().all().all()


def test_market_blend_only_touches_priced_matches_inside_the_horizon():
    league = simulate_league(seasons=(2020, 2021), repeats=2)
    # A lopsided price on every match: where it applies, the forecast must move toward it.
    priced = league.assign(odds_pre_h=1.2, odds_pre_d=8.0, odds_pre_a=15.0)
    priced.loc[priced.index[::2], "odds_pre_h"] = np.nan  # half the matches have no complete price
    config = DixonColesConfig()
    methods = [dixon_coles("plain", config), market_blend("blend", config, weight=0.5, horizon_weeks=1)]
    preds = run_walkforward(priced, [2021], methods, horizon_weeks=4)
    keys = ["cutoff", "date", "home", "away"]
    pair = (
        preds[preds["method"] == "plain"]
        .merge(preds[preds["method"] == "blend"], on=keys, suffixes=("_plain", "_blend"))
        .merge(priced[["date", "home", "away", "odds_pre_h"]], on=["date", "home", "away"])
    )
    assert np.allclose(pair[["p_h_blend", "p_d_blend", "p_a_blend"]].sum(axis=1), 1.0)
    blended = pair["odds_pre_h"].notna() & (pair["horizon_plain"] == 1)
    assert blended.any() and (~blended).any()
    assert (pair.loc[blended, "p_h_blend"] > pair.loc[blended, "p_h_plain"]).all()
    assert pair.loc[~blended, "p_h_blend"].to_numpy() == pytest.approx(pair.loc[~blended, "p_h_plain"].to_numpy())


def test_market_blend_never_reads_the_closing_price():
    league = simulate_league(seasons=(2020, 2021), repeats=2).assign(
        odds_h=1.01, odds_d=100.0, odds_a=100.0, odds_pre_h=np.nan, odds_pre_d=np.nan, odds_pre_a=np.nan
    )
    config = DixonColesConfig()
    methods = [dixon_coles("plain", config), market_blend("blend", config, weight=0.9)]
    preds = run_walkforward(league, [2021], methods, horizon_weeks=2)
    plain = preds[preds["method"] == "plain"]["p_h"].to_numpy()
    assert preds[preds["method"] == "blend"]["p_h"].to_numpy() == pytest.approx(plain)


def test_model_beats_base_rates_on_a_league_with_real_differences():
    league = simulate_league(seasons=(2020, 2021, 2022), repeats=3)
    methods = [dixon_coles("dc", DixonColesConfig(xi=0.001)), base_rates()]
    table = summarize(run_walkforward(league, [2022], methods, horizon_weeks=4), ["method"]).set_index("method")
    assert table.loc["dc", "rps"] < table.loc["Base rates", "rps"]


def test_team_perspective_and_run_ranking():
    league = simulate_league(seasons=(2020, 2021), repeats=4)
    preds = run_walkforward(league, [2021], [dixon_coles("dc", DixonColesConfig())], horizon_weeks=4)
    teams = team_perspective(preds)
    assert len(teams) == 2 * len(preds)
    assert set(teams["points"]) <= {0, 1, 3}
    # One match seen from both sides: win + loss probabilities swap
    first = teams.iloc[[0, len(preds)]]
    assert first["p_win"].iloc[0] == pytest.approx(first["p_loss"].iloc[1])

    # Only 6 teams: under the 10-team minimum, so correlations are skipped (NaN), not crashed.
    ranking = run_ranking(preds, run_length=3)
    assert ranking["mean"].isna().all()


def test_run_ranking_rewards_a_model_that_knows_the_teams():
    league = simulate_league(seasons=(2020, 2021), repeats=2, n_teams=12, seed=11)
    methods = [dixon_coles("dc", DixonColesConfig(xi=0.0)), base_rates()]
    ranking = run_ranking(run_walkforward(league, [2021], methods, horizon_weeks=8)).set_index("method")
    assert ranking.loc["dc", "count"] > 0
    assert ranking.loc["dc", "mean"] > ranking.loc["Base rates", "mean"]
    assert -1 <= ranking.loc["dc", "mean"] <= 1


# ---------------------------------------------------------------- calibration


def test_propose_thresholds_hits_target_shares():
    scores = pd.Series(np.linspace(0, 100, 1001))
    thresholds = propose_thresholds(scores)
    assert thresholds == pytest.approx((15, 35, 65, 85), abs=0.2)
    shares = label_for(scores, thresholds).value_counts(normalize=True, sort=False)
    assert shares.tolist() == pytest.approx([0.15, 0.20, 0.30, 0.20, 0.15], abs=0.01)
    with pytest.raises(ValueError):
        propose_thresholds(scores, shares=(0.5, 0.6))
    with pytest.raises(ValueError, match="clustered"):
        propose_thresholds(pd.Series([50.0] * 100))


def test_band_table_and_clean_sheet_calibration():
    rows = pd.DataFrame(
        {
            "p_win": [0.8, 0.5, 0.1, 0.3],
            "p_draw": [0.1, 0.3, 0.2, 0.3],
            "p_loss": [0.1, 0.2, 0.7, 0.4],
            "points": [3, 1, 0, 3],
            "expected_points": [2.5, 1.8, 0.5, 1.2],
            "p_cs": [0.5, 0.3, 0.1, 0.2],
            "goals_against": [0, 1, 2, 0],
        }
    )
    rows = with_difficulty(rows)
    table = band_table(rows, (33.3, 48.3, 61.7, 73.3)).set_index("label")
    assert table["fixtures"].sum() == 4
    assert table.loc["Very favourite", "actual_ppg"] == 3
    calibration = clean_sheet_calibration(rows, bins=2)
    assert calibration["fixtures"].sum() == 4
