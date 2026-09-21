"""Owner refresh endpoints: token, cooldown, lock, and handing the run to the refresh process."""

from datetime import UTC, datetime, timedelta

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.config import Settings
from app.db import get_db
from app.jobs import refresh
from app.main import create_app
from app.migrate import upgrade_to_head
from app.models import RUNNING, RefreshRun

TOKEN = "t" * 40


@pytest.fixture()
def session_factory(tmp_path):
    url = f"sqlite:///{(tmp_path / 'admin.db').as_posix()}"
    upgrade_to_head(url)  # the partial unique index that acts as the lock
    return sessionmaker(bind=create_engine(url))


def make_client(session_factory, token=TOKEN, launcher=None):
    launched: list[int] = []
    app = create_app(Settings(app_env="prod", refresh_token=token), launcher=launcher or launched.append)

    def override():
        db = session_factory()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override
    return TestClient(app, raise_server_exceptions=False), launched


AUTH = {"Authorization": f"Bearer {TOKEN}"}


def add_run(session_factory, status, started_ago, trigger="cli"):
    db = session_factory()
    started = datetime.now(UTC) - started_ago
    finished = None if status == RUNNING else started + timedelta(seconds=10)
    run = RefreshRun(trigger=trigger, status=status, started_at=started, finished_at=finished, details={})
    db.add(run)
    db.commit()
    run_id = run.id
    db.close()
    return run_id


def test_token_is_required_and_compared(session_factory):
    client, launched = make_client(session_factory)
    assert client.post("/api/admin/refresh").status_code == 401
    wrong = client.post("/api/admin/refresh", headers={"Authorization": "Bearer " + "x" * 40})
    assert wrong.status_code == 401 and wrong.json() == {
        "success": False,
        "data": None,
        "error": "Not authorised.",
        "meta": None,
    }
    assert client.get("/api/admin/refresh/latest", headers={"Authorization": TOKEN}).status_code == 401
    assert launched == []


def test_short_or_missing_token_keeps_the_endpoint_off(session_factory):
    for token in ("", "short-token"):
        client, launched = make_client(session_factory, token=token)
        response = client.post("/api/admin/refresh", headers={"Authorization": f"Bearer {token}"})
        assert response.status_code == 503 and launched == []


def test_start_takes_the_lock_and_launches_the_job(session_factory):
    client, launched = make_client(session_factory)
    response = client.post("/api/admin/refresh", headers=AUTH)

    assert response.status_code == 202
    body = response.json()["data"]
    assert body["run"]["status"] == "running" and body["run"]["trigger"] == "button"
    assert 590 <= body["retry_after"] <= 600
    assert launched == [body["run"]["id"]]
    assert response.headers["cache-control"] == "no-store"

    second = client.post("/api/admin/refresh", headers=AUTH)
    assert second.status_code == 409 and second.json()["data"]["run"]["id"] == body["run"]["id"]
    assert launched == [body["run"]["id"]]


def test_cooldown_after_any_recent_run(session_factory):
    add_run(session_factory, "failed", timedelta(minutes=4), trigger="schedule")
    client, launched = make_client(session_factory)
    response = client.post("/api/admin/refresh", headers=AUTH)

    assert response.status_code == 429 and launched == []
    retry_after = response.json()["data"]["retry_after"]
    assert 355 <= retry_after <= 360
    assert response.headers["retry-after"] == str(retry_after)


def test_cooldown_over_allows_a_new_run(session_factory):
    add_run(session_factory, "succeeded", timedelta(minutes=11))
    client, launched = make_client(session_factory)
    assert client.post("/api/admin/refresh", headers=AUTH).status_code == 202
    assert len(launched) == 1


def test_stale_running_row_does_not_block_forever(session_factory):
    stale_id = add_run(session_factory, RUNNING, timedelta(hours=2))
    client, launched = make_client(session_factory)
    latest = client.get("/api/admin/refresh/latest", headers=AUTH).json()["data"]
    assert latest["run"]["id"] == stale_id and latest["run"]["status"] == "abandoned"
    assert client.post("/api/admin/refresh", headers=AUTH).status_code == 202


class FakeProcess:
    def __init__(self):
        self.code = None

    def poll(self):
        return self.code


def test_a_killed_job_fails_the_run_on_the_next_poll(session_factory):
    process = FakeProcess()
    client, _ = make_client(session_factory, launcher=lambda run_id: process)
    run_id = client.post("/api/admin/refresh", headers=AUTH).json()["data"]["run"]["id"]

    assert client.get("/api/admin/refresh/latest", headers=AUTH).json()["data"]["run"]["status"] == "running"
    process.code = 1  # e.g. terminated from outside, before it could record anything
    run = client.get("/api/admin/refresh/latest", headers=AUTH).json()["data"]["run"]
    assert (run["id"], run["status"], run["error"]) == (
        run_id,
        "failed",
        "refresh process exited unexpectedly (code 1)",
    )


def test_a_job_that_finished_its_run_is_not_marked_failed(session_factory):
    process = FakeProcess()
    client, _ = make_client(session_factory, launcher=lambda run_id: process)
    run_id = client.post("/api/admin/refresh", headers=AUTH).json()["data"]["run"]["id"]
    db = session_factory()
    run = db.get(RefreshRun, run_id)
    run.status, run.finished_at = "succeeded", datetime.now(UTC)
    db.commit()
    db.close()
    process.code = 0
    assert client.get("/api/admin/refresh/latest", headers=AUTH).json()["data"]["run"]["status"] == "succeeded"


def test_launch_failure_marks_the_run_failed(session_factory):
    def broken_launcher(run_id):
        raise OSError("python not found")

    client, _ = make_client(session_factory, launcher=broken_launcher)
    response = client.post("/api/admin/refresh", headers=AUTH)
    assert response.status_code == 500 and response.json()["error"] == "Could not start the refresh."
    run = session_factory().query(RefreshRun).one()
    assert run.status == "failed" and run.error == "could not start the refresh process"


def test_latest_reports_step_statuses_without_error_details(session_factory):
    db = session_factory()
    db.add(
        RefreshRun(
            trigger="button",
            status="failed",
            started_at=datetime.now(UTC) - timedelta(minutes=30),
            finished_at=datetime.now(UTC) - timedelta(minutes=29),
            error="failed steps: sync",
            details={
                "sync": {"status": "failed", "error": "ConnectError: internal detail"},
                "predict": {"status": "succeeded", "result": {"predictions": 660}},
            },
        )
    )
    db.commit()
    client, _ = make_client(session_factory)
    response = client.get("/api/admin/refresh/latest", headers=AUTH)
    data = response.json()["data"]
    assert data["run"]["steps"] == {"sync": "failed", "predict": "succeeded"}
    assert data["retry_after"] == 0
    assert "internal detail" not in response.text


def test_latest_with_no_runs(session_factory):
    client, _ = make_client(session_factory)
    assert client.get("/api/admin/refresh/latest", headers=AUTH).json()["data"] == {"run": None, "retry_after": 0}


# ---------------------------------------------------------------- the job side of the hand-off


def no_migrations():
    return None


def test_job_adopts_the_run_the_api_created(session_factory):
    run_id = add_run(session_factory, RUNNING, timedelta(seconds=1), trigger="button")
    steps = [("sync", lambda: {"fixtures": 380})]
    code = refresh.main(
        ["--run-id", str(run_id), "--skip-migrations"], session_factory, steps, no_migrations, no_migrations
    )

    assert code == 0
    run = session_factory().query(RefreshRun).one()
    assert (run.id, run.trigger, run.status) == (run_id, "button", "succeeded")


def test_job_refuses_a_run_that_is_not_running(session_factory):
    run_id = add_run(session_factory, "succeeded", timedelta(minutes=1))
    ran = []
    code = refresh.main(["--run-id", str(run_id)], session_factory, [("sync", lambda: ran.append(1))], no_migrations)
    assert code == 1 and ran == []


def test_skip_migrations_checks_the_schema_and_records_why_it_stopped(session_factory):
    run_id = add_run(session_factory, RUNNING, timedelta(seconds=1), trigger="button")
    migrated = []

    def schema_behind():
        raise RuntimeError("database is at abc, code expects def")

    code = refresh.main(
        ["--run-id", str(run_id), "--skip-migrations"],
        session_factory,
        [("sync", lambda: {"fixtures": 1})],
        lambda: migrated.append(1),
        schema_behind,
    )
    assert code == 1 and migrated == []
    run = session_factory().query(RefreshRun).one()
    assert run.status == "failed" and run.error.startswith("schema check failed: RuntimeError: database is at abc")


def test_failed_predict_keeps_the_previous_predictions(session_factory):
    """A step that raises mid-way leaves the last good predictions in place (nothing half-replaced)."""
    from app.jobs import predict
    from app.jobs.seed_and_sync import sync
    from app.models import Fixture, Prediction
    from tests.test_rollover_and_freshness import CLUBS, fdo_match

    fcb, rma = CLUBS["FCB"][0], CLUBS["RMA"][0]
    sync({"matches": [fdo_match(1, fcb, rma, "2099-08-15T19:00:00Z")]}, session_factory=session_factory)
    db = session_factory()
    fixture = db.query(Fixture).one()
    for team_id in (fixture.home_team_id, fixture.away_team_id):
        db.add(
            Prediction(
                fixture_id=fixture.id,
                perspective_team_id=team_id,
                prediction_ts=datetime.now(UTC),
                model_version="old",
                p_win=0.4,
                p_draw=0.3,
                p_loss=0.3,
                expected_points=1.5,
                difficulty_score=50.0,
                difficulty_label="Even",
            )
        )
    db.commit()
    db.close()

    def offline(*args, **kwargs):
        raise ConnectionError("football-data.co.uk unreachable")

    def step():
        db = session_factory()
        try:
            return predict.predict_upcoming(db, datetime.now(UTC), load=offline)
        finally:
            db.close()

    assert refresh.main([], session_factory, [("predict", step)], no_migrations) == 1
    assert session_factory().query(Prediction).filter_by(model_version="old").count() == 2


def test_schema_check_passes_on_a_migrated_database(tmp_path):
    from app.migrate import SchemaBehind, ensure_schema_current

    url = f"sqlite:///{(tmp_path / 'check.db').as_posix()}"
    with pytest.raises(SchemaBehind):
        ensure_schema_current(url)
    upgrade_to_head(url)
    ensure_schema_current(url)
