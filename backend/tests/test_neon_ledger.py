"""The Neon ledger: who reads how much from Neon, written down by each job (plans/neon-write-mostly.md, step 1)."""

from __future__ import annotations

from datetime import UTC, datetime

from app.services import neon_ledger

NOW = datetime(2026, 10, 27, 7, 30, tzinfo=UTC)


def test_a_read_is_named_by_its_table_and_for_a_page_block_by_the_blocks_kind() -> None:
    block = "SELECT read_models.payload FROM read_models WHERE read_models.key = %(key_1)s"
    assert neon_ledger.label_of(block, {"key_1": "audit_players:2026-10"}) == "read_models:audit_players"
    assert neon_ledger.label_of(block, {"key_1": "grid"}) == "read_models:grid"
    assert neon_ledger.label_of("SELECT fixtures.id, fixtures.kickoff\nFROM fixtures JOIN teams ON x", {}) == "fixtures"
    assert neon_ledger.label_of("INSERT INTO odds (a) VALUES (%(a)s)", {"a": 1}) == "write"


def test_the_row_names_the_run_keeps_its_key_short_and_lists_the_biggest_readers_first() -> None:
    env = {
        "GITHUB_RUN_ID": "40339981788",
        "GITHUB_RUN_ATTEMPT": "2",
        "GITHUB_WORKFLOW": "Scheduled refresh",
        "GITHUB_JOB": "refresh",
    }
    labels = {f"t{i}": i * 1000 for i in range(20)}
    key, payload = neon_ledger.row(sum(labels.values()), labels, env, NOW, pid=4321, command="/x/app/jobs/refresh.py")

    assert key.startswith("neon_ledger:20261027:40339981788") and len(key) <= 64
    assert (
        payload["workflow"] == "Scheduled refresh"
        and payload["job"] == "refresh"
        and payload["command"] == "refresh.py"
    )
    assert payload["bytes"] == sum(labels.values()) and payload["at"] == NOW.isoformat()
    assert list(payload["top"])[:2] == ["t19", "t18"] and len(payload["top"]) == neon_ledger.TOP


def test_a_run_outside_github_is_named_local() -> None:
    key, payload = neon_ledger.row(10, {"grid": 10}, {}, NOW, pid=7, command="python")
    assert key == "neon_ledger:20261027:local-7" and payload["workflow"] == "local"


def test_the_row_is_written_with_a_1970_write_time_and_a_failure_is_swallowed() -> None:
    import json

    from sqlalchemy import create_engine, text

    engine = create_engine("sqlite://")
    with engine.begin() as conn:
        conn.execute(text("CREATE TABLE read_models (key VARCHAR(64) PRIMARY KEY, payload JSON, updated_at TIMESTAMP)"))
    neon_ledger.write(engine, 1234, {"read_models:grid": 1234})
    with engine.connect() as conn:
        key, payload, at = conn.execute(text("SELECT key, payload, updated_at FROM read_models")).one()
    assert key.startswith("neon_ledger:") and json.loads(payload)["bytes"] == 1234 and str(at).startswith("1970")

    neon_ledger.write(create_engine("sqlite://"), 1, {})  # no table: nothing raised


def test_the_report_adds_a_day_up_by_who_and_by_reader() -> None:
    rows = [
        (
            "a",
            {
                "workflow": "Check player scores",
                "command": "score_checks.py",
                "bytes": 30_000_000,
                "top": {"read_models:audit": 25_000_000},
            },
        ),
        (
            "b",
            {
                "workflow": "Check player scores",
                "command": "score_checks.py",
                "bytes": 10_000_000,
                "top": {"read_models:audit": 5_000_000},
            },
        ),
        ("c", {"workflow": "web", "job": "vercel fra1", "bytes": 2_000_000, "top": {"read_models:grid": 2_000_000}}),
    ]
    text = neon_ledger.report(rows)
    assert text.startswith("42.0 MB in 3 rows")
    assert "| Check player scores · score_checks.py | 2 | 40.0 |" in text and "| read_models:audit | 30.0 |" in text
