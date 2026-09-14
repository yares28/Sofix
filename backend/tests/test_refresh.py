"""Refresh runs: isolated steps, run history, and the one-at-a-time lock."""

from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.jobs import refresh
from app.jobs.seed_and_sync import SyncResult
from app.migrate import upgrade_to_head
from app.models import RUNNING, RefreshRun


@pytest.fixture()
def session_factory(tmp_path):
    """A migrated SQLite file, so the partial unique index behaves as in production."""
    url = f"sqlite:///{(tmp_path / 'refresh.db').as_posix()}"
    upgrade_to_head(url)
    return sessionmaker(bind=create_engine(url))


def no_migrations():
    return None


def test_successful_run_is_recorded(session_factory):
    steps = [
        ("sync", lambda: SyncResult(fixtures=380, unknown_teams={"Real Zaragoza (ZAR)"})),
        ("predict", lambda: {"predictions": 660}),
    ]
    code = refresh.main(["--trigger", "schedule"], session_factory, steps, no_migrations)

    assert code == 0
    run = session_factory().query(RefreshRun).one()
    assert (run.trigger, run.status, run.step, run.error) == ("schedule", "succeeded", None, None)
    assert run.finished_at is not None
    assert run.details["sync"]["result"]["fixtures"] == 380
    assert run.details["sync"]["result"]["unknown_teams"] == ["Real Zaragoza (ZAR)"]
    assert run.details["predict"]["status"] == "succeeded"


def test_a_failing_step_does_not_stop_the_next_ones(session_factory):
    ran = []

    def sync_down():
        ran.append("sync")
        raise ConnectionError("football-data.org unreachable")

    steps = [
        ("sync", sync_down),
        ("predict", lambda: ran.append("predict") or {"predictions": 660}),
        ("weather", lambda: ran.append("weather") or {"rows": 20}),
    ]
    code = refresh.main([], session_factory, steps, no_migrations)

    assert code == 1 and ran == ["sync", "predict", "weather"]
    run = session_factory().query(RefreshRun).one()
    assert run.status == "failed" and run.error == "failed steps: sync"
    assert run.details["sync"]["error"].startswith("ConnectionError: football-data.org unreachable")
    assert run.details["weather"]["status"] == "succeeded"


def test_failed_migrations_stop_everything(session_factory):
    def broken_migrations():
        raise RuntimeError("bad migration")

    ran = []
    code = refresh.main([], session_factory, [("sync", lambda: ran.append("sync"))], broken_migrations)
    assert code == 1 and ran == []


def test_second_concurrent_run_is_refused(session_factory):
    db = session_factory()
    db.add(RefreshRun(trigger="button", status=RUNNING, started_at=datetime.now(UTC), details={}))
    db.commit()

    ran = []
    code = refresh.main([], session_factory, [("sync", lambda: ran.append("sync"))], no_migrations)
    assert code == 2 and ran == []
    assert session_factory().query(RefreshRun).count() == 1


def test_stale_lock_is_released(session_factory):
    db = session_factory()
    db.add(RefreshRun(trigger="cli", status=RUNNING, started_at=datetime.now(UTC) - timedelta(hours=1), details={}))
    db.commit()

    code = refresh.main([], session_factory, [("sync", lambda: {"fixtures": 1})], no_migrations)
    assert code == 0
    statuses = sorted(run.status for run in session_factory().query(RefreshRun).all())
    assert statuses == ["abandoned", "succeeded"]


def test_prod_refuses_to_write_to_sqlite(session_factory, monkeypatch):
    monkeypatch.setattr(refresh.settings, "app_env", "prod")
    monkeypatch.setattr(refresh.settings, "postgres_url", "sqlite://")
    ran = []
    assert refresh.main([], session_factory, [("sync", lambda: ran.append("sync"))], no_migrations) == 1
    assert ran == []


def test_summarize_makes_results_json_ready():
    assert refresh.summarize(SyncResult(fixtures=2, unknown_teams={"b", "a"})) == {
        "fixtures": 2,
        "created": 0,
        "changed": 0,
        "missing_fixtures": [],
        "source_last_updated": None,
        "skipped": 0,
        "unknown_statuses": 0,
        "unknown_teams": ["a", "b"],
    }
    assert refresh.summarize(None) is None
