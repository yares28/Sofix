"""The jobs' local copy of `player_games` fetches only changed players and drops removed ones (Neon sends 5 GB a month)."""

from datetime import UTC, datetime

from sqlalchemy import create_engine, text
from sqlalchemy.orm import Session

from app.db import Base
from app.models import PlayerGame
from app.sorare import games_mirror

DAY = datetime(2026, 10, 18, tzinfo=UTC)


def game(player, game_id, score):
    return PlayerGame(player=player, game_id=game_id, date=DAY, competition="laliga-es", score=score, stats=[{"a": 1}])


def test_only_changed_players_are_fetched_again_and_removed_ones_go(tmp_path, monkeypatch):
    # SQLite has no md5 or row-to-text: the same fingerprint, spelled for SQLite.
    monkeypatch.setattr(
        games_mirror,
        "_FINGERPRINTS",
        text(
            "SELECT player, group_concat(game_id || ':' || coalesce(score, ''), '|') FROM player_games GROUP BY player"
        ),
    )
    remote_engine = create_engine("sqlite://")
    Base.metadata.create_all(remote_engine)
    remote = Session(remote_engine)
    remote.add_all([game("a", "g1", 50), game("b", "g1", 40), game("c", "g2", 30)])
    remote.commit()
    local = Session(games_mirror._engine(str(tmp_path / "copy.sqlite")))

    assert games_mirror.sync(remote, local) == 3
    assert games_mirror.sync(remote, local) == 0  # nothing changed: nothing fetched

    remote.get(PlayerGame, ("b", "g1")).score = 45
    remote.delete(remote.get(PlayerGame, ("c", "g2")))
    remote.commit()
    assert games_mirror.sync(remote, local) == 1
    rows = {(r.player, r.score) for r in local.query(PlayerGame)}
    assert rows == {("a", 50), ("b", 45)}
    assert local.get(PlayerGame, ("a", "g1")).stats == [{"a": 1}]
