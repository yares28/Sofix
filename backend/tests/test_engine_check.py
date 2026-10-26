"""The score engine's ruler (plans/score-engine.md §5, E0): every number scored the same way on the same starts."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

import pytest

from app.jobs import engine_check
from app.jobs.engine_check import Said

DAY = datetime(2026, 10, 3, 18, tzinfo=UTC)


def said(
    model: str, i: int, said_: float, score: float, *, pos: str = "MID", p: float | None = None, hit: bool = False
) -> Said:
    return Said(
        model=model,
        player=f"p{i % 20}",
        pos=pos,
        date=DAY + timedelta(days=7 * (i // 20), hours=i % 20),
        week=f"w{i // 20}",
        score=score,
        said=said_,
        p_decisive=p,
        decisive=hit,
    )


def test_each_number_gets_its_misses_its_share_within_each_distance_and_its_lean() -> None:
    rows = [said("shipped", i, 50.0, 50.0 + (5 if i % 2 else -10)) for i in range(40)]
    block = engine_check.rulers(rows)["MID"]["shipped"]
    assert block["n"] == 40
    assert block["mae"] == pytest.approx(7.5)
    assert block["within"]["7"] == pytest.approx(0.5) and block["within"]["10"] == pytest.approx(1.0)
    assert block["bias"] == pytest.approx(2.5)  # it said 50, they scored 47.5 on average: it leans high


def test_a_closer_number_shows_a_difference_below_zero_against_the_shipped_one() -> None:
    rows = []
    for i in range(200):
        score = 40.0 + (i * 7) % 30
        rows += [said("shipped", i, 55.0, score), said("engine", i, score + (2 if i % 2 else -2), score)]
    diff = engine_check.rulers(rows)["MID"]["engine"]["diff"]["absolute"]
    assert diff["diff"] < 0 and diff["hi"] < 0


def test_the_chance_of_a_decisive_action_is_checked_band_by_band() -> None:
    rows = [said("shipped", i, 50.0, 50.0, p=0.15, hit=i % 10 < 3) for i in range(100)]  # said 15%, 30% happened
    bands = engine_check.rulers(rows)["MID"]["shipped"]["bands"]
    band = next(b for b in bands if b["n"])
    assert band["said"] == pytest.approx(0.15) and band["happened"] == pytest.approx(0.30) and band["n"] == 100


def test_the_table_names_each_number_and_says_how_many_starts_it_is_over() -> None:
    rows = [said(m, i, 50.0, 48.0, pos="FWD") for m in ("shipped", "sorare") for i in range(30)]
    text = engine_check.render(engine_check.rulers(rows))
    assert "FWD" in text and "shipped" in text and "sorare" in text and "| 30 |" in text
