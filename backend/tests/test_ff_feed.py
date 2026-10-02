"""What Futbol Fantasy's pages last said, kept between runs and used for a day at most (plans/futbolfantasy.md, S1 and S3)."""

# ruff: noqa: F811  (the `db` fixture is used by importing it)
from __future__ import annotations

import dataclasses
import json
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any

import pytest
from sqlalchemy.orm import Session

from app.models import ReadModel
from app.sorare import ff_feed
from app.sources import futbolfantasy_matches as ffm
from tests.test_ff_link import match, player, side
from tests.test_pipeline import db  # noqa: F401  (fixture)

FIXTURES = Path(__file__).parent / "fixtures" / "futbolfantasy"
NOW = datetime(2026, 10, 8, 12, tzinfo=UTC)
KICKOFF = datetime(2026, 10, 11, 14, 15, tzinfo=UTC)


@pytest.fixture(scope="module")
def real() -> list[ffm.Match]:
    return [ffm.match_from_dict(item) for item in json.loads((FIXTURES / "matches_round_8.json").read_text("utf-8"))]


class Site:
    """A reader that answers with the matches it is given, for the ones it is asked to read, and remembers the questions."""

    def __init__(
        self,
        matches: list[ffm.Match],
        failed: list[str] | None = None,
        stopped: str | None = None,
        gone: list[int] | None = None,
    ) -> None:
        self.matches, self.failed, self.stopped, self.gone = matches, failed or [], stopped, gone or []
        self.asked: list[tuple[str, int]] = []
        self.calls = 0

    def __call__(self, wanted: Any, competitions: Any, now: datetime | None = None, **_: Any) -> ffm.Reading:
        self.calls += 1
        read = []
        for one in self.matches:
            item = ffm.RoundMatch(
                one.match_id, one.url, one.home.name, one.away.name, one.home.club_id, one.away.club_id, one.kickoff
            )
            if wanted(one.competition, item):
                self.asked.append((one.competition, one.match_id))
                read.append(one)
        return ffm.Reading(
            at=now or NOW, matches=read, failed=list(self.failed), stopped=self.stopped, gone=list(self.gone)
        )


def with_chance(one: ffm.Match, ff_id: str, chance: float) -> ffm.Match:
    def edit(s: ffm.Side) -> ffm.Side:
        return dataclasses.replace(
            s, xi=tuple(dataclasses.replace(p, chance=chance) if p.ff_id == ff_id else p for p in s.xi)
        )

    return dataclasses.replace(one, home=edit(one.home), away=edit(one.away))


def cup(match_id: int, home: str, home_id: str | None, away: str, away_id: str | None, competition: str) -> ffm.Match:
    made = match(
        side(home, home_id, xi=(player(f"{match_id}1", f"{home} Nueve"),)),
        side(away, away_id, xi=(player(f"{match_id}2", f"{away} Nueve"),)),
        KICKOFF,
        match_id,
    )
    return dataclasses.replace(made, competition=competition)


# ---------------------------------------------------------------------------------------------------- the store
def test_what_is_read_is_kept_with_its_time_and_comes_back_whole(db: Session, real: list[ffm.Match]) -> None:
    feed = ff_feed.refresh(db, [], NOW, reader=Site(real))

    assert feed.fresh == 10 and len(feed.matches) == 10 and feed.read_at == NOW
    again = ff_feed.load(db)
    assert len(again.matches) == 10 and again.read_at == NOW
    kept = again.matches[22502]
    assert kept.read_at == NOW and kept.match == next(m for m in real if m.match_id == 22502)


def test_a_dry_run_asks_but_keeps_nothing(db: Session, real: list[ffm.Match]) -> None:
    feed = ff_feed.refresh(db, [], NOW, reader=Site(real), write=False)

    assert len(feed.matches) == 10 and db.get(ReadModel, ff_feed.STORE_KEY) is None


def test_the_first_shape_of_the_read_model_and_a_damaged_one_read_as_nothing(db: Session) -> None:
    db.add(
        ReadModel(
            key=ff_feed.STORE_KEY, payload={"fetchedAt": NOW.isoformat(), "round": 8, "chances": []}, updated_at=NOW
        )
    )
    db.commit()
    assert ff_feed.load(db).matches == {}
    db.get(ReadModel, ff_feed.STORE_KEY).payload = {
        "version": ff_feed.VERSION,
        "matches": {"1": {"readAt": "x", "match": {}}, "2": 5},
    }  # type: ignore[union-attr]
    db.commit()
    assert ff_feed.load(db).matches == {}


# --------------------------------------------------------------------------------------------- what is asked for
def test_every_laliga_match_is_read_and_the_others_only_with_a_spanish_club_or_one_of_the_owners(db: Session) -> None:
    site = Site(
        [
            cup(1, "Barcelona", "3", "Getafe", "8", "laliga"),
            cup(2, "Sevilla", "17", "Lyon", "901", "europa-league"),  # a Spanish club
            cup(3, "Lyon", "901", "Stuttgart", "902", "europa-league"),  # the owner has a player at Stuttgart
            cup(4, "Lyon", "901", "Ajax", "903", "europa-league"),  # nobody's
            cup(5, "Sporting", "904", "Girona", None, "copa-del-rey"),  # Girona is in the registry
            cup(6, "Lugo", "905", "Ajax", "903", "copa-del-rey"),
        ]
    )
    owner = [{"player": {"slug": "x", "activeClub": {"shortName": "Stuttgart", "name": "VfB Stuttgart"}}}]
    ff_feed.refresh(db, owner, NOW, reader=site)

    assert sorted(match_id for _, match_id in site.asked) == [1, 2, 3, 5]


def test_a_match_read_a_few_minutes_ago_is_not_asked_for_again_but_one_read_longer_ago_is(
    db: Session, real: list[ffm.Match]
) -> None:
    ff_feed.refresh(db, [], NOW, reader=Site(real))
    second = Site(real)
    ff_feed.refresh(db, [], NOW + timedelta(minutes=10), reader=second)
    assert second.asked == [], "ten minutes later nothing is asked again"
    third = Site(real)
    ff_feed.refresh(db, [], NOW + timedelta(minutes=30), reader=third)  # the near-lock runs are half an hour apart
    assert len(third.asked) == 10


# ---------------------------------------------------------------------------- when the site does not answer
def test_a_page_that_could_not_be_read_keeps_its_last_reading_for_a_day_and_not_beyond(
    db: Session, real: list[ffm.Match]
) -> None:
    ff_feed.refresh(db, [], NOW, reader=Site(real))
    later = NOW + timedelta(hours=6)
    feed = ff_feed.refresh(db, [], later, reader=Site([], failed=["https://x: 403"]))

    assert feed.fresh == 0 and feed.failed == ["https://x: 403"]
    assert len(feed.matches) == 10 and len(feed.usable(later)) == 10
    assert len(feed.usable(NOW + timedelta(hours=24))) == 10 and feed.usable(NOW + timedelta(hours=24, minutes=1)) == []


def test_a_match_the_site_no_longer_has_leaves_the_feed_and_is_no_failed_read(
    db: Session, real: list[ffm.Match]
) -> None:
    ff_feed.refresh(db, [], NOW, reader=Site(real))
    later = NOW + timedelta(hours=6)
    still_there = [m for m in real if m.match_id != 22502]
    feed = ff_feed.refresh(db, [], later, reader=Site(still_there, gone=[22502]))

    assert 22502 not in feed.matches and len(feed.matches) == 9 and len(feed.usable(later)) == 9
    assert feed.failed == [] and feed.stopped is None and ff_feed.stamp(feed) == {"matches": 9, "read": 9}
    kept = ff_feed.load(db)
    assert sorted(kept.matches) == sorted(feed.matches) and kept.failed == []


def test_a_gone_match_the_feed_never_held_changes_nothing(db: Session, real: list[ffm.Match]) -> None:
    feed = ff_feed.refresh(db, [], NOW, reader=Site(real, gone=[99999]))

    assert len(feed.matches) == 10 and feed.failed == []


def test_a_read_that_stopped_early_keeps_the_rest_as_they_were(db: Session, real: list[ffm.Match]) -> None:
    ff_feed.refresh(db, [], NOW, reader=Site(real))
    later = NOW + timedelta(hours=6)
    feed = ff_feed.refresh(db, [], later, reader=Site(real[:3], stopped="out of time"))

    assert feed.stopped == "out of time" and feed.fresh == 3
    times = sorted(item.read_at for item in feed.matches.values())
    assert times.count(later) == 3 and times.count(NOW) == 7, "the ones it did not get to still say when they were read"
    assert ff_feed.stamp(feed) == {"matches": 10, "read": 3, "stopped": "out of time"}


def test_a_match_that_has_kicked_off_is_no_longer_usable(db: Session, real: list[ffm.Match]) -> None:
    read = datetime(2026, 10, 10, 11, tzinfo=UTC)
    feed = ff_feed.refresh(db, [], read, reader=Site(real))

    assert len(feed.usable(read)) == 9, "Málaga - Espanyol was on the night before"
    assert len(feed.usable(datetime(2026, 10, 10, 13, tzinfo=UTC))) == 8, "and Rayo - Athletic started at 12:00 UTC"
    assert len(feed.usable(datetime(2026, 10, 12, 20, tzinfo=UTC))) == 0


def test_an_old_match_is_dropped_after_three_days(db: Session, real: list[ffm.Match]) -> None:
    ff_feed.refresh(db, [], NOW, reader=Site(real))
    feed = ff_feed.refresh(db, [], datetime(2026, 10, 14, 12, tzinfo=UTC), reader=Site([]))

    assert sorted(feed.matches) == [22494, 22496, 22499, 22501, 22502], "those from the 9th and 10th are gone"


# -------------------------------------------------------------------------------------------- when a lineup changed
def test_a_lineup_is_marked_changed_when_a_reading_differs_from_the_one_before_and_not_when_it_is_the_same(
    db: Session, real: list[ffm.Match]
) -> None:
    first = next(m for m in real if m.match_id == 22502)
    ff_feed.refresh(db, [], NOW, reader=Site([first]))
    same = ff_feed.refresh(db, [], NOW + timedelta(hours=1), reader=Site([first]))
    assert same.matches[22502].changed == {}

    moved = with_chance(first, "2675", 0.4)  # Oyarzabal, Real Sociedad (club 16)
    changed = ff_feed.refresh(db, [], NOW + timedelta(hours=2), reader=Site([moved]))
    assert changed.matches[22502].changed == {"16": NOW + timedelta(hours=2)}, "only his side changed"
    kept = ff_feed.refresh(db, [], NOW + timedelta(hours=3), reader=Site([moved]))
    assert kept.matches[22502].changed == {"16": NOW + timedelta(hours=2)}, "a reading with nothing new keeps the time"
    assert ff_feed.load(db).matches[22502].changed == {"16": NOW + timedelta(hours=2)}
