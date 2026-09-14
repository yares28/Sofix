import numpy as np
import pandas as pd
import pytest
from scipy.optimize import check_grad
from scipy.stats import poisson

from app.modeling import dixon_coles as dc
from app.modeling.dixon_coles import (
    DixonColesConfig, FitData, blended_targets, fit_dixon_coles, objective, outcome_table, score_matrix,
)
from tests.conftest import HOME_ADV, TRUE_ATTACK, TRUE_DEFENCE

GOALS_ONLY = DixonColesConfig(xi=0.0, goals_weight=1.0, ridge=0.5, promoted_prior=0.0, window_days=5000)


def test_score_matrix_is_a_probability_distribution():
    matrix = score_matrix(np.array([1.4, 0.6]), np.array([1.1, 2.3]), rho=-0.1, max_goals=10)
    assert matrix.shape == (2, 11, 11)
    assert np.allclose(matrix.sum(axis=(1, 2)), 1.0)
    assert (matrix >= 0).all()


def test_adjustments_hit_the_right_cells():
    lam_h, lam_a, rho = np.array([2.0]), np.array([0.5]), -0.1
    adjusted = score_matrix(lam_h, lam_a, rho, max_goals=10)[0]
    plain = poisson.pmf(np.arange(11), 2.0)[:, None] * poisson.pmf(np.arange(11), 0.5)[None, :]
    ratio = adjusted / plain
    z = ratio[2, 2]  # untouched cell: only the normalisation applies
    assert ratio[0, 0] / z == pytest.approx(1 - 2.0 * 0.5 * rho)
    assert ratio[0, 1] / z == pytest.approx(1 + 2.0 * rho)   # home 0, away 1 -> uses lam_home
    assert ratio[1, 0] / z == pytest.approx(1 + 0.5 * rho)   # home 1, away 0 -> uses lam_away
    assert ratio[1, 1] / z == pytest.approx(1 - rho)


def test_gradient_matches_finite_differences():
    rng = np.random.default_rng(3)
    n, m = 6, 80
    data = FitData(
        n_teams=n, home_idx=rng.integers(0, n, m), away_idx=rng.integers(0, n, m),
        weights=np.exp(-0.003 * rng.integers(0, 700, m)), home_target=rng.poisson(1.5, m) * 0.6 + 0.4,
        away_target=rng.poisson(1.1, m) * 0.6 + 0.3, prior=np.array([0, 0, 0, 0, -0.2, -0.2]), ridge=2.0,
    )
    theta = rng.normal(0, 0.3, 2 + 2 * n)
    error = check_grad(lambda t: objective(t, data)[0], lambda t: objective(t, data)[1], theta)
    assert error < 1e-4 * np.linalg.norm(objective(theta, data)[1])


def test_warns_when_optimiser_fails(league, monkeypatch):
    real_minimize = dc.minimize

    def failing(*args, **kwargs):
        result = real_minimize(*args, **kwargs)
        result.success, result.message = False, "forced failure"
        return result

    monkeypatch.setattr(dc, "minimize", failing)
    with pytest.warns(RuntimeWarning, match="did not converge"):
        fit_dixon_coles(league, pd.Timestamp("2023-06-01"), config=GOALS_ONLY)


def test_negative_rho_adds_draws():
    independent = outcome_table([1.3], [1.1], rho=0.0)
    corrected = outcome_table([1.3], [1.1], rho=-0.1)
    assert corrected["p_d"].iloc[0] > independent["p_d"].iloc[0]


def test_outcome_table_is_consistent():
    table = outcome_table([2.5, 0.5], [0.5, 2.5])
    assert np.allclose(table[["p_h", "p_d", "p_a"]].sum(axis=1), 1.0)
    assert table["p_h"].iloc[0] > 0.7 and table["p_a"].iloc[1] > 0.7
    # clean sheet for home = away scores nothing = Poisson(0; 0.5)
    assert table["cs_h"].iloc[0] == pytest.approx(np.exp(-0.5), abs=1e-6)
    assert table["cs_a"].iloc[1] == pytest.approx(np.exp(-0.5), abs=1e-6)


def test_recovers_known_ratings(league):
    model = fit_dixon_coles(league, league["date"].max() + pd.Timedelta(days=1), config=GOALS_ONLY)
    ratings = model.ratings().set_index("team")

    assert model.home_adv == pytest.approx(HOME_ADV, abs=0.08)
    true_overall = pd.Series({t: TRUE_ATTACK[t] + TRUE_DEFENCE[t] for t in TRUE_ATTACK})
    assert ratings["overall"].corr(true_overall) > 0.95
    assert ratings["overall"].idxmax() == "Strong"
    assert ratings["overall"].idxmin() == "Poor"


def test_uses_only_matches_before_cutoff(league):
    cutoff = pd.Timestamp("2021-01-01")
    before = fit_dixon_coles(league, cutoff, config=GOALS_ONLY)
    truncated = fit_dixon_coles(league[league["date"] < cutoff], cutoff, config=GOALS_ONLY)
    assert np.allclose(before.attack, truncated.attack)
    assert np.allclose(before.defence, truncated.defence)
    assert (before.mu, before.home_adv, before.rho) == pytest.approx((truncated.mu, truncated.home_adv, truncated.rho))


def test_raises_without_history(league):
    with pytest.raises(ValueError, match="no matches"):
        fit_dixon_coles(league, league["date"].min(), config=GOALS_ONLY)


def test_unseen_team_gets_its_prior(league):
    config = DixonColesConfig(xi=0.0, goals_weight=1.0, ridge=2.0, promoted_prior=-0.3)
    model = fit_dixon_coles(league, pd.Timestamp("2023-06-01"), teams=["Newcomer"], promoted=["Newcomer"], config=config)
    ratings = model.ratings().set_index("team")
    assert ratings.loc["Newcomer", "attack"] == pytest.approx(-0.3)
    assert ratings.loc["Newcomer", "defence"] == pytest.approx(-0.3)
    probs = model.predict(["Strong"], ["Newcomer"])
    assert probs["p_h"].iloc[0] > 0.6


def test_unknown_team_raises(league):
    model = fit_dixon_coles(league, pd.Timestamp("2023-06-01"), config=GOALS_ONLY)
    with pytest.raises(KeyError, match="Nobody"):
        model.predict(["Nobody"], ["Strong"])


def test_time_decay_tracks_a_change_in_form(league):
    # The weak side becomes elite in the final season: decay should notice faster than equal weights.
    shifted = league.copy()
    late = shifted["season_start"] == 2022
    shifted.loc[late & (shifted["home"] == "Weak"), "hg"] += 2
    shifted.loc[late & (shifted["away"] == "Weak"), "ag"] += 2
    cutoff = shifted["date"].max() + pd.Timedelta(days=1)
    static = fit_dixon_coles(shifted, cutoff, config=GOALS_ONLY).ratings().set_index("team")
    decayed = fit_dixon_coles(shifted, cutoff, config=DixonColesConfig(xi=0.01, goals_weight=1.0, ridge=0.5, window_days=5000))
    assert decayed.ratings().set_index("team").loc["Weak", "attack"] > static.loc["Weak", "attack"]


def test_blended_targets_mix_goals_and_shots():
    matches = pd.DataFrame({"hg": [2, 0], "ag": [0, 1], "hst": [4, np.nan], "ast": [2, 3]})
    yh, ya = blended_targets(matches, goals_weight=0.5)
    # conversion uses rows with both shot counts: goals 2 / shots 6
    assert yh[0] == pytest.approx(0.5 * 2 + 0.5 * 4 * (2 / 6))
    assert ya[0] == pytest.approx(0.5 * 0 + 0.5 * 2 * (2 / 6))
    assert (yh[1], ya[1]) == (0, 1)  # missing shots -> goals only


def test_blended_targets_goals_only_passthrough():
    matches = pd.DataFrame({"hg": [3], "ag": [1], "hst": [5], "ast": [2]})
    yh, ya = blended_targets(matches, goals_weight=1.0)
    assert (yh[0], ya[0]) == (3, 1)
    no_shots = pd.DataFrame({"hg": [3], "ag": [1], "hst": [0.0], "ast": [0.0]})
    assert blended_targets(no_shots, goals_weight=0.5)[0][0] == 3
