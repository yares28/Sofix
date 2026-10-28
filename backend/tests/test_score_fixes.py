"""Sofix's score corrected from the record only when the evidence is clear (app/sorare/score_fixes.py)."""

from __future__ import annotations

import numpy as np

from app.sorare.score_fixes import MIN_CASES, ScoreFix, measure


def cases(slope: float, n: int = 1200, weeks: int = 6, noise: float = 17.0, seed: int = 1):
    rng = np.random.default_rng(seed)
    x = rng.uniform(30, 75, n)
    y = 50 + slope * (x - 50) + rng.normal(0, noise, n)
    return [(f"w{i % weeks}", float(a), float(b)) for i, (a, b) in enumerate(zip(x, y, strict=True))]


def test_a_flat_number_is_stretched_when_the_record_clearly_says_so():
    fix = measure(cases(1.4))
    assert fix.on and fix.lo > 1
    assert fix.apply(70.0) > 72 and fix.apply(35.0) < 33  # the ends move apart
    assert fix.fixed_error is not None and fix.plain_error is not None and fix.fixed_error < fix.plain_error
    assert 15 < (fix.spread or 0) < 19


def test_a_right_number_is_left_alone():
    fix = measure(cases(1.0))
    assert not fix.on and fix.apply(70.0) == 70.0
    assert fix.lo < 1 < fix.hi


def test_too_few_cases_measure_nothing():
    fix = measure(cases(1.6, n=MIN_CASES - 1))
    assert fix == ScoreFix(n=MIN_CASES - 1) and fix.spread is None


def test_a_stretched_number_stays_a_sorare_score():
    fix = ScoreFix(a=-30.0, b=1.6, on=True)
    assert fix.apply(10.0) == 0.0 and fix.apply(90.0) == 100.0
