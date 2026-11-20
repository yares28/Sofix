"""Arcade's pre-kick-off statements, frozen per game at its kick-off (plans/arcade-trust.md step 7)."""

from datetime import UTC, datetime, timedelta

from app.services import kept_blocks
from app.sorare import arcade_said
from tests.test_pipeline import db  # noqa: F401

NOW = datetime(2026, 11, 20, 12, tzinfo=UTC)
KICK = NOW + timedelta(hours=30)
GAME = "Game:11111111-2222-3333-4444-555555555555"


def player(slug, *, kickoff=KICK, game=GAME, sources=None, mu=55.0, start=58.0, projection=50.0):
    return {
        "slug": slug,
        "sources": {"sofix": 0.8, "sorare": 0.9, "futbolfantasy": 0.7} if sources is None else sources,
        "mu": mu,
        "projection": projection,
        "fixture": {"id": game, "kickoff": kickoff.isoformat(), "competition": "laliga-es", "start": start},
    }


def test_collects_each_players_next_game_within_48_hours_by_game():
    later = player("far", kickoff=NOW + timedelta(hours=60), game="Game:far")
    played = player("done", kickoff=NOW - timedelta(hours=1), game="Game:done")
    out = arcade_said.collect([[player("a"), later], [player("b"), played]], NOW)
    assert list(out) == [GAME]
    assert out[GAME]["kickoff"] == KICK.isoformat()
    assert out[GAME]["players"]["a"] == {
        "at": NOW.isoformat(),
        "sofix": 0.8,
        "sorare": 0.9,
        "ff": 0.7,
        "sofixX": 55.0,
        "sofixStart": 58.0,
        "sorareX": 50.0,
    }
    assert set(out[GAME]["players"]) == {"a", "b"}


def test_keeps_the_latest_reading_before_kick_off_and_a_failed_source_keeps_its_number(db):  # noqa: F811
    arcade_said.save(db, arcade_said.collect([[player("a")]], NOW), NOW)
    later = NOW + timedelta(hours=2)
    arcade_said.save(db, arcade_said.collect([[player("a", sources={"sofix": 0.6})]], later), later)
    row = kept_blocks.read(db, arcade_said.PREFIX + GAME)
    assert row is not None
    said = row.payload["players"]["a"]
    assert said["sofix"] == 0.6 and said["at"] == later.isoformat()
    assert said["sorare"] == 0.9 and said["ff"] == 0.7  # not read this time: the last number stays


def test_freezes_at_kick_off_and_never_takes_an_older_delayed_reading(db):  # noqa: F811
    arcade_said.save(db, arcade_said.collect([[player("a")]], NOW), NOW)
    at_kick = arcade_said.collect([[player("a", sources={"sofix": 0.1}, kickoff=KICK)]], NOW)
    assert arcade_said.save(db, at_kick, KICK) == 0  # at kick-off: frozen
    older = arcade_said.collect([[player("a", sources={"sofix": 0.2})]], NOW - timedelta(hours=1))
    arcade_said.save(db, older, NOW + timedelta(hours=1))
    row = kept_blocks.read(db, arcade_said.PREFIX + GAME)
    assert row is not None
    assert row.payload["players"]["a"]["sofix"] == 0.8
    # A player first seen at kick-off is not made up afterwards.
    assert arcade_said.save(db, arcade_said.collect([[player("new")]], NOW), KICK) == 0
