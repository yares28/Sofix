"""Keeping Sorare's projections: what a run writes down, what it freezes, and what it refuses to invent."""

from __future__ import annotations

from datetime import UTC, datetime

from sqlalchemy import select

from app.models import SorareForecast
from app.services.timeutil import as_utc
from app.sorare import record
from tests.test_pipeline import db  # noqa: F401  (fixture)
from tests.test_sorare_publish import snapshot

BEFORE = datetime(2026, 10, 8, 9, 0, tzinfo=UTC)  # the gameweek locks 2026-10-09 14:00
AFTER = datetime(2026, 10, 10, 9, 0, tzinfo=UTC)


def test_a_run_writes_down_what_sorare_said(db) -> None:  # noqa: F811
    rows = record.rows(snapshot())
    assert rows, "the gameweek being planned has players"
    assert all(row.games > 0 for row in rows), "a player with no game is not worth a row"
    assert {row.gameweek for row in rows} == {"gw-plan"}
    assert all(row.source == "sorare" for row in rows), "Sorare had published, so its projection is the source"
    assert all(row.projection == 55.0 and row.plays_odds == 0.95 for row in rows)

    written = record.save(db, rows, BEFORE)
    assert written == {"written": len(rows), "frozen": 0, "scored": 0}
    stored = db.scalars(select(SorareForecast)).all()
    assert len(stored) == len(rows)
    # SQLite hands datetimes back without their zone, so the comparison goes through as_utc
    assert as_utc(stored[0].captured_at) == BEFORE and stored[0].actual is None and stored[0].played is None


def test_an_open_gameweek_takes_the_latest_numbers(db) -> None:  # noqa: F811
    record.save(db, record.rows(snapshot()), BEFORE)
    later = snapshot()
    for entry in later["cards"]:
        entry["player"]["nextClassicFixtureProjectedScore"] = 71.0
    again = record.save(db, record.rows(later), BEFORE)
    assert again["written"] and again["frozen"] == 0
    assert {row.projection for row in db.scalars(select(SorareForecast))} == {71.0}


def test_after_the_lock_the_numbers_are_frozen(db) -> None:  # noqa: F811
    record.save(db, record.rows(snapshot()), BEFORE)
    later = snapshot()
    for entry in later["cards"]:
        entry["player"]["nextClassicFixtureProjectedScore"] = 71.0
    after = record.save(db, record.rows(later), AFTER)
    assert after["written"] == 0 and after["frozen"] == len(record.rows(later))
    assert {row.projection for row in db.scalars(select(SorareForecast))} == {55.0}, "what the plan was built on"


def test_a_played_gameweek_fills_in_what_he_scored(db) -> None:  # noqa: F811
    snap = snapshot()
    kept = record.rows(snap, "past")
    assert kept and {row.gameweek for row in kept} == {"gw-past"}
    # Pretend the run before the lock had written these down.
    record.save(db, [row for row in kept], datetime(2026, 9, 17, 9, 0, tzinfo=UTC))
    scored = record.save(db, kept, AFTER, final=True)
    assert scored["scored"] == len(kept) and scored["written"] == 0
    rows = db.scalars(select(SorareForecast)).all()
    assert all(row.played is True and row.actual == 60.0 for row in rows)


def test_a_gameweek_nobody_recorded_stays_a_gap(db) -> None:  # noqa: F811
    """Rebuilding a past gameweek from form would look like a record of Sorare's numbers, and isn't one."""
    result = record.save(db, record.rows(snapshot(), "past"), AFTER, final=True)
    assert result == {"written": 0, "frozen": 0, "scored": 0}
    assert db.scalars(select(SorareForecast)).all() == []


def test_a_replay_never_uses_numbers_published_after_the_lock(db) -> None:  # noqa: F811
    past = record.rows(snapshot(), "past")
    assert all(row.projection is None and row.source == "form" for row in past)


def test_moved_counts_only_players_sorare_has_changed(db) -> None:  # noqa: F811
    first = record.rows(snapshot())
    assert record.moved(db, first) == 0, "nothing stored yet is not a change"
    record.save(db, first, BEFORE)
    assert record.moved(db, record.rows(snapshot())) == 0

    later = snapshot()
    later["cards"][0]["player"]["nextClassicFixtureProjectedScore"] = 55.2  # inside the tolerance
    later["cards"][1]["player"]["nextClassicFixtureProjectedScore"] = 70.0
    later["cards"][2]["player"]["nextClassicFixturePlayingStatusOdds"] = {
        "starterOddsBasisPoints": 1000,
        "substituteOddsBasisPoints": 500,
        "nonPlayingOddsBasisPoints": 8500,
    }
    assert record.moved(db, record.rows(later)) == 2


def test_players_without_a_game_are_left_out(db) -> None:  # noqa: F811
    """A break week is mostly empty: recording a prior for everyone would bury the real numbers."""
    idle = snapshot()
    for entry in idle["cards"]:
        entry["player"]["plan"] = []
    assert record.rows(idle) == []
    assert record.save(db, record.rows(idle)) == {"written": 0, "frozen": 0, "scored": 0}


def test_the_status_says_who_wrote_it_and_remembers_the_cloud(db) -> None:  # noqa: F811
    from app.sorare import publish

    page = {"generatedAt": "2026-10-08T09:00:00+00:00"}
    cloud = publish.with_status(page, where="cloud", moved=0, kept={"rows": 3}, previous=None)
    assert cloud["status"] == {
        "builtAt": "2026-10-08T09:00:00+00:00",
        "where": "cloud",
        "lastCloudAt": "2026-10-08T09:00:00+00:00",
        "moved": 0,
        "kept": {"rows": 3},
    }
    # A later run on this PC must not erase the fact that the cloud once managed it.
    by_hand = publish.with_status(
        {"generatedAt": "2026-10-08T18:00:00+00:00"}, where="pc", moved=4, kept={"rows": 3}, previous=cloud
    )
    assert by_hand["status"]["where"] == "pc"
    assert by_hand["status"]["lastCloudAt"] == "2026-10-08T09:00:00+00:00"
    assert publish.with_status({"generatedAt": "x"}, where="pc", moved=0, kept={}, previous=None)["status"][
        "lastCloudAt"
    ] is None


def test_the_record_summary_counts_what_is_kept(db) -> None:  # noqa: F811
    assert record.summary(db) == {"gameweeks": 0, "rows": 0, "projections": 0, "scored": 0}
    record.save(db, record.rows(snapshot()), BEFORE)
    kept = record.summary(db)
    assert kept["gameweeks"] == 1 and kept["rows"] > 0 and kept["projections"] == kept["rows"] and kept["scored"] == 0
