from datetime import UTC, datetime, timedelta

from app.models import PlayerGame
from tests.test_pipeline import db  # noqa: F401

NOW = datetime(2026, 10, 8, tzinfo=UTC)


def test_actual_upserts_keep_old_games_and_frozen_statements(db):  # noqa: F811
    from app.sorare import player_games

    original = {
        "gameId": "g1",
        "date": "2026-08-01T19:00:00Z",
        "competition": "laliga-es",
        "status": "PENDING",
        "score": None,
        "played": False,
        "started": False,
        "mins": None,
    }
    player_games.save(db, {"a": [original]}, NOW - timedelta(days=1))
    stored = db.get(PlayerGame, ("a", "g1"))
    stored.ff_start, stored.sofix_x, stored.said_at = 0.8, 50.0, NOW - timedelta(days=3)
    db.commit()
    fresh = {
        **original,
        "status": "FINAL",
        "score": 65,
        "played": True,
        "started": True,
        "mins": 90,
        "yellow": 1,
        "red": False,
        "stats": [{"stat": "goals", "statValue": 1, "totalScore": 25}],
    }
    player_games.save(db, {"a": [fresh]}, NOW)
    player_games.save(db, {"a": [original]}, NOW - timedelta(hours=1))  # delayed daily read
    player_games.save(db, {"a": [{**fresh, "gameId": "g2", "date": "2026-10-05T19:00:00Z"}]}, NOW)
    db.expire_all()
    stored = db.get(PlayerGame, ("a", "g1"))
    assert stored.score == 65 and stored.yellow == 1 and stored.stats == fresh["stats"]
    assert stored.ff_start == 0.8 and stored.sofix_x == 50.0
    assert len(player_games.load(db)["a"]["games"]) == 2, "the August game stays after new reads"
    assert len(player_games.load(db, now=NOW, days=30)["a"]["games"]) == 1


def test_a_keyless_read_preserves_cards_stats_and_missing_team_names(db):  # noqa: F811
    from app.sorare import player_games

    game = {
        "gameId": "g1",
        "date": "2026-10-01T19:00:00Z",
        "competition": "laliga-es",
        "status": "FINAL",
        "yellow": 1,
        "red": False,
        "home": "Home",
        "away": "Away",
        "stats": [{"stat": "goals", "statValue": 1}],
    }
    player_games.save(db, {"a": [game]}, NOW)
    plain = {key: value for key, value in game.items() if key not in ("yellow", "red", "stats", "home", "away")}
    player_games.save(db, {"a": [{**plain, "score": 70}]}, NOW + timedelta(hours=1))
    stored = db.get(PlayerGame, ("a", "g1"))
    assert stored.yellow == 1 and stored.red is False and stored.stats == game["stats"] and stored.home == "Home"


def test_recent_form_keeps_the_seasons_yellow_count(db):  # noqa: F811
    from app.sorare import player_games

    games = [
        {"gameId": str(i), "date": date, "competition": "laliga-es", "yellow": 1, "status": "FINAL"}
        for i, date in enumerate(
            [
                "2026-07-01T19:00:00Z",
                "2026-07-08T19:00:00Z",
                "2026-08-01T19:00:00Z",
                "2026-08-08T19:00:00Z",
                "2026-10-01T19:00:00Z",
            ]
        )
    ]
    player_games.save(db, {"a": games}, NOW)
    recent = player_games.load(db, now=NOW, days=30)["a"]["games"]
    assert len(recent) == 1 and recent[0]["seasonYellows"] == 5


def test_duplicate_game_across_pages_is_written_once(db):  # noqa: F811
    from app.sorare import player_games

    game = {"gameId": "g1", "date": "2026-10-01T19:00:00Z", "competition": "laliga-es", "score": 50}
    assert player_games.save(db, {"a": [game, {**game, "score": 60}]}, NOW) == 1
    assert db.get(PlayerGame, ("a", "g1")).score == 60
