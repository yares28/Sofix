"""The plan as it stood at its lock, kept once (roadmap 1.2): what the Audit page will score against what really happened."""

# ruff: noqa: F811  (the `db` fixture is used by importing it)
from __future__ import annotations

import json
from datetime import UTC, datetime, timedelta
from typing import Any

from app.models import ReadModel
from app.sorare import frozen
from tests.test_pipeline import db  # noqa: F401  (fixture)

LOCK = datetime(2026, 10, 9, 14, tzinfo=UTC)
BUILT = LOCK - timedelta(hours=1)  # the last run before the lock
AFTER = LOCK + timedelta(hours=1)  # the first run after it
PICTURES = ("pic", "avatar", "crest", "teamCrest", "opponentCrest")


def week(
    slug: str = "gw-plan", lock: datetime = LOCK, *, played: bool = False, plans: int = 1, players: int = 1
) -> dict[str, Any]:
    game = {
        "id": "g1",
        "opponent": "Club Z",
        "opponentCrest": "https://x/z.png",
        "pStart": 0.7,
        "startSource": "futbolfantasy",
    }
    player = {
        "player": "mid-one",
        "name": "Mid One",
        "pic": "https://x/p.png",
        "avatar": "https://x/a.png",
        "crest": "https://x/c.png",
        "x": 41.0,
        "p": 0.8,
        "games": [game],
    }
    card = {
        "slug": "c1",
        "player": "mid-one",
        "pic": "https://x/p.png",
        "crest": "https://x/c.png",
        "x": 41.0,
        "pStart": 0.7,
        "fixture": {"teamCrest": "https://x/t.png", "opponentCrest": "https://x/z.png", "opponent": "Club Z"},
    }
    plan = {
        "rank": 1,
        "essence": 120,
        "pAny": 0.4,
        "lineups": [{"comp": "All Star", "x": 300, "pReturn": 0.4, "starters": [card], "subs": []}],
    }
    return {
        "gameweek": {
            "id": "21",
            "slug": slug,
            "number": 21,
            "name": "Game Week 21",
            "start": "2026-10-09T00:00:00+00:00",
            "end": "2026-10-13T00:00:00+00:00",
            "lock": lock.isoformat(),
        },
        "state": "ready",
        "played": played,
        "source": "sorare",
        "playing": {"cards": 3, "players": [player][:players]},
        "playable": [{"name": "All Star"}],
        "blocked": [{"name": "Under 23", "why": "no card"}],
        "notWorth": [{"name": "Rare Room"}],
        "plans": [plan][:plans],
    }


def page(weeks: list[dict[str, Any]], built: datetime = BUILT) -> dict[str, Any]:
    return {"version": 7, "generatedAt": built.isoformat(), "weeks": weeks, "nextId": "21"}


def kept(db, slug: str = "gw-plan") -> dict[str, Any] | None:
    row = db.get(ReadModel, f"{frozen.PLAN_PREFIX}{slug}")
    return dict(row.payload) if row else None


def keys_of(value: Any) -> set[str]:
    if isinstance(value, dict):
        return set(value) | {k for v in value.values() for k in keys_of(v)}
    if isinstance(value, list):
        return {k for v in value for k in keys_of(v)}
    return set()


def test_the_plan_a_page_held_when_its_week_locked_is_kept_once_with_what_the_audit_needs(db) -> None:
    assert frozen.freeze(db, page([week()]), AFTER) == ["gw-plan"]

    plan = kept(db)
    assert plan is not None
    assert plan["builtAt"] == BUILT.isoformat() and plan["frozenAt"] == AFTER.isoformat()
    assert plan["gameweek"]["slug"] == "gw-plan" and plan["gameweek"]["lock"] == LOCK.isoformat()
    # the plan itself: every lineup with its cards, and the numbers each card was drawn from
    lineup = plan["plans"][0]["lineups"][0]
    assert lineup["x"] == 300 and lineup["pReturn"] == 0.4
    assert lineup["starters"][0]["pStart"] == 0.7 and lineup["starters"][0]["fixture"]["opponent"] == "Club Z"
    mid = plan["playing"]["players"][0]
    assert mid["x"] == 41.0 and mid["games"][0]["pStart"] == 0.7 and mid["games"][0]["startSource"] == "futbolfantasy"


def test_pictures_and_what_could_be_entered_are_left_out_so_a_season_of_them_stays_small(db) -> None:
    frozen.freeze(db, page([week()]), AFTER)

    plan = kept(db)
    assert plan is not None
    assert not keys_of(plan) & set(PICTURES), "the Audit needs numbers, and the pictures are on the page already"
    assert not {"playable", "blocked", "notWorth"} & set(plan)
    full = len(json.dumps(page([week()])))
    assert len(json.dumps(plan)) < full


def test_it_is_never_written_twice(db) -> None:
    frozen.freeze(db, page([week()]), AFTER)
    first = kept(db)

    other = week()
    other["plans"][0]["essence"] = 999  # a later page that says something else
    assert frozen.freeze(db, page([other]), AFTER + timedelta(hours=6)) == []

    assert kept(db) == first


def test_a_page_built_after_the_lock_is_not_the_plan_at_the_lock(db) -> None:
    late = page([week()], built=LOCK + timedelta(minutes=10))

    assert frozen.freeze(db, late, AFTER) == []
    assert kept(db) is None


def test_a_week_still_open_or_already_played_is_left_alone(db) -> None:
    open_week = week("gw-open", lock=LOCK + timedelta(days=3))
    played = week("gw-played", played=True)

    assert frozen.freeze(db, page([open_week, played]), AFTER) == []
    assert kept(db, "gw-open") is None and kept(db, "gw-played") is None


def test_a_week_with_nothing_in_it_is_not_kept(db) -> None:
    empty = week(plans=0, players=0)

    assert frozen.freeze(db, page([empty]), AFTER) == []


def test_a_week_with_players_and_no_plan_is_kept_for_the_numbers_on_its_players(db) -> None:
    """A national-team week has few competitions: the expected scores are still what was said at the lock."""
    assert frozen.freeze(db, page([week(plans=0)]), AFTER) == ["gw-plan"]
    plan = kept(db)
    assert plan is not None and plan["plans"] == [] and plan["playing"]["players"]


def test_every_week_that_locked_since_the_page_was_built_is_kept(db) -> None:
    one, two = week("gw-a", lock=LOCK), week("gw-b", lock=LOCK + timedelta(hours=2))

    assert frozen.freeze(db, page([one, two]), LOCK + timedelta(hours=3)) == ["gw-a", "gw-b"]


def test_a_dry_run_names_what_it_would_keep_and_keeps_nothing(db) -> None:
    assert frozen.freeze(db, page([week()]), AFTER, write=False) == ["gw-plan"]
    assert kept(db) is None


def test_no_page_yet_or_a_page_of_another_shape_keeps_nothing(db) -> None:
    assert frozen.freeze(db, None, AFTER) == []
    assert frozen.freeze(db, {}, AFTER) == []
    assert frozen.freeze(db, {"generatedAt": "not a date", "weeks": [week()]}, AFTER) == []
    assert frozen.freeze(db, {"generatedAt": BUILT.isoformat(), "weeks": [{"gameweek": {}}]}, AFTER) == []
