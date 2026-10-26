"""Pages read R2 only (plans/neon-write-mostly.md): every job leaves R2 holding each block's newest version."""

import hashlib
import json
from datetime import UTC, datetime, timedelta

from app.models import PlayerAbsence, PlayerGame, ReadModel, RefreshRun
from app.services import player_blocks, r2
from tests.test_pipeline import db  # noqa: F401

NOW = datetime(2026, 10, 26, 18, 0, tzinfo=UTC)


def test_sync_uploads_missing_and_older_blocks_and_deletes_gone_ones(db, monkeypatch):  # noqa: F811
    db.add_all(
        [
            ReadModel(key="fresh", payload={"a": 1}, updated_at=NOW - timedelta(hours=1)),
            ReadModel(key="stale", payload={"a": 2}, updated_at=NOW),
            ReadModel(key="missing", payload={"a": 3}, updated_at=NOW),
            ReadModel(key="same_second", payload={"a": 4}, updated_at=NOW + timedelta(milliseconds=600)),
            ReadModel(key="neon_ledger:20261026:1", payload={}, updated_at=NOW),
        ]
    )
    db.commit()
    remote = {
        "fresh": ("e1", NOW - timedelta(minutes=59)),
        "stale": ("e2", NOW - timedelta(minutes=5)),
        "same_second": ("e3", NOW),  # R2 keeps whole seconds: an upload in the same second is current
        "gone": ("e4", NOW),
        "player_games:someone": ("e5", NOW),  # R2-only blocks are never deleted
    }
    monkeypatch.setattr(r2, "configured", lambda: True)
    monkeypatch.setattr(r2, "list_blocks", lambda prefix="": remote)
    put, deleted = {}, []
    monkeypatch.setattr(r2, "put_block", lambda key, payload, at: put.setdefault(key, payload) is not None)
    monkeypatch.setattr(r2, "delete_block", lambda key: deleted.append(key) or True)

    done = r2.sync(db)

    assert put == {"stale": {"a": 2}, "missing": {"a": 3}}
    assert deleted == ["gone"]
    assert done == {"uploaded": 2, "deleted": 1, "failed": 0}


def test_sync_does_nothing_without_r2(db, monkeypatch):  # noqa: F811
    monkeypatch.setattr(r2, "configured", lambda: False)
    assert r2.sync(db) == {"uploaded": 0, "deleted": 0, "failed": 0}


def _game(player: str, game: str, date: datetime, score: float | None) -> PlayerGame:
    return PlayerGame(
        player=player,
        game_id=game,
        date=date,
        competition="LaLiga",
        home="A",
        away="B",
        status="FINAL",
        score=score,
        played=score is not None,
        read_at=NOW,
    )


def test_player_history_blocks_upload_only_what_changed(db, monkeypatch):  # noqa: F811
    db.add_all(
        [
            _game("pedri", "g1", NOW - timedelta(days=7), 61.5),
            _game("pedri", "g2", NOW + timedelta(days=2), None),  # a future game: the page hides it until it starts
            _game("lamine", "g1", NOW - timedelta(days=7), 70.0),
            PlayerAbsence(ff_id="1", player="pedri", kind="out", cause="knee", first_seen=NOW, last_seen=NOW),
            ReadModel(key="ff_links", payload={"links": {"pedri": {"slug": "pedri-gonzalez"}}}, updated_at=NOW),
        ]
    )
    db.commit()
    blocks = player_blocks.build(db)
    assert [g["game_id"] for g in blocks["pedri"]["games"]] == ["g2", "g1"]
    assert blocks["pedri"]["absences"][0]["url"] == "https://www.futbolfantasy.com/jugadores/pedri-gonzalez"
    assert blocks["lamine"]["absences"] == []

    unchanged = hashlib.md5(player_blocks.body(blocks["lamine"])).hexdigest()
    remote = {"player_games:lamine": (unchanged, NOW), "player_games:gone": ("x", NOW)}
    monkeypatch.setattr(r2, "configured", lambda: True)
    monkeypatch.setattr(r2, "list_blocks", lambda prefix="": remote)
    sent, deleted = [], []
    monkeypatch.setattr(r2, "put_body", lambda key, body: sent.append((key, json.loads(body))) or True)
    monkeypatch.setattr(r2, "delete_block", lambda key: deleted.append(key) or True)

    assert player_blocks.publish(db) == {"players": 2, "uploaded": 1, "deleted": 1}
    assert [key for key, _ in sent] == ["player_games:pedri"]
    assert sent[0][1]["payload"]["games"][1]["score"] == 61.5
    assert deleted == ["player_games:gone"]


def test_recent_runs_newest_first(db):  # noqa: F811
    for i in range(10):
        start = NOW + timedelta(minutes=i)
        db.add(RefreshRun(trigger="schedule", status="succeeded", started_at=start, finished_at=start))
    db.commit()
    runs = player_blocks.recent_runs(db)
    assert len(runs) == 8 and runs[0]["id"] > runs[-1]["id"]
    assert runs[0]["started_at"] == (NOW + timedelta(minutes=9)).isoformat()


def test_only_github_jobs_or_a_deliberate_run_reach_production():
    from app.db import production_allowed

    assert production_allowed({"GITHUB_ACTIONS": "true"})
    assert production_allowed({"SOFIX_PRODUCTION": "1"})
    assert not production_allowed({})
    assert not production_allowed({"SOFIX_PRODUCTION": "yes"})
