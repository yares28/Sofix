# ruff: noqa: F811
import json
from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import func, select

from app.models import PlayerGame, ReadModel
from app.sorare import player_games, sheets
from tests.test_pipeline import db  # noqa: F401
from tests.test_sheets import season

NOW = datetime(2026, 10, 9, tzinfo=UTC)


def exported():
    games = season(4)
    for i, game in enumerate(games):
        game["id"] = f"g{i}"
        if i < 2:
            game["date"] = game["date"].replace("2026", "2025")
        game["players"]["soria"].update(mins=90, proj=65)
    return games


def test_seed_keeps_both_seasons_and_rebuilds_the_same_stat_sheet(db):
    from app.jobs import seed_player_games as seed

    games = exported()
    history = seed.history_from_games(games)
    seed.run(db, history, NOW)
    assert db.scalar(select(func.count()).select_from(PlayerGame)) == 8
    assert db.get(ReadModel, sheets.KEY).payload == sheets.sheets_from_games(games)
    old = db.get(PlayerGame, ("soria", "g0"))
    assert old.date.year == 2025 and old.home == "Getafe CF" and old.away == "Real Betis"
    assert old.sofix_x is None and old.sorare_x is None and old.said_at is None
    seed.run(db, history, NOW + timedelta(days=1))
    assert db.scalar(select(func.count()).select_from(PlayerGame)) == 8
    assert db.get(PlayerGame, ("soria", "g0")).read_at.replace(tzinfo=UTC) == NOW


def test_daily_actuals_win_even_when_seed_is_later_and_statement_only_rows_are_filled(db):
    from app.jobs import seed_player_games as seed

    history = seed.history_from_games(exported())
    fresh = {**history["soria"][0], "score": 99, "yellow": 2, "stats": [{"stat": "new"}]}
    player_games.save(db, {"soria": [fresh]}, NOW - timedelta(days=1))
    frozen = PlayerGame(
        player="soria",
        game_id="g1",
        date=NOW,
        competition="laliga-es",
        ff_start=0.8,
        sofix_x=50,
        sorare_x=55,
        said_at=NOW - timedelta(days=4),
    )
    db.add(frozen)
    db.commit()
    seed.run(db, history, NOW)
    db.expire_all()
    saved = db.get(PlayerGame, ("soria", "g0"))
    assert saved.score == 99 and saved.yellow == 2 and saved.stats == [{"stat": "new"}]
    frozen = db.get(PlayerGame, ("soria", "g1"))
    assert frozen.score == history["soria"][1]["score"] and frozen.date.year == 2025
    assert (frozen.ff_start, frozen.sofix_x, frozen.sorare_x) == (0.8, 50, 55)
    # The normal daily writer can still correct seeded actuals.
    player_games.save(db, {"soria": [{**history["soria"][1], "score": 88}]}, NOW + timedelta(hours=1))
    assert db.get(PlayerGame, ("soria", "g1")).score == 88


def test_export_actuals_preserve_zero_unknowns_cards_and_the_side_that_played():
    from app.jobs import seed_player_games as seed

    games = exported()[:1]
    games[0]["players"]["soria"].update(
        score=0, level=0, team="betis", stats={"yellow_card": [1, -3], "red_card": [1, -3]}
    )
    games[0]["players"]["sub"].update(played=False, started=False, score=0, mins=0, stats=None)
    history = seed.history_from_games(games)
    row = history["soria"][0]
    assert row["score"] == 0 and row["yellow"] == 1 and row["red"] is True
    assert row["stats"][-1] == {"stat": "_context", "pos": "GK", "team": "betis", "venue": "A", "level": 0}
    sub = history["sub"][0]
    assert sub["status"] == "DID_NOT_PLAY" and sub["mins"] == 0 and sub["score"] == 0
    assert "stats" not in sub and "yellow" not in sub and "red" not in sub
    games[0]["players"]["soria"]["stats"] = {"red_card": [1, -3]}
    assert seed.history_from_games(games)["soria"][0]["yellow"] == 0, "second yellow is reported as red only"


def test_default_cli_only_reports_the_export_without_opening_a_database(tmp_path, monkeypatch, capsys):
    from app.jobs import seed_player_games as seed

    path = tmp_path / "games.jsonl"
    path.write_text("\n".join(json.dumps(game) for game in exported()), "utf-8")
    monkeypatch.setattr(seed, "run", lambda *args: pytest.fail("dry run must not write"))
    import app.db

    monkeypatch.setattr(app.db, "SessionLocal", lambda: pytest.fail("dry run must not open Neon"))
    assert seed.main(["--games", str(path)]) == 0
    output = capsys.readouterr().out
    assert "2025/26: 2" in output and "2026/27: 2" in output and "8 player-game rows" in output
    assert "Dry run" in output


@pytest.mark.parametrize("tail", ['{"id":', '{"id":"broken","date":"bad"}'])
def test_invalid_export_fails_before_any_database_write(tmp_path, monkeypatch, tail):
    from app.jobs import seed_player_games as seed

    path = tmp_path / "games.jsonl"
    path.write_text(json.dumps(exported()[0]) + "\n" + tail, "utf-8")
    monkeypatch.setattr(seed, "run", lambda *args: pytest.fail("invalid input must not write"))
    import app.db

    monkeypatch.setattr(app.db, "SessionLocal", lambda: pytest.fail("validate before connecting"))
    with pytest.raises(ValueError, match="line 2"):
        seed.main(["--games", str(path), "--write"])
