import json

import numpy as np
import pytest

from app.services.calibration import (
    CleanSheetCalibration,
    fit_clean_sheet_calibration,
    load_clean_sheet_calibration,
    logit,
    save_clean_sheet_calibration,
    sigmoid,
)


def sample(rng, n, a, b):
    """Forecasts that are wrong in a known way: the truth is sigmoid(a + b*logit(p))."""
    predicted = rng.uniform(0.05, 0.8, n)
    truth = sigmoid(a + b * logit(predicted))
    return predicted, (rng.uniform(size=n) < truth).astype(float)


def test_recovers_a_known_bias():
    rng = np.random.default_rng(11)
    predicted, happened = sample(rng, 40_000, a=-0.25, b=1.0)  # forecasts run high
    fitted = fit_clean_sheet_calibration(predicted, happened)
    assert fitted.a == pytest.approx(-0.25, abs=0.05)
    assert fitted.b == pytest.approx(1.0, abs=0.05)
    # and it removes the bias it found
    corrected = fitted.apply_many(predicted)
    assert corrected.mean() == pytest.approx(happened.mean(), abs=0.01)
    assert predicted.mean() - happened.mean() > 0.03  # the bias was real


def test_leaves_well_calibrated_forecasts_alone():
    rng = np.random.default_rng(3)
    predicted, happened = sample(rng, 40_000, a=0.0, b=1.0)
    fitted = fit_clean_sheet_calibration(predicted, happened)
    assert fitted.a == pytest.approx(0.0, abs=0.05) and fitted.b == pytest.approx(1.0, abs=0.06)


def test_a_thin_sample_changes_nothing():
    rng = np.random.default_rng(5)
    predicted, happened = sample(rng, 100, a=-1.5, b=1.0)
    fitted = fit_clean_sheet_calibration(predicted, happened)
    assert fitted.is_identity and fitted.n == 100
    assert fitted.apply(0.42) == 0.42


def test_a_wild_sample_is_capped():
    rng = np.random.default_rng(7)
    predicted = rng.uniform(0.05, 0.8, 5_000)
    fitted = fit_clean_sheet_calibration(predicted, np.zeros(5_000))  # nobody ever kept one
    assert fitted.a == pytest.approx(-1.0) and 0.5 <= fitted.b <= 1.5
    assert 0.0 < fitted.apply(0.42) < 0.42


def test_apply_keeps_the_order_and_the_range():
    fitted = CleanSheetCalibration(a=-0.3, b=1.2)
    values = [fitted.apply(p) for p in (0.0, 0.05, 0.3, 0.6, 1.0)]
    assert values == sorted(values)
    assert all(0.0 < v < 1.0 for v in values)


def test_round_trip_through_the_artifact(tmp_path):
    path = tmp_path / "clean_sheet_calibration.json"
    assert load_clean_sheet_calibration(path).is_identity  # missing file: change nothing
    fitted = CleanSheetCalibration(a=-0.2, b=1.1, n=1234, fitted_through="2026-05-24")
    save_clean_sheet_calibration(path, fitted)
    assert load_clean_sheet_calibration(path) == fitted
    assert json.loads(path.read_text(encoding="utf-8"))["fitted_through"] == "2026-05-24"
