"""UEFA model prerequisites: actual venue, known regulation targets and pre-lock history."""

from datetime import UTC, datetime

import numpy as np
import pandas as pd
import pytest
from scipy.optimize import check_grad

from app.research.european_model import EuropeanFitData, fit, objective


def history():
    rows = []
    for i in range(40):
        home, away = ("A", "B") if i % 2 else ("B", "A")
        rows.append(
            {
                "id": str(i),
                "date": pd.Timestamp("2025-01-01", tz="UTC") + pd.Timedelta(days=i),
                "availableAt": pd.Timestamp("2025-01-01T23:00Z") + pd.Timedelta(days=i),
                "home": home,
                "away": away,
                "hg": i % 4,
                "ag": (i + 1) % 3,
                "neutral": i % 3 == 0,
            }
        )
    return pd.DataFrame(rows)


def test_neutral_fit_gradient_accounts_for_only_ordinary_home_games():
    data = EuropeanFitData(
        2,
        np.array([0, 1, 0]),
        np.array([1, 0, 1]),
        np.array([1.0, 0.8, 0.9]),
        np.array([2.0, 0.0, 1.0]),
        np.array([0.0, 1.0, 1.0]),
        np.array([1.0, 0.0, 1.0]),
        1.0,
    )
    theta = np.array([0.2, 0.3, 0.1, -0.1, -0.2, 0.2])
    error = check_grad(lambda x: objective(x, data)[0], lambda x: objective(x, data)[1], theta)
    assert error < 1e-5


def test_neutral_predictions_are_symmetric_when_the_sides_swap():
    model = fit(history(), datetime(2025, 3, 1, tzinfo=UTC), teams=["A", "B", "Cold"])
    left = model.predict(["A"], ["B"], neutral=[True]).iloc[0]
    right = model.predict(["B"], ["A"], neutral=[True]).iloc[0]
    assert left["lam_h"] == pytest.approx(right["lam_a"])
    assert left["p_h"] == pytest.approx(right["p_a"])
    assert sum(left[k] for k in ("p_h", "p_d", "p_a")) == pytest.approx(1.0)
    assert np.isfinite(model.predict(["Cold"], ["A"], neutral=[False]).to_numpy()).all()


def test_results_at_or_after_the_lock_or_not_yet_available_never_affect_fit():
    data = history()
    cutoff = datetime(2025, 2, 1, tzinfo=UTC)
    first = fit(data, cutoff, teams=["A", "B"])
    late = data["availableAt"] >= pd.Timestamp(cutoff)
    data.loc[late, "hg"] = 30
    data.loc[late, "ag"] = 25
    second = fit(data, cutoff, teams=["A", "B"])
    assert first.predict(["A"], ["B"], neutral=[False]).to_numpy() == pytest.approx(
        second.predict(["A"], ["B"], neutral=[False]).to_numpy()
    )


@pytest.mark.parametrize(
    "field,value", [("neutral", None), ("neutral", "false"), ("hg", None), ("hg", -1), ("ag", 0.5)]
)
def test_unknown_venue_or_regulation_result_blocks_model_fitting(field, value):
    data = history()
    data[field] = data[field].astype(object)
    data.loc[0, field] = value
    with pytest.raises(ValueError):
        fit(data, datetime(2025, 3, 1, tzinfo=UTC))


def test_duplicate_games_and_naive_availability_are_rejected():
    data = history()
    with pytest.raises(ValueError, match="identity"):
        fit(pd.concat([data, data.iloc[:1]]), datetime(2025, 3, 1, tzinfo=UTC))
    data["availableAt"] = data["availableAt"].dt.tz_localize(None)
    with pytest.raises(ValueError, match="UTC|timezone"):
        fit(data, datetime(2025, 3, 1, tzinfo=UTC))


def test_neutral_context_must_be_explicit_for_each_predicted_game():
    model = fit(history(), datetime(2025, 3, 1, tzinfo=UTC))
    with pytest.raises(ValueError, match="venue"):
        model.predict(["A"], ["B"], neutral=[None])
    with pytest.raises(ValueError, match="venue"):
        model.predict(["A", "B"], ["B", "A"], neutral=[False])


def test_booleans_are_not_regulation_goals_and_results_cannot_arrive_before_kickoff():
    data = history()
    data["hg"] = data["hg"].astype(object)
    data.loc[0, "hg"] = True
    with pytest.raises(ValueError, match="goals"):
        fit(data, datetime(2025, 3, 1, tzinfo=UTC))
    data = history()
    data.loc[0, "availableAt"] = data.loc[0, "date"] - pd.Timedelta(hours=1)
    with pytest.raises(ValueError, match="availability"):
        fit(data, datetime(2025, 3, 1, tzinfo=UTC))
