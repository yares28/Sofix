"""Frozen replay rules: availability, competition independence and week resampling."""

import numpy as np

from app.research.european_validation import comparison, evaluate_football, football_metrics, own_before
from app.research.league_xscore_data import when


def test_own_history_does_not_use_a_resumed_or_unavailable_result_before_lock():
    history = [
        (when("2025-10-20T12:00:00Z"), when("2025-10-23T12:00:00Z"), 100.0),
        (when("2025-10-10T12:00:00Z"), when("2025-10-12T12:00:00Z"), 0.0),
        (when("2025-01-01T12:00:00Z"), when("2025-01-03T12:00:00Z"), 100.0),
    ]
    dec, mean, form, n = own_before(history, when("2025-10-21T14:00:00Z"))
    assert n == 1 and form == 34.0
    assert mean == 40 and dec < 0.12


def test_paired_bootstrap_resamples_whole_weeks_and_is_repeatable():
    actual = np.array([0.0, 100.0, 50.0, 60.0])
    model = actual + 1
    base = actual + 10
    one = comparison(actual, model, base, ["a", "a", "b", "b"])
    assert one == comparison(actual, model, base, ["a", "a", "b", "b"])
    assert one["weeks"] == 2 and one["hi"] < 0 and one["difference"] == -9


def test_football_rps_uses_ordered_home_draw_away_and_perfect_forecast_is_zero():
    probability = np.eye(3)
    result = football_metrics(probability, np.array([0, 1, 2]))
    assert result["rps"] == result["brier"] == 0
    assert football_metrics(probability[::-1], np.array([0, 1, 2]))["rps"] > 0


def test_official_leg_object_is_counted_in_football_subgroups():
    row = {
        "p_h": 0.5,
        "p_d": 0.25,
        "p_a": 0.25,
        "base": [0.4, 0.3, 0.3],
        "plain": [0.4, 0.3, 0.3],
        "hg": 1,
        "ag": 0,
        "week": "2025-W20",
        "date": "2025-05-08T19:00:00Z",
        "lock": "2025-05-06T14:00:00Z",
        "season": 2024,
        "neutral": False,
        "cold": False,
        "phase": "knockout",
        "leg": {"number": 2},
        "cs_h": 0.4,
        "cs_a": 0.3,
        "lam_h": 1.5,
        "lam_a": 1.0,
    }
    assert evaluate_football([row])["subgroups"]["leg2"]["games"] == 1
