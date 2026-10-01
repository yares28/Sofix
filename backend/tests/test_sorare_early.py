"""Which early plans a run makes: the ones missing or gone stale, a few at a time, so a run stays well inside its time."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import Any

import pytest

from app.models import ReadModel
from app.sorare import early, projection, publish
from tests.test_pipeline import db  # noqa: F401  (fixture)
from tests.test_sorare_projection import ATL, FCB, RMA, SEV, at, early_snapshot, match

NOW = datetime(2026, 10, 7, 10, tzinfo=UTC)


def rounds(count: int, first: int = 10) -> list[projection.Round]:
    """Rounds 10, 11, ... a week apart, each with a game for Barcelona and one for Sevilla."""
    return [
        projection.Round(
            first + k,
            (
                match(at("2026-10-31") + timedelta(days=7 * k), FCB, RMA),
                match(at("2026-11-01") + timedelta(days=7 * k), SEV, ATL),
            ),
        )
        for k in range(count)
    ]


def keep(db, number: int, age: timedelta, *, start: str | None = None) -> dict[str, Any]:  # noqa: F811
    """A stored early plan for a round, written `age` ago, for the dates `rounds()` gives that round unless told otherwise."""
    first = at("2026-10-31") + timedelta(days=7 * (number - 10))
    window = start or projection.window(first)[0].isoformat()
    payload = {
        "projected": {"round": number, "basedOn": "GW21", "expected": True},
        "gameweek": {"start": window},
        "stored": True,
    }
    db.add(ReadModel(key=f"{publish.AHEAD_PREFIX}{number}", payload=payload, updated_at=NOW - age))
    db.commit()
    return payload


def test_a_round_with_no_early_plan_is_planned_first_then_the_stalest(db) -> None:  # noqa: F811
    keep(db, 10, timedelta(hours=1))  # fresh: left alone
    keep(db, 11, timedelta(hours=9))  # one of the next few and older than six hours
    keep(db, 12, timedelta(hours=8))
    plan, kept = early.choose(db, rounds(4), NOW)  # round 13 has none at all

    assert [r.number for r in plan] == [13, 11, 12], "missing first, then the stalest"
    assert set(kept) == {10}


def test_the_next_few_rounds_are_kept_current_and_the_far_ones_daily(db) -> None:  # noqa: F811
    many = rounds(8)
    for number in range(10, 18):
        keep(db, number, timedelta(hours=10))  # ten hours old
    plan, kept = early.choose(db, many, NOW)
    # The next four are older than their six hours; the rest are not yet a day old.
    assert [r.number for r in plan] == [10, 11, 12, 13]
    assert set(kept) == {14, 15, 16, 17}


def test_at_most_a_few_rounds_are_planned_in_one_run_nearest_first(db) -> None:  # noqa: F811
    plan, kept = early.choose(db, rounds(30), NOW)
    assert [r.number for r in plan] == list(range(10, 10 + early.PER_RUN))
    assert kept == {}


def test_a_round_left_for_a_later_run_still_shows_the_plan_it_already_has(db) -> None:  # noqa: F811
    for number in range(10, 10 + early.PER_RUN + 2):
        keep(db, number, timedelta(days=2))  # every one stale
    plan, kept = early.choose(db, rounds(early.PER_RUN + 2), NOW)
    assert len(plan) == early.PER_RUN
    assert len(kept) == 2, "the two that did not fit keep showing what they have"


def test_a_plan_made_for_other_dates_is_planned_again_instead_of_shown_under_the_round(db) -> None:  # noqa: F811
    keep(db, 10, timedelta(hours=1))  # current, for the dates the calendar holds
    keep(db, 11, timedelta(hours=1), start="2025-11-07T14:00:00+00:00")  # last season's round 11, same number
    plan, kept = early.choose(db, rounds(2), NOW)
    assert [r.number for r in plan] == [11], "a fresh row for other dates counts as no plan at all"
    assert set(kept) == {10}


def test_a_stored_plan_without_its_dates_is_not_trusted(db) -> None:  # noqa: F811
    db.add(ReadModel(key=f"{publish.AHEAD_PREFIX}10", payload={"projected": {"round": 10}}, updated_at=NOW))
    db.commit()
    plan, kept = early.choose(db, rounds(1), NOW)
    assert [r.number for r in plan] == [10] and kept == {}


def test_a_round_that_is_no_longer_early_is_left_out(db) -> None:  # noqa: F811
    keep(db, 9, timedelta(hours=1))  # it has started since
    plan, kept = early.choose(db, rounds(2), NOW)
    assert 9 not in kept and [r.number for r in plan] == [10, 11]


def test_a_plan_is_made_for_what_is_chosen_and_listed_with_the_ones_it_reused(db) -> None:  # noqa: F811
    keep(db, 11, timedelta(hours=1))
    made = early.plan(db, early_snapshot(), rounds(3), runs=4, now=NOW)

    assert [w["projected"]["round"] for w in made.weeks] == [10, 11, 12], "all three are listed, nearest first"
    assert [w["projected"]["round"] for w in made.fresh] == [10, 12], "only two were planned"
    assert next(w for w in made.weeks if w["projected"]["round"] == 11).get("stored") is True


def test_nothing_to_plan_is_no_work(db) -> None:  # noqa: F811
    made = early.plan(db, early_snapshot(), [], runs=4, now=NOW)
    assert made.weeks == [] and made.fresh == []


@pytest.mark.parametrize("naive", [True, False])
def test_a_stored_time_with_or_without_a_zone_is_read_the_same(db, naive: bool) -> None:  # noqa: F811
    stamp = NOW - timedelta(hours=1)
    db.add(
        ReadModel(
            key=f"{publish.AHEAD_PREFIX}10",
            payload={
                "projected": {"round": 10, "expected": True},
                "gameweek": {"start": projection.window(rounds(1)[0].first)[0].isoformat()},
            },
            updated_at=stamp.replace(tzinfo=None) if naive else stamp,
        )
    )
    db.commit()
    plan, kept = early.choose(db, rounds(1), NOW)
    assert plan == [] and set(kept) == {10}
