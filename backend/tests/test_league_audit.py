"""The league figures of the Audit page (plans/xscore.md P9 X5d)."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

import pytest

from app.sorare import league_audit as audit
from app.sorare.league_audit import Case

START = datetime(2026, 8, 15, tzinfo=UTC)


def week(n: int, rows: list[tuple[str, str, float, float]]) -> list[Case]:
    return [
        Case(f"w{n}", START + timedelta(days=7 * n, hours=i), who, pos, said, score)
        for i, (who, pos, said, score) in enumerate(rows)
    ]


def test_a_week_counts_how_often_the_higher_number_scored_more_within_a_position_and_leaves_thin_weeks_out() -> None:
    rows = [
        (f"p{i}", "DEF", float(i), float(i) if i < 12 else 0.0) for i in range(14)
    ]  # the order is right except the two last
    out = audit.weekly_pairs(week(0, rows), floor=50)
    assert len(out) == 1 and out[0]["pairs"] == 91 - 3  # the three pairs among the players who scored 0 tie
    assert out[0]["rate"] == pytest.approx(66 / 88)  # the two who scored 0 are above eleven players who scored more
    assert audit.weekly_pairs(week(0, rows), floor=500) == []
    # a pair of two positions is never compared
    mixed = week(0, [("a", "DEF", 1.0, 1.0), ("b", "FWD", 2.0, 0.0)])
    assert audit.weekly_pairs(mixed, floor=0) == []


def test_the_misses_are_counted_in_bins_of_five_points_and_the_shares_within_a_band_follow() -> None:
    cases = week(0, [(f"p{i}", "MID", 50.0, 50.0 + d) for i, d in enumerate([0, 3, -6, 12, -20, 70, -70])])
    h = audit.miss_histogram(cases)
    assert h["n"] == 7 and sum(h["counts"]) == 7 and len(h["counts"]) == 28 and h["step"] == 3.5
    assert sum(h["counts"][12:16]) == 3  # the starts within 7 points are the four bars in the middle
    assert h["within7"] == pytest.approx(3 / 7, abs=1e-3) and h["within15"] == pytest.approx(4 / 7, abs=1e-3)
    assert h["counts"][0] == 1 and h["counts"][-1] == 1  # the two far misses are drawn in the end bins


def test_a_calibration_has_groups_of_what_was_said_and_how_often_it_happened_and_needs_enough_cases() -> None:
    said = [i / 200 for i in range(200)]
    happened = [i % 2 == 0 and v > 0.5 for i, v in enumerate(said)]
    groups = audit.calibration(said, happened, bins=4)
    assert [g["n"] for g in groups] == [50, 50, 50, 50]
    assert groups[0]["said"] < groups[-1]["said"] and groups[0]["happened"] == 0
    assert audit.calibration(said[:50], happened[:50]) == []


def test_the_share_within_a_band_is_pooled_over_positions_by_their_games() -> None:
    blocks = [
        {"new": {"games": 100, "within": {"7": 0.2}}},
        {"new": {"games": 300, "within": {"7": 0.4}}},
        {"new": None},
    ]
    assert audit.pooled_within(blocks, "new") == pytest.approx(0.35)
    assert audit.pooled_within(blocks, "sorare") is None
