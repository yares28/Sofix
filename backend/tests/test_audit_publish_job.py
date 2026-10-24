from contextlib import nullcontext
from datetime import timedelta
from pathlib import Path

from app.jobs import audit as job
from app.models import ReadModel
from app.services.publish import put
from app.sorare import audit
from tests.test_pipeline import db  # noqa: F401
from tests.test_player_audit import LOCK, keep


def test_cooldown_publication_updates_source_competitions_without_source_calls(db, monkeypatch):  # noqa: F811
    keep(db)
    early = LOCK + timedelta(days=1, hours=4)
    put(db, "audit", {"settlementVersion": 2, "nextSettlementAt": (early + timedelta(days=4)).isoformat()}, early)

    class Clock:
        @staticmethod
        def now(_):
            return early

    def forbidden(*args, **kwargs):
        raise AssertionError("Publication must use saved rows without opening a Sorare client")

    notified = []
    monkeypatch.setattr(job, "datetime", Clock)
    monkeypatch.setattr(job, "SessionLocal", lambda: nullcontext(db))
    monkeypatch.setattr(job, "notify_app", lambda *args: notified.append(True))
    monkeypatch.setattr("app.sorare.client.SorareClient.__init__", forbidden)
    assert job.main() == 0
    page = db.get(ReadModel, "audit").payload
    ff = page["starts"]["live"]["futbolfantasy"]
    assert page["settlementVersion"] == audit.SETTLEMENT_VERSION
    assert ff["settled"] == 2 and ff["byCompetition"][0]["settled"] == 2
    assert ff["state"] == "enough" and ff["right"] == 1.0
    assert ff["byCompetition"][0]["right"] == 1.0
    assert page["xscore"]["live"]["marked"] == 0
    stamp = db.get(ReadModel, "audit").updated_at
    monkeypatch.setattr(audit, "publish", forbidden)
    assert job.main() == 0
    assert db.get(ReadModel, "audit").updated_at == stamp
    assert notified == [True]


def test_recent_refresh_fallback_also_runs_saved_audit_publication():
    workflow = (Path(__file__).resolve().parents[2] / ".github/workflows/refresh.yml").read_text(encoding="utf-8")
    fallback = workflow.split("  fdr-bootstrap:", 1)[1]
    assert "needs.gate.outputs.run != 'true'" in fallback
    assert "python -m app.jobs.neon_switch" in fallback
    assert "python -m app.jobs.audit" in fallback
