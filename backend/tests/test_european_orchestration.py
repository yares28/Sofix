from datetime import UTC, datetime, timedelta

from app.jobs import refresh, sorare
from app.sorare import foreign_scores


def test_refresh_builds_one_pooled_european_fit_before_sorare():
    names = [name for name, _ in refresh.default_steps()]
    assert names.count("fdr_europe") == 1


def test_full_coverage_job_has_time_to_publish_without_stealing_an_active_lock():
    from pathlib import Path

    from app.services.refresh_runs import STALE_AFTER

    workflow = (Path(__file__).resolve().parents[2] / ".github/workflows/refresh.yml").read_text(encoding="utf-8")
    assert "timeout-minutes: 25" in workflow
    assert timedelta(minutes=25) < STALE_AFTER


def test_european_grids_require_recent_full_main_stage_identity_and_matching_artifact():
    now = datetime(2026, 10, 23, tzinfo=UTC)
    grid = {
        "competition": "CL",
        "model_version": foreign_scores.expected_version("CL"),
        "teams": [{"sorare_slug": f"club-{i}"} for i in range(36)],
    }
    envelope = {"data": grid, "meta": {"last_predicted_at": now.isoformat()}}
    grids, models, clubs = sorare.foreign_inputs({"grid:CL": envelope}, now)
    assert "CL" in models and grids["CL"]["_fresh"] is True and len(clubs["CL"]) == 36
    envelope["meta"]["last_predicted_at"] = (now - timedelta(hours=7)).isoformat()
    assert "CL" not in sorare.foreign_inputs({"grid:CL": envelope}, now)[1]
    envelope["meta"]["last_predicted_at"] = now.isoformat()
    grid["teams"].pop()
    assert "CL" not in sorare.foreign_inputs({"grid:CL": envelope}, now)[1]
    assert "CONF" not in models
