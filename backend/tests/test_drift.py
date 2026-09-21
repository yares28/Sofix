"""Telling a club that has changed from a club that had a bad week."""

import numpy as np
import pandas as pd
import pytest

from app.modeling.dixon_coles import DixonColesConfig, fit_dixon_coles
from app.services.drift import DriftSettings, alarms, club_residuals, club_weights, cusum, recent_match_weights
from tests.conftest import simulate_league

CONFIG = DixonColesConfig(xi=0.0, goals_weight=1.0, ridge=0.5, promoted_prior=0.0, window_days=5000)


def test_cusum_ignores_noise_and_accumulates_a_one_sided_miss():
    rng = np.random.default_rng(4)
    noise = rng.normal(0, 1.0, 40)
    up, down = cusum(noise - noise.mean(), slack=0.35)
    assert up < 2.0 and down < 2.0  # symmetric noise: nothing persistent to find

    shifted = np.full(12, 0.8)  # twelve matches of scoring 0.8 more than expected
    up, down = cusum(shifted, slack=0.35)
    assert up > 5.0 and down == 0.0


def test_residuals_are_signed_so_that_positive_is_better_than_expected():
    league = simulate_league(seasons=(2020, 2021), repeats=3)
    model = fit_dixon_coles(league, pd.Timestamp("2022-06-01"), config=CONFIG)
    matches = pd.DataFrame(
        {
            "date": [pd.Timestamp("2022-05-01"), pd.Timestamp("2022-05-08")],
            "home": ["Strong", "Weak"],
            "away": ["Weak", "Strong"],
            "hg": [9, 0],  # a thrashing, then a shut-out
            "ag": [0, 0],
        }
    )
    residuals = club_residuals(model, matches)
    strong_attack = residuals[(residuals["team"] == "Strong") & (residuals["date"] == matches["date"][0])]
    weak_defence = residuals[(residuals["team"] == "Weak") & (residuals["date"] == matches["date"][0])]
    assert strong_attack["attack"].iloc[0] > 5  # scored far more than expected
    assert weak_defence["defence"].iloc[0] < -5  # conceded far more than expected


def test_a_club_that_really_changed_trips_the_test_and_a_quiet_one_does_not():
    league = simulate_league(seasons=(2020, 2021, 2022), repeats=4)
    shifted = league.copy()
    late = shifted["date"] > shifted["date"].max() - pd.Timedelta(days=60)
    shifted.loc[late & (shifted["home"] == "Weak"), "hg"] += 3  # Weak starts scoring for fun
    shifted.loc[late & (shifted["away"] == "Weak"), "ag"] += 3
    cutoff = shifted["date"].max() + pd.Timedelta(days=1)
    model = fit_dixon_coles(shifted, cutoff, config=CONFIG)

    settings = DriftSettings()
    table = alarms(club_residuals(model, shifted[shifted["date"] < cutoff]), settings).set_index("team")
    assert table.loc["Weak", "alarm"]
    assert table.loc["Weak", "attack above"] > settings.threshold  # under-rated in attack, persistently
    assert not table.loc["Mid A", "alarm"] and not table.loc["Mid B", "alarm"]


def test_weights_boost_only_the_alarmed_clubs_recent_matches():
    matches = pd.DataFrame(
        {
            "date": pd.date_range("2026-01-01", periods=6, freq="7D"),
            "home": ["A", "B", "A", "C", "A", "B"],
            "away": ["B", "C", "C", "A", "B", "A"],
            "hg": 1,
            "ag": 1,
        }
    )
    settings = DriftSettings(boost=2.0, boost_matches=2)
    weights = recent_match_weights(matches, {"A": 2.0}, settings)
    assert weights is not None
    assert weights.tolist() == [1.0, 1.0, 1.0, 1.0, 2.0, 2.0]  # A's last two matches only
    assert recent_match_weights(matches, {}, settings) is None


def test_switched_off_settings_never_boost():
    residuals = pd.DataFrame(
        {"team": ["A"] * 12, "date": pd.date_range("2026-01-01", periods=12), "attack": 2.0, "defence": 0.0}
    )
    assert club_weights(residuals, DriftSettings(boost=1.0)) == {}
    assert club_weights(residuals, DriftSettings()) == {"A": 2.0}


def test_boosted_fit_moves_toward_the_recent_matches():
    league = simulate_league(seasons=(2020, 2021, 2022), repeats=4)
    shifted = league.copy()
    late = shifted["date"] > shifted["date"].max() - pd.Timedelta(days=60)
    shifted.loc[late & (shifted["home"] == "Weak"), "hg"] += 3
    shifted.loc[late & (shifted["away"] == "Weak"), "ag"] += 3
    cutoff = shifted["date"].max() + pd.Timedelta(days=1)
    train = shifted[shifted["date"] < cutoff]

    plain = fit_dixon_coles(shifted, cutoff, config=CONFIG)
    weights = recent_match_weights(train, {"Weak": 4.0}, DriftSettings(boost=4.0, boost_matches=10))
    boosted = fit_dixon_coles(shifted, cutoff, config=CONFIG, match_weights=weights)
    rating = lambda model: model.ratings().set_index("team").loc["Weak", "attack"]
    assert rating(boosted) > rating(plain)

    with pytest.raises(ValueError, match="match_weights"):
        fit_dixon_coles(shifted, cutoff, config=CONFIG, match_weights=np.ones(3))
