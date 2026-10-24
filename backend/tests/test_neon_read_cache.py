"""Automatic score/Audit jobs reuse history and versioned blocks without losing coverage."""

from datetime import UTC, datetime, timedelta
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import Mock

import httpx

from app.models import ReadModel
from app.services import kept_blocks, r2
from tests.test_pipeline import db  # noqa: F401

NOW = datetime(2026, 10, 24, tzinfo=UTC)


def test_every_audit_job_restores_and_keeps_the_history_copy():
    root = Path(__file__).resolve().parents[2]
    score = (root / ".github/workflows/score-checks.yml").read_text()
    fallback = (root / ".github/workflows/refresh.yml").read_text().split("  fdr-bootstrap:", 1)[1]
    for workflow, command in ((score, "app.jobs.score_checks"), (fallback, "app.jobs.audit")):
        assert "PLAYER_GAMES_MIRROR: .cache/player_games.sqlite" in workflow
        assert workflow.index("actions/cache/restore@v4") < workflow.index(command)
        assert workflow.index("actions/cache/save@v4") > workflow.index(command)
        assert "if: always() && hashFiles('backend/.cache/player_games.sqlite') != ''" in workflow
        assert "restore-keys: player-games-" in workflow


def test_block_rejects_stale_or_broken_r2_but_preserves_zero_and_null(monkeypatch):
    monkeypatch.setattr(r2, "_read_offline", False)
    monkeypatch.setattr(r2, "configured", lambda: True)
    body = {"updatedAt": NOW.isoformat(), "payload": 0}
    monkeypatch.setattr(r2, "request", lambda *a: httpx.Response(200, json=body))
    assert r2.get_block("test", NOW) == body
    body["payload"] = None
    assert r2.get_block("test", NOW) == body
    assert r2.get_block("test", NOW + timedelta(seconds=1)) is None
    body.pop("payload")
    assert r2.get_block("test", NOW) is None
    monkeypatch.setattr(r2, "request", lambda *a: httpx.Response(200, content="broken"))
    assert r2.get_block("test", NOW) is None


def test_r2_network_failure_falls_back_without_retrying_every_block(monkeypatch):
    monkeypatch.setattr(r2, "configured", lambda: True)
    monkeypatch.setattr(r2, "_read_offline", False)
    request = Mock(side_effect=httpx.ConnectError("offline"))
    monkeypatch.setattr(r2, "request", request)
    assert r2.get_block("one", NOW) is None
    assert r2.get_block("two", NOW) is None
    assert request.call_count == 1


def test_cold_start_r2_repeat_expiry_and_fallback(db, monkeypatch):  # noqa: F811
    db.add(ReadModel(key="mission:one", payload={"score": 7}, updated_at=NOW))
    db.commit()
    remote = Mock(wraps=db)
    remote.get_bind.return_value = SimpleNamespace(dialect=SimpleNamespace(name="postgresql"))
    monkeypatch.setattr(kept_blocks, "_kept", {})
    monkeypatch.delenv("PLAYER_GAMES_MIRROR", raising=False)
    fetched = []

    def cloud(key, at):
        fetched.append(key)
        return {"payload": {"score": 7}}

    monkeypatch.setattr(r2, "configured", lambda: True)
    monkeypatch.setattr(r2, "get_block", cloud)
    first = kept_blocks.rows(remote, "mission:")
    assert first[0].payload == {"score": 7}
    assert len(remote.execute.call_args_list) == 1  # timestamps only, no Neon payload
    first[0].payload["score"] = 100
    assert kept_blocks.read(remote, "mission:one").payload == {"score": 7}
    assert fetched == ["mission:one"]
    db.get(ReadModel, "mission:one").payload = {"score": 0}
    db.get(ReadModel, "mission:one").updated_at = NOW + timedelta(seconds=1)
    db.commit()
    monkeypatch.setattr(r2, "get_block", lambda *a: None)
    remote.execute.reset_mock()
    assert kept_blocks.read(remote, "mission:one").payload == {"score": 0}
    assert remote.execute.call_count == 2  # timestamp then fallback
    assert kept_blocks.read(remote, "missing") is None
