"""Reading a finished match against its forecast: surprise, performance, and the verdict."""

import numpy as np
import pandas as pd
import pytest

from app.services.postmortem import (
    classify,
    league_conversion,
    outcome_points,
    review_rows,
    rps_from,
    surprise_percentile,
)


def test_points_and_rps_agree_with_the_scoreline():
    assert outcome_points(np.array([2, 1, 0]), np.array([0, 1, 3])).tolist() == [3, 1, 0]
    certain_win = rps_from(np.array([1.0]), np.array([0.0]), np.array([0.0]), np.array([3]))
    assert certain_win[0] == pytest.approx(0.0)
    certain_win_but_lost = rps_from(np.array([1.0]), np.array([0.0]), np.array([0.0]), np.array([0]))
    assert certain_win_but_lost[0] == pytest.approx(1.0)


def test_surprise_is_a_share_of_the_forecasts_own_distribution():
    # A near coin-flip: nothing that happens is surprising, and the three shares cover everything.
    p = (np.array([0.4]), np.array([0.3]), np.array([0.3]))
    shares = [surprise_percentile(*p, np.array([points]))[0] for points in (3, 1, 0)]
    assert all(0 < s <= 1 for s in shares)
    assert max(shares) == pytest.approx(1.0)  # the least surprising result is never "unlikely"

    # A heavy favourite losing is rare by the forecast's own reckoning; winning is not.
    favourite = (np.array([0.85]), np.array([0.10]), np.array([0.05]))
    assert surprise_percentile(*favourite, np.array([0]))[0] == pytest.approx(0.05, abs=0.01)
    assert surprise_percentile(*favourite, np.array([3]))[0] == pytest.approx(1.0)


def test_classify_separates_bad_luck_from_a_bad_rating():
    surprise = np.array([0.5, 0.05, 0.05, 0.05, 0.05])
    gap = np.array([0.0, 0.1, -1.4, -1.4, 0.0])
    reds = np.array([False, False, False, True, False])
    shots = np.array([True, True, True, True, False])
    assert classify(surprise, gap, reds, shots).tolist() == [
        "as forecast",  # the result was within what the forecast allowed for
        "variance",  # surprising, but the club played as forecast
        "evidence",  # surprising, and outplayed on shots too
        "variance",  # same, but a red card explains the match
        "data",  # no shot counts: not judged
    ]


def test_league_conversion_ignores_matches_without_shots():
    matches = pd.DataFrame({"hg": [2, 1], "ag": [1, 1], "hst": [4, np.nan], "ast": [2, 3]})
    assert league_conversion(matches) == pytest.approx(3 / 6)
    assert league_conversion(pd.DataFrame({"hg": [1], "ag": [0], "hst": [np.nan], "ast": [np.nan]})) == 0.0


def test_review_rows_explains_an_easy_game_that_was_lost():
    rows = pd.DataFrame(
        {
            "p_win": [0.70, 0.70],
            "p_draw": [0.20, 0.20],
            "p_loss": [0.10, 0.10],
            "xg_for": [1.9, 1.9],
            "goals_for": [0, 0],
            "goals_against": [1, 3],
            "shots_on_target": [6, 1],  # created as forecast / never turned up
            "red_cards": [False, False],
        }
    )
    reviewed = review_rows(rows, conversion=0.32)

    assert reviewed["points"].tolist() == [0, 0]
    assert reviewed["surprise"].round(2).tolist() == [0.10, 0.10]  # the forecast gave this one game in ten
    assert reviewed["verdict"].tolist() == ["variance", "evidence"]
    assert "finishing and keeping, not the rating" in reviewed["note"].iloc[0]
    assert "a sign the rating is off" in reviewed["note"].iloc[1]
    assert reviewed["performance_gap"].iloc[0] == pytest.approx(6 * 0.32 - 1.9)
