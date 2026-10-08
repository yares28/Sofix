# ruff: noqa: F811
from datetime import UTC, datetime

from sqlalchemy import select

from app.models import PlayerGame, ReadModel
from app.sorare import player_games, sheets
from tests.test_pipeline import db  # noqa: F401
from tests.test_sheets import season

NOW = datetime(2026, 10, 8, tzinfo=UTC)


def keep(db, games):
    for i, game in enumerate(games):
        player = game["players"]["soria"]
        player_games.save(
            db,
            {
                "soria": [
                    {
                        "gameId": str(i),
                        "date": game["date"],
                        "competition": "laliga-es",
                        "home": game["home"]["name"],
                        "away": game["away"]["name"],
                        "status": "FINAL",
                        "played": True,
                        "started": True,
                        "score": player["score"],
                        "stats": [
                            {"stat": key, "statValue": value[0], "totalScore": value[1]}
                            for key, value in player["stats"].items()
                        ]
                        + [{"stat": "_context", "pos": "GK", "team": "getafe", "venue": "H", "level": player["level"]}],
                    }
                ]
            },
            NOW,
        )


def test_kept_sheets_match_the_export_on_every_overlapping_game(db):
    games = season()
    keep(db, games)
    made = sheets.from_kept(db)
    assert made == sheets.sheets_from_games(games)


def test_missing_stats_context_and_pending_results_never_become_zero_stat_starts(db):
    keep(db, season(4))
    rows = list(db.scalars(select(PlayerGame).order_by(PlayerGame.date)))
    rows[-1].stats = None
    rows[-2].status = "PENDING"
    db.commit()
    assert sheets.from_kept(db)["players"] == {}
    rows[-2].status = "FINAL"
    db.commit()
    assert sheets.from_kept(db)["players"]["soria"]["starts"] == 3
    rows[0].stats = [{"stat": "saves", "statValue": 2, "totalScore": 4}]
    db.commit()
    assert sheets.from_kept(db)["players"] == {}, "no invented position, opponent or decisive level"


def test_daily_job_publishes_sheets_even_when_sorare_cannot_add_games(db, monkeypatch):
    from app.jobs import league_history

    keep(db, season())
    db.add(ReadModel(key="sorare", payload={"market": [{"slug": "soria"}]}, updated_at=NOW))
    db.commit()
    monkeypatch.setattr(league_history, "league_history", lambda *args, **kwargs: args[2])
    league_history.run(db, object(), NOW)
    assert db.get(ReadModel, "player_sheets").payload == sheets.sheets_from_games(season())


def test_local_api_serves_saved_games_absences_and_daily_sheets(db):
    from fastapi.testclient import TestClient

    from app.config import Settings
    from app.db import get_db
    from app.main import create_app
    from app.models import PlayerAbsence

    keep(db, season())
    db.add(PlayerAbsence(ff_id="123", player="soria", kind="out", cause="Knock", first_seen=NOW, last_seen=NOW))
    db.add(ReadModel(key=sheets.KEY, payload=sheets.from_kept(db), updated_at=NOW))
    db.commit()
    app = create_app(Settings(app_env="dev"))
    app.dependency_overrides[get_db] = lambda: db
    client = TestClient(app)
    history = client.get("/api/players/soria/games").json()["data"]
    assert len(history["games"]) == 12 and history["absences"][0]["kind"] == "out"
    assert client.get("/api/player-sheets").json()["data"]["players"]["soria"]["starts"] == 12
