"""Serving and historical replay must use the same conservative Conference mixture."""

import numpy as np
import pandas as pd
import pytest

from app.modeling.dixon_coles import outcome_table
from app.research.league_xscore_data import when
from app.services.conference_forecast import ConferenceForecast


def test_score_mixture_is_consistent_and_excludes_unavailable_or_other_cup_results():
    history = pd.DataFrame(
        [
            {"competition": "CONF", "date": "2026-01-01T18:00Z", "availableAt": "2026-01-03T18:00Z", "hg": 2, "ag": 1},
            {
                "competition": "CONF",
                "date": "2026-01-08T18:00Z",
                "availableAt": "2026-01-12T18:00Z",
                "hg": 99,
                "ag": 99,
            },
            {"competition": "CL", "date": "2026-01-01T18:00Z", "availableAt": "2026-01-03T18:00Z", "hg": 99, "ag": 99},
        ]
    )

    class Club:
        def predict(self, home, away, *, neutral):
            return outcome_table([3.0] * len(home), [0.5] * len(home), 0, 10)

    mixed = ConferenceForecast(Club(), history, when("2026-01-10T18:00Z"))
    result = mixed.predict(["A", "B"], ["B", "A"], neutral=[False, True])
    club = Club().predict(["A", "B"], ["B", "A"], neutral=[False, True])
    average = outcome_table([2, 1.5], [1, 1.5], 0, 10)
    for name in ("p_h", "p_d", "p_a", "cs_h", "cs_a", "lam_h", "lam_a", "p_00"):
        np.testing.assert_allclose(result[name], 0.75 * club[name] + 0.25 * average[name])
    assert result.loc[0, "lam_h"] == 2.75
    assert result[["p_h", "p_d", "p_a"]].sum(axis=1).tolist() == pytest.approx([1, 1])


def test_absent_conference_history_is_not_silently_replaced_with_laliga():
    history = pd.DataFrame(
        [{"competition": "CL", "date": "2026-01-01T18:00Z", "availableAt": "2026-01-03T18:00Z", "hg": 2, "ag": 1}]
    )
    with pytest.raises(ValueError, match="Conference history"):
        ConferenceForecast(None, history, when("2026-01-10T18:00Z"))
