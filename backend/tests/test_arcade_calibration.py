"""Start chances calibrated against who started, per competition and source (plans/arcade-trust.md step 9)."""

from datetime import UTC, datetime, timedelta

from app.sorare import arcade_outlook

NOW = datetime(2026, 11, 21, 12, tzinfo=UTC)


def cases(n: int, said: float, rate: float, days: int = 80) -> list[tuple[float, float, datetime]]:
    """`n` games where a source said `said` and the player started a `rate` share of them, spread over `days`."""
    # Starts spread evenly through time, so the older games and the newest third say the same.
    return [(said, 1.0 if i % 10 < round(rate * 10) else 0.0, NOW - timedelta(days=days * i / n)) for i in range(n)]


def test_an_overconfident_source_is_brought_down_to_what_happened():
    # The record's own optimism, 20 Nov 2026: its 80-89% band started 73% of the time.
    pairs = cases(300, 0.9, 0.7) + cases(300, 0.2, 0.2)
    fit = arcade_outlook.calibrate(pairs)
    assert fit is not None
    assert abs(arcade_outlook.apply(fit["points"], 0.9) - 0.7) < 0.05
    assert abs(arcade_outlook.apply(fit["points"], 0.2) - 0.2) < 0.05
    assert fit["n"] == 600 and fit["heldOut"] >= 30
    assert fit["brierCalibrated"] < fit["brierRaw"]


def test_no_correction_under_200_cases_or_when_it_does_not_beat_the_raw_number_on_held_out_games():
    assert arcade_outlook.calibrate(cases(150, 0.9, 0.7)) is None  # too few
    honest = cases(300, 0.9, 0.9) + cases(300, 0.2, 0.2)
    assert arcade_outlook.calibrate(honest) is None  # already right: nothing to gain


def test_apply_interpolates_between_points_and_keeps_zero_and_one_ends():
    points = [[0.0, 0.0], [0.5, 0.4], [1.0, 0.9]]
    assert arcade_outlook.apply(points, 0.25) == 0.2
    assert arcade_outlook.apply(points, 1.0) == 0.9
    assert arcade_outlook.apply(points, 0.0) == 0.0


def test_a_correction_never_makes_a_start_certain():
    pairs = cases(300, 0.9, 1.0) + cases(300, 0.2, 0.0)
    fit = arcade_outlook.calibrate(pairs)
    assert fit is not None
    assert arcade_outlook.apply(fit["points"], 0.9) == 0.98
    assert arcade_outlook.apply(fit["points"], 0.2) == 0.02
