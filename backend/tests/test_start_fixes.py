"""Start chances corrected from the record (plans/xscore.md X8): said against happened, per source and band, from the first checked case."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

import pytest

from app.models import PlayerGame, ReadModel
from app.sorare import ff_use, start_fixes, starts
from app.sorare.forecast import GameStart, PlayerWeek, forecast
from app.sorare.start_fixes import MIN_CASES, StartFixes
from tests.test_pipeline import db  # noqa: F401  (fixture)

NOW = datetime(2026, 10, 13, 12, tzinfo=UTC)


def cases(source: str, said: float, n: int, started: int) -> list[tuple[str, float, bool]]:
    return [(source, said, i < started) for i in range(n)]


@pytest.mark.parametrize("started", [0, 1])
def test_the_first_case_changes_its_band_without_a_minimum(started):
    fixes = StartFixes(cases("futbolfantasy", 0.7, 1, started))
    assert fixes.apply("futbolfantasy", 0.7) == float(started)
    assert fixes.table()["futbolfantasy"][0]["n"] == 1
    assert fixes.table()["futbolfantasy"][0]["used"] is True
    assert fixes.apply("sorare", 0.7) == 0.7
    assert fixes.apply("futbolfantasy", 0.3) == 0.3


def test_neighbouring_bands_keep_their_own_observed_rates_without_pooling():
    fixes = StartFixes(cases("sofix", 0.7, 2, 1) + cases("sofix", 0.8, 1, 1))
    assert fixes.apply("sofix", 0.7) == 0.5
    assert fixes.apply("sofix", 0.8) == 1.0
    assert [r["n"] for r in fixes.table()["sofix"]] == [2, 1]


def test_first_case_corrections_ignore_future_cancelled_unknown_and_count_explicit_dnp(db):  # noqa: F811
    for player, status, played, started, date in [
        ("future", "FINAL", True, True, NOW + timedelta(days=1)),
        ("cancelled", "CANCELLED", False, False, NOW),
        ("unknown", "REVIEWING", True, None, NOW),
        ("dnp", "DID_NOT_PLAY", False, None, NOW),
    ]:
        db.add(
            PlayerGame(
                player=player,
                game_id="g",
                date=date,
                competition="laliga-es",
                status=status,
                played=played,
                started=started,
                sofix_start=0.7,
                said_at=NOW - timedelta(days=1),
            )
        )
    db.commit()
    assert start_fixes.cases(db, now=NOW) == [("sofix", 0.7, False)]


def test_a_chance_inside_the_band_keeps_its_place_and_stays_between_0_and_1():
    fixes = StartFixes(cases("sofix", 0.7, 100, 86) + cases("sofix", 1.0, 100, 90))
    assert fixes.apply("sofix", 0.68) == pytest.approx(0.84)  # the same 16 points up
    assert fixes.apply("sofix", 1.0) == pytest.approx(0.9)
    low = StartFixes(cases("sofix", 0.05, 100, 0))
    assert low.apply("sofix", 0.05) == 0.0


def test_the_table_lists_every_group_with_its_range_and_cases_and_says_which_are_used():
    table = StartFixes(cases("futbolfantasy", 0.7, 100, 86) + cases("futbolfantasy", 0.8, 40, 36)).table()[
        "futbolfantasy"
    ]
    assert table == [
        {"from": 0.7, "to": 0.7, "said": 0.7, "was": 0.86, "n": 100, "used": True},
        {"from": 0.8, "to": 0.8, "said": 0.8, "was": 0.9, "n": 40, "used": True},
    ]


def test_cases_come_from_the_game_rows_and_the_older_record_without_counting_a_game_twice(db):  # noqa: F811
    lock = NOW - timedelta(days=3)
    for i in range(3):
        db.add(
            PlayerGame(
                player=f"p{i}", game_id=f"g{i}", date=NOW - timedelta(days=2), competition="laliga-es",
                status="REVIEWING", played=True, started=i == 0, ff_start=0.7, said_at=lock,
            )
        )  # fmt: skip
    db.add(
        PlayerGame(
            player="late",
            game_id="gl",
            date=NOW + timedelta(days=2),
            competition="laliga-es",
            status="PENDING",
            started=False,
            ff_start=0.7,
            said_at=lock,
        )
    )
    db.add(
        ReadModel(
            key=starts.START_KEY,
            payload={
                "weeks": {
                    "gw": {
                        "players": {
                            "p0": {"games": {"g0": {"futbolfantasy": {"chance": 0.7}, "sorare": {"chance": 0.6}, "started": True}}},
                            "old": {"games": {"g9": {"futbolfantasy": {"chance": 0.5}, "sofix": {"chance": 0.4}, "started": False}}},
                        }
                    }
                }
            },
            updated_at=NOW,
        )
    )  # fmt: skip
    db.commit()
    got = sorted(start_fixes.cases(db))
    assert got == sorted(
        [("futbolfantasy", 0.7, True), ("futbolfantasy", 0.7, False), ("futbolfantasy", 0.7, False), ("futbolfantasy", 0.5, False), ("sofix", 0.4, False), ("sorare", 0.6, True)]
    )  # fmt: skip


def test_futbol_fantasys_number_is_corrected_where_it_is_read_and_the_raw_one_is_kept():
    fixes = StartFixes(cases("futbolfantasy", 0.7, 100, 86))
    told = GameStart("g1", 0.7)
    fixed = ff_use.corrected(told, fixes)
    assert (fixed.p_start, fixed.said) == (pytest.approx(0.86), 0.7)
    out = GameStart("g1", 0.0, out=True)
    assert ff_use.corrected(out, fixes).p_start == 0.0, "out is out: nothing is corrected"


def test_the_expected_score_is_made_from_the_corrected_chance_but_the_page_lists_what_the_site_said():
    fixes = StartFixes(cases("futbolfantasy", 0.7, 100, 86))
    week = PlayerWeek(
        games=1,
        projection=50.0,
        pos="MID",
        game_ids=["g1"],
        game_starts=[ff_use.corrected(GameStart("g1", 0.7), fixes)],
    )
    made = forecast(week)
    assert made.p_start == pytest.approx(0.86)
    assert made.by_source["futbolfantasy"] == 0.7
    assert MIN_CASES == 1
