from datetime import UTC, datetime, timedelta

from app.models import PlayerGame, ReadModel
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


def test_read_times_is_load_without_the_games(db):  # noqa: F811
    from app.services.publish import put
    from app.sorare import player_games

    old = {"gameId": "old", "date": "2026-07-01T19:00:00Z", "competition": "laliga-es", "status": "FINAL"}
    new = {"gameId": "new", "date": "2026-10-01T19:00:00Z", "competition": "laliga-es", "status": "FINAL"}
    player_games.save(db, {"a": [old, new], "b": [old]}, NOW)
    db.add(PlayerGame(player="c", game_id="new", date=datetime(2026, 10, 1, 19, tzinfo=UTC), competition="laliga-es"))
    db.commit()
    for days in (30, None):
        loaded = player_games.load(db, now=NOW, days=days)
        assert player_games.read_times(db, now=NOW, days=days) == {
            player: {"at": entry["at"], "games": []} for player, entry in loaded.items()
        }
    assert player_games.read_times(db, now=NOW, days=30)["c"]["at"] == ""  # kept but never read: still a new player

    # put() writes a new key and replaces an old one, without loading the row it replaces
    put(db, "k", {"n": 1}, NOW)
    put(db, "k", {"n": 2}, NOW + timedelta(minutes=1))
    assert db.get(ReadModel, "k").payload == {"n": 2}


def test_known_holds_what_the_league_read_needs_from_load(db):  # noqa: F811
    from app.sorare import player_games

    games = [
        {
            "gameId": "g1",
            "date": "2026-08-01T19:00:00Z",
            "competition": "laliga-es",
            "status": "FINAL",
            "score": 50,
            "played": True,
            "started": True,
            "mins": 90,
            "stats": [{"stat": "goals", "statValue": 1, "totalScore": 25}],
        },
        {
            "gameId": "g2",
            "date": "2026-10-05T19:00:00Z",
            "competition": "laliga-es",
            "status": "PENDING",
            "score": None,
        },
    ]
    player_games.save(db, {"a": games}, NOW)
    full, light = player_games.load(db), player_games.known(db)
    assert light["a"]["at"] == full["a"]["at"]
    assert light["a"]["games"] == [
        {key: game[key] for key in ("gameId", "date", "status")} for game in full["a"]["games"]
    ]


def test_a_window_and_a_stats_subset_give_the_same_games_as_a_full_read(db):  # noqa: F811
    from app.sorare import player_games

    def game(gid: str, date: str, yellow: int | None, stats: list | None) -> dict:
        return {
            "gameId": gid,
            "date": date,
            "competition": "laliga-es",
            "status": "FINAL",
            "played": True,
            "started": True,
            "score": 50,
            "yellow": yellow,
            "stats": stats,
        }

    stats = [
        {"stat": "goals", "statValue": 1},
        {"stat": "fouls", "statValue": 2},
        {"stat": "clean_sheet_60", "statValue": 0},
    ]
    player_games.save(
        db,
        {
            "a": [
                game("old", "2026-05-01T19:00:00Z", 3, stats),  # last season: never counts
                game("early", "2026-07-20T19:00:00Z", 2, stats),  # this season, before the window
                game("none", "2026-07-25T19:00:00Z", None, None),  # cards not read: adds nothing
                game("in1", "2026-09-20T19:00:00Z", 1, stats),
                game("in2", "2026-10-05T19:00:00Z", 0, None),
            ],
            "b": [game("b1", "2026-10-01T19:00:00Z", 1, stats)],
        },
        NOW,
    )
    full = player_games.load(db)
    window = player_games.load(db, now=NOW, days=70)
    cutoff = NOW - timedelta(days=70)
    for player, entry in window.items():
        assert entry["games"] == [g for g in full[player]["games"] if datetime.fromisoformat(g["date"]) >= cutoff]
    assert [g["seasonYellows"] for g in window["a"]["games"]] == [3, 3]
    assert player_games.load(db, now=NOW, days=70, players={"a"})["a"] == window["a"]

    slim = player_games.load(db, now=NOW, days=70, stats=("goals", "clean_sheet_60"))
    for player, entry in window.items():
        for kept, whole in zip(slim[player]["games"], entry["games"], strict=True):
            names = None if whole.get("stats") is None else ["goals", "clean_sheet_60"]
            assert {k: v for k, v in kept.items() if k != "stats"} == {k: v for k, v in whole.items() if k != "stats"}
            assert (None if kept.get("stats") is None else [s["stat"] for s in kept["stats"]]) == names
    assert player_games.listed(db, {"a", "b", "c"}) == list(full)
