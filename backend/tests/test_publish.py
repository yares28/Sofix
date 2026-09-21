"""Publishing the board for the web app (read_models) and pinging the app to reload it."""

from datetime import UTC, datetime

import httpx

from app.models import ReadModel, RefreshRun
from app.schemas import ApiResponse, FixtureGrid
from app.services import publish
from app.services.fixture_grid import build_fixture_grid
from tests.test_pipeline import db, seeded  # noqa: F401  (fixtures)


def test_grid_is_published_in_the_api_envelope(seeded):  # noqa: F811
    summary = publish.publish_grid(seeded)

    row = seeded.get(ReadModel, publish.GRID_KEY)
    assert row is not None
    body = ApiResponse[FixtureGrid].model_validate(row.payload)
    assert body.success and body.data is not None
    assert summary["teams"] == len(body.data.teams) == len(build_fixture_grid(seeded).teams)
    assert body.meta is not None


def test_publishing_again_replaces_the_row(seeded):  # noqa: F811
    publish.publish_grid(seeded, datetime(2026, 9, 1, tzinfo=UTC))
    publish.publish_grid(seeded, datetime(2026, 9, 2, tzinfo=UTC))

    rows = seeded.query(ReadModel).filter_by(key=publish.GRID_KEY).all()
    assert len(rows) == 1
    assert rows[0].updated_at.day == 2


def test_an_empty_database_publishes_a_clear_error(db):  # noqa: F811
    summary = publish.publish_grid(db)

    body = ApiResponse[FixtureGrid].model_validate(db.get(ReadModel, publish.GRID_KEY).payload)
    assert not body.success
    assert body.error == "No fixtures yet."
    assert summary["teams"] == 0


def test_system_keeps_the_last_known_odds_credits(db):  # noqa: F811
    started = datetime(2026, 9, 20, 12, 58, tzinfo=UTC)
    db.add(
        RefreshRun(
            trigger="cli",
            status="succeeded",
            started_at=started,
            details={"odds": {"status": "succeeded", "result": {"credits_remaining": 486}}},
        )
    )
    db.add(
        RefreshRun(
            trigger="button",
            status="succeeded",
            started_at=datetime(2026, 9, 20, 15, 16, tzinfo=UTC),
            details={"odds": {"status": "succeeded", "result": {"skipped": "fetched 2.3 h ago"}}},
        )
    )
    db.commit()

    payload = publish.publish_system(db)

    assert payload["odds_credits_remaining"] == 486
    assert payload["odds_credits_at"].startswith("2026-09-20T12:58")
    assert payload["database_bytes"] is None  # SQLite: only Postgres reports a size
    assert payload["database_limit_bytes"] == 512 * 1024 * 1024
    assert db.get(ReadModel, publish.SYSTEM_KEY).payload == payload


def test_notify_is_skipped_without_configuration():
    assert publish.notify_app("", "secret").startswith("skipped")
    assert publish.notify_app("https://sofix.example", "").startswith("skipped")


def test_notify_sends_the_secret_and_the_bypass_in_headers():
    seen = {}

    def handler(request: httpx.Request) -> httpx.Response:
        seen["url"] = str(request.url)
        seen["auth"] = request.headers.get("authorization")
        seen["bypass"] = request.headers.get("x-vercel-protection-bypass")
        return httpx.Response(200, json={"revalidated": True})

    with httpx.Client(transport=httpx.MockTransport(handler)) as client:
        outcome = publish.notify_app("https://sofix.example/", "s3cret", "byp4ss", client=client)

    assert outcome == "HTTP 200"
    assert seen == {"url": "https://sofix.example/api/revalidate", "auth": "Bearer s3cret", "bypass": "byp4ss"}


def test_notify_reports_a_network_failure_without_raising():
    def handler(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("offline")

    with httpx.Client(transport=httpx.MockTransport(handler)) as client:
        outcome = publish.notify_app("https://sofix.example", "s3cret", client=client)

    assert outcome == "failed: ConnectError"


def test_the_publishing_run_counts_as_the_last_sync(seeded):  # noqa: F811
    """The board is published while its own run is still open; the grid must not show the previous sync time."""
    started = datetime(2026, 9, 21, 15, 20, 50, tzinfo=UTC)
    seeded.add(
        RefreshRun(
            trigger="button",
            status="succeeded",
            started_at=datetime(2026, 9, 20, 15, 16, tzinfo=UTC),
            finished_at=datetime(2026, 9, 20, 15, 16, 16, tzinfo=UTC),
            details={"sync": {"status": "succeeded", "seconds": 3.0}},
        )
    )
    seeded.add(
        RefreshRun(
            trigger="cli",
            status="running",
            step="publish",
            started_at=started,
            details={"sync": {"status": "succeeded", "seconds": 3.0}},
        )
    )
    seeded.commit()

    publish.publish_grid(seeded)

    body = ApiResponse[FixtureGrid].model_validate(seeded.get(ReadModel, publish.GRID_KEY).payload)
    assert body.meta is not None
    assert body.meta.last_synced_at == datetime(2026, 9, 21, 15, 20, 53, tzinfo=UTC)
