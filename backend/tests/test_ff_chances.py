"""Futbol Fantasy's start chance for every player, kept at the lock and at the last reading before kick-off (plans/xscore.md P9 X2b; roadmap 10.2b)."""

# ruff: noqa: F811  (the `db` fixture is used by importing it)
from __future__ import annotations

import copy
from datetime import UTC, datetime, timedelta
from typing import Any

from app.models import ReadModel
from app.sorare import ff_chances
from tests.test_pipeline import db  # noqa: F401  (fixture)

LOCK = datetime(2026, 10, 9, 14, tzinfo=UTC)
WEEK = {
    "slug": "gw-plan",
    "start": "2026-10-09T14:00:00+00:00",
    "end": "2026-10-13T13:59:00+00:00",
    "lock": LOCK.isoformat(),
}


def side(club: str, *, xi: dict[str, float], alt: dict[str, float], absent: list[tuple[str, str]]) -> dict[str, Any]:
    return {
        "name": f"{club} FC",
        "club": club,
        "formation": "4-2-3-1",
        "published": True,
        "squad": False,
        "rows": [
            {
                "line": "MID",
                "players": [{"id": pid, "name": f"P{pid}", "p": p, "x": 50, "y": 50} for pid, p in xi.items()],
            }
        ],
        "alternatives": [{"id": pid, "name": f"P{pid}", "p": p} for pid, p in alt.items()],
        "absent": [{"name": name, "kind": kind} for name, kind in absent],
    }


def page(read: datetime, *, p: float = 0.8, kickoff: datetime | None = None, match_id: int = 1) -> dict[str, Any]:
    when = kickoff or LOCK + timedelta(hours=5)
    return {
        "readAt": read.isoformat(),
        "cards": [{"slug": "the-owners-card"}],
        "matches": [
            {
                "id": match_id,
                "round": 8,
                "kickoff": when.isoformat(),
                "readAt": read.isoformat(),
                "home": side("MAL", xi={"10": p, "11": 0.95}, alt={"12": 0.3}, absent=[("Julen", "out")]),
                "away": side("ESP", xi={"20": 0.9}, alt={}, absent=[]),
            }
        ],
    }


def kept(db: Any) -> dict[str, Any]:
    row = db.get(ReadModel, ff_chances.KEY)
    assert row is not None
    return dict(row.payload)


def test_each_player_is_kept_with_his_chance_whether_in_the_eleven_or_an_alternative_and_the_absent_by_name() -> None:
    compact = ff_chances.compact(page(LOCK - timedelta(hours=20)))

    home = compact["1"]["home"]
    assert home["club"] == "MAL" and home["formation"] == "4-2-3-1" and home["published"] is True
    assert home["players"] == {
        "10": {"n": "P10", "p": 0.8, "xi": True, "line": "MID", "kind": None},
        "11": {"n": "P11", "p": 0.95, "xi": True, "line": "MID", "kind": None},
        "12": {"n": "P12", "p": 0.3, "xi": False, "line": None, "kind": None},
    }
    assert home["absent"] == [["Julen", "out"]]
    assert compact["1"]["round"] == 8 and compact["1"]["kickoff"].startswith("2026-10-09T19")
    assert "the-owners-card" not in str(compact)  # the owner's cards are not part of it


def test_before_the_lock_both_readings_follow_the_site_and_the_second_run_replaces_the_first(db: Any) -> None:
    ff_chances.save(db, page(LOCK - timedelta(hours=20), p=0.8), [WEEK], LOCK - timedelta(hours=20))
    ff_chances.save(db, page(LOCK - timedelta(hours=3), p=0.6), [WEEK], LOCK - timedelta(hours=3))

    match = kept(db)["matches"]["1"]
    assert match["gw"] == "gw-plan" and match["atLock"]["home"]["players"]["10"]["p"] == 0.6
    assert match["last"]["home"]["players"]["10"]["p"] == 0.6
    assert match["last"]["at"] == (LOCK - timedelta(hours=3)).isoformat()


def test_after_the_lock_the_reading_at_the_lock_stays_and_the_last_reading_goes_on_until_the_kick_off(db: Any) -> None:
    ff_chances.save(db, page(LOCK - timedelta(hours=3), p=0.6), [WEEK], LOCK - timedelta(hours=3))
    ff_chances.save(
        db, page(LOCK + timedelta(hours=2), p=0.2), [WEEK], LOCK + timedelta(hours=2)
    )  # news after the lock

    match = kept(db)["matches"]["1"]
    assert match["atLock"]["home"]["players"]["10"]["p"] == 0.6  # what a manager could see when he set his lineup
    assert match["last"]["home"]["players"]["10"]["p"] == 0.2


def test_after_the_kick_off_nothing_changes_and_a_match_first_seen_then_is_not_made_up(db: Any) -> None:
    kickoff = LOCK + timedelta(hours=5)
    ff_chances.save(
        db, page(kickoff - timedelta(hours=1), p=0.7, kickoff=kickoff), [WEEK], kickoff - timedelta(hours=1)
    )
    before = copy.deepcopy(kept(db))

    done = ff_chances.save(
        db, page(kickoff + timedelta(minutes=5), p=0.1, kickoff=kickoff), [WEEK], kickoff + timedelta(minutes=5)
    )
    late = ff_chances.save(
        db,
        page(kickoff + timedelta(hours=1), kickoff=kickoff - timedelta(days=1), match_id=2),
        [WEEK],
        kickoff + timedelta(hours=1),
    )

    assert kept(db) == before
    assert done == {"written": 0, "frozen": 1} and late == {"written": 0, "frozen": 1}


def test_a_match_outside_the_planned_gameweek_has_only_its_last_reading(db: Any) -> None:
    later = datetime.fromisoformat(WEEK["end"]) + timedelta(days=3)
    ff_chances.save(db, page(LOCK - timedelta(hours=3), kickoff=later), [WEEK], LOCK - timedelta(hours=3))

    match = kept(db)["matches"]["1"]
    assert "last" in match and "atLock" not in match and match["gw"] is None


def test_without_a_gameweek_the_last_reading_is_still_kept(db: Any) -> None:
    ff_chances.save(db, page(LOCK - timedelta(hours=3)), None, LOCK - timedelta(hours=3))

    assert "last" in kept(db)["matches"]["1"] and "atLock" not in kept(db)["matches"]["1"]


# ------------------------------------------------------------------------------------------------ in the refresh


def _step(monkeypatch: Any, built: dict[str, Any]) -> Any:
    """The Sorare step's lineups publisher with everything that reads a site stood in for: it is handed `built` as the page."""
    from app.jobs import sorare as job

    monkeypatch.setattr(job.sorare_publish, "read_cards", lambda cards: ([], None))
    monkeypatch.setattr(job.ff_lineups, "load_memory", lambda db: job.ff_lineups.Memory())
    monkeypatch.setattr(job.ff_lineups, "read_squads", lambda memory, feed, at: (memory, None))
    monkeypatch.setattr(job.ff_lineups, "remember", lambda positions, feed, lineups: {})
    monkeypatch.setattr(job.ff_lineups, "payload", lambda *args, **kwargs: built)
    monkeypatch.setattr(job.ff_lineups, "save_memory", lambda db, memory, at: None)
    return job


def test_the_refresh_keeps_every_players_chance_beside_the_lineups_page(db: Any, monkeypatch: Any) -> None:
    read = LOCK - timedelta(hours=3)
    built = page(read)
    job = _step(monkeypatch, built)
    failed: dict[str, str] = {}

    out = job.publish_lineups(db, failed, {"cards": [], "gameweeks": [WEEK]}, object(), None, read, write=True)

    assert failed == {} and out["matches"] == 1 and out["chances"] == {"written": 1, "frozen": 0}
    assert db.get(ReadModel, "lineups") is not None
    assert kept(db)["matches"]["1"]["atLock"]["home"]["players"]["10"]["p"] == 0.8


def test_a_dry_run_keeps_nothing(db: Any, monkeypatch: Any) -> None:
    job = _step(monkeypatch, page(LOCK - timedelta(hours=3)))

    out = job.publish_lineups(
        db, {}, {"cards": [], "gameweeks": [WEEK]}, object(), None, LOCK - timedelta(hours=3), write=False
    )

    assert "chances" not in out and db.get(ReadModel, ff_chances.KEY) is None


def test_if_keeping_the_chances_fails_the_lineups_page_is_still_published(db: Any, monkeypatch: Any) -> None:
    job = _step(monkeypatch, page(LOCK - timedelta(hours=3)))

    def broken(*args: Any, **kwargs: Any) -> dict[str, int]:
        raise RuntimeError("the read model is unwritable")

    monkeypatch.setattr(job.ff_chances, "save", broken)
    failed: dict[str, str] = {}

    out = job.publish_lineups(
        db, failed, {"cards": [], "gameweeks": [WEEK]}, object(), None, LOCK - timedelta(hours=3), write=True
    )

    assert "ff chances" in failed and out["matches"] == 1 and out["chances"] == {}
    assert db.get(ReadModel, "lineups") is not None


def test_a_match_in_a_later_gameweek_gets_its_reading_at_that_gameweeks_lock_before_it_is_the_planned_one(
    db: Any,
) -> None:
    # Round 8 belongs to the gameweek after the one being planned: the snapshot lists every gameweek, so the reading at its lock is kept from now.
    next_week = {
        "slug": "gw-next",
        "start": "2026-10-16T14:00:00+00:00",
        "end": "2026-10-20T13:59:00+00:00",
        "lock": "2026-10-16T14:00:00+00:00",
    }
    kickoff = datetime(2026, 10, 16, 19, tzinfo=UTC)
    now = LOCK - timedelta(days=2)

    ff_chances.save(db, page(now, p=0.55, kickoff=kickoff), [WEEK, next_week], now)

    match = kept(db)["matches"]["1"]
    assert match["gw"] == "gw-next" and match["atLock"]["home"]["players"]["10"]["p"] == 0.55
