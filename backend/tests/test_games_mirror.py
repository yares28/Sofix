"""The jobs' local copy of `player_games` fetches only changed games and drops removed ones (Neon sends 5 GB a month)."""

from datetime import UTC, datetime

from sqlalchemy import bindparam, create_engine, text
from sqlalchemy.orm import Session

from app.db import Base
from app.models import PlayerGame
from app.sorare import games_mirror

DAY = datetime(2026, 10, 18, tzinfo=UTC)


def game(player, game_id, score):
    return PlayerGame(player=player, game_id=game_id, date=DAY, competition="laliga-es", score=score, stats=[{"a": 1}])


def test_only_changed_games_are_fetched_again_and_removed_ones_go(tmp_path, monkeypatch):
    # SQLite has no md5 or row-to-text: the same fingerprints, spelled for SQLite.
    row = "game_id || ':' || coalesce(score, '')"
    monkeypatch.setattr(
        games_mirror,
        "_PLAYER_PRINTS",
        text(f"SELECT player, group_concat({row}, '|') FROM player_games GROUP BY player"),
    )
    monkeypatch.setattr(
        games_mirror,
        "_GAME_PRINTS",
        text(f"SELECT player, game_id, {row} FROM player_games WHERE player IN :players").bindparams(
            bindparam("players", expanding=True)
        ),
    )
    remote_engine = create_engine("sqlite://")
    Base.metadata.create_all(remote_engine)
    remote = Session(remote_engine)
    remote.add_all([game("a", "g1", 50), game("a", "g3", 20), game("b", "g1", 40), game("c", "g2", 30)])
    remote.commit()
    local = Session(games_mirror._engine(str(tmp_path / "copy.sqlite")))

    assert games_mirror.sync(remote, local) == 4
    assert games_mirror.sync(remote, local) == 0  # nothing changed: nothing fetched

    remote.get(PlayerGame, ("a", "g3")).score = 25
    remote.delete(remote.get(PlayerGame, ("c", "g2")))
    remote.delete(remote.get(PlayerGame, ("b", "g1")))
    remote.add(game("b", "g4", 60))
    remote.commit()
    assert games_mirror.sync(remote, local) == 2  # a's g3 and b's new g4; a's g1 stays as it was
    rows = {(r.player, r.game_id, r.score) for r in local.query(PlayerGame)}
    assert rows == {("a", "g1", 50), ("a", "g3", 25), ("b", "g4", 60)}
    assert local.get(PlayerGame, ("a", "g1")).stats == [{"a": 1}]
