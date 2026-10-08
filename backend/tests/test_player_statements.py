"""Source statements belong to a player/game and may move only before the gameweek lock."""

from copy import deepcopy
from datetime import UTC, datetime, timedelta

from app.models import PlayerGame
from app.services.timeutil import as_utc
from app.sorare import player_games, publish
from app.sorare.forecast import GameStart, PlayerWeek, forecast
from tests.test_pipeline import db  # noqa: F401

NOW = datetime(2026, 10, 8, 9, tzinfo=UTC)
LOCK = NOW + timedelta(days=1)


def reading():
    return {
        "gameweek": {"slug": "gw", "lock": LOCK.isoformat()},
        "writtenAt": NOW.isoformat(),
        "players": {
            slug: {
                "games": [
                    {
                        "id": "g1",
                        "kickoff": "2026-10-10T19:00:00Z",
                        "competition": "laliga-es",
                        "home": "Home",
                        "away": "Away",
                        "sofix": 54.0,
                        "sorare": 60.0,
                        "sources": {"sofix": 0.7, "sorare": 0.8, "futbolfantasy": 0.0},
                        "ffMatch": {"id": 7},
                        "ffPlayer": slug,
                    }
                ]
            }
            for slug in ("owner", "other")
        },
    }


def lineup():
    return {
        "matches": [
            {
                "id": 7,
                "home": {
                    "published": True,
                    "rows": [{"players": [{"id": "owner"}]}],
                    "alternatives": [{"id": "other"}],
                },
                "away": {},
            }
        ]
    }


def test_statements_keep_every_player_and_do_not_touch_actuals(db):  # noqa: F811
    player_games.save(
        db,
        {
            "owner": [
                {"gameId": "g1", "date": "2026-10-10T19:00:00Z", "competition": "laliga-es", "score": 65, "yellow": 1}
            ]
        },
        NOW,
    )
    assert player_games.save_statements(db, reading(), NOW, lineup()) == 2
    db.expire_all()
    owner, other = [db.get(PlayerGame, (slug, "g1")) for slug in ("owner", "other")]
    assert owner.score == 65 and owner.yellow == 1 and as_utc(owner.read_at) == NOW
    assert (owner.ff_start, owner.sorare_start, owner.sofix_start, owner.ff_xi) == (0.0, 0.8, 0.7, True)
    assert other.ff_xi is False and other.score is None and other.read_at is None
    assert owner.sofix_x == 54.0 and owner.sorare_x == 60.0 and as_utc(owner.said_at) == NOW


def test_statements_update_before_lock_preserve_failed_sources_and_freeze_at_lock(db):  # noqa: F811
    player_games.save_statements(db, reading(), NOW, lineup())
    changed = reading()
    changed["writtenAt"] = (NOW + timedelta(hours=1)).isoformat()
    game = changed["players"]["owner"]["games"][0]
    game.update(sofix=70, sorare=None, sources={"sofix": 0.9})
    player_games.save_statements(db, changed, NOW + timedelta(hours=1), None)
    player_games.save_statements(db, reading(), NOW, lineup())  # older delayed refresh cannot undo this
    locked = deepcopy(changed)
    locked["players"]["owner"]["games"][0].update(sofix=99, sorare=99)
    locked["players"]["late"] = locked["players"]["owner"]
    assert player_games.save_statements(db, locked, LOCK, lineup()) == 0
    db.expire_all()
    owner = db.get(PlayerGame, ("owner", "g1"))
    assert (owner.sofix_x, owner.sorare_x, owner.ff_start, owner.ff_xi) == (70, 60, 0.0, True)
    assert db.get(PlayerGame, ("late", "g1")) is None, "no after-lock reconstruction"


def test_score_record_keeps_each_games_sources_and_actual_sides():
    week = PlayerWeek(
        games=2,
        projection=60,
        start_odds=0.8,
        plays_odds=0.9,
        history=[("2026-10-01T19:00:00Z", 50, True)],
        starts={"2026-10-01T19:00:00Z": True},
        game_ids=["g1", "g2"],
        game_starts=[
            GameStart("g1", 0.6, info={"ffMatch": {"id": 7}, "ffPlayer": "p"}),
            GameStart("g2", 0.4, info={"ffMatch": {"id": 8}, "ffPlayer": "p"}),
        ],
        game_scores=(54, 56),
    )
    games = [
        {
            "id": gid,
            "kickoff": f"2026-10-{day}T19:00:00Z",
            "competition": "laliga-es",
            "team": "Home",
            "opponent": "Away",
            "venue": venue,
        }
        for gid, day, venue in [("g1", 10, "H"), ("g2", 12, "A")]
    ]
    out = publish.score_record(
        {"slug": "gw", "number": 1, "lock": LOCK.isoformat()},
        {"p": week},
        {"p": forecast(week)},
        {"p": games},
        {"fetchedAt": NOW.isoformat()},
    )
    first, second = out["players"]["p"]["games"]
    assert first["sources"] == {"sorare": 0.8, "sofix": 0.6, "futbolfantasy": 0.6}
    assert second["sources"] == {"sofix": 0.6, "futbolfantasy": 0.4}, "Sorare's odds cover only his next game"
    assert first["home"] == "Home" and second["home"] == "Away" and second["away"] == "Home"
    assert first["ffPlayer"] == "p" and second["ffMatch"] == {"id": 8}


def test_unknown_statement_and_unpublished_eleven_stay_null(db):  # noqa: F811
    record = reading()
    record["players"] = {
        "unknown": {
            "games": [
                {
                    "id": "g2",
                    "kickoff": "2026-10-10T19:00:00Z",
                    "competition": "laliga-es",
                    "sources": {},
                    "ffMatch": {"id": 7},
                    "ffPlayer": "unknown",
                }
            ]
        }
    }
    player_games.save_statements(db, record, NOW, {"matches": [{"id": 7, "home": {"published": False}}]})
    row = db.get(PlayerGame, ("unknown", "g2"))
    assert row.ff_xi is None and row.ff_start is None and row.sorare_x is None and row.sofix_x is None
