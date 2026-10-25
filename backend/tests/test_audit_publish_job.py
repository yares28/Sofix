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


def test_scheduled_publication_settles_missions_and_new_imports_wake_an_idle_job(db, monkeypatch):  # noqa: F811
    from app.sorare import player_games
    from tests.test_sorare_missions import NOW, cand, log

    payload = log([cand("a")], ["a"])
    put(db, "missions_day:2026-10-06:limited", payload, NOW)
    player_games.save(
        db,
        {
            "a": [
                {
                    "gameId": "Game:1",
                    "date": "2026-10-06T19:00:00Z",
                    "competition": "laliga-es",
                    "status": "FINAL",
                    "played": True,
                    "started": True,
                    "stats": [{"stat": "goals", "statValue": 1}],
                }
            ]
        },
        NOW,
    )
    audit.publish(db, NOW)
    page = db.get(ReadModel, "audit").payload
    assert page["missions"]["overview"]["rows"][0]["sofix"] == 1
    assert not audit.settlement_due(db, NOW + timedelta(minutes=1))
    put(db, "missions_edit:new", {"day": "2026-10-06", "rarity": "limited", "edits": {}}, NOW + timedelta(minutes=2))
    assert audit.settlement_due(db, NOW + timedelta(minutes=3))


def test_owner_only_week_finalizes_automatically_at_its_boundary_without_a_browser(db, monkeypatch):  # noqa: F811
    from tests.test_frozen_scores import END

    early = END + timedelta(hours=1)
    put(
        db,
        "my_week:owner-only",
        {
            "number": 1,
            "end": END.isoformat(),
            "lineups": [
                {"id": "mine", "result": {"score": 0, "rank": 1}},
            ],
        },
        early,
    )
    audit.publish(db, early)
    first = db.get(ReadModel, "audit").payload
    assert first["strategies"]["you"]["scored"] == 1
    assert first["nextSettlementAt"] == (END + timedelta(days=1)).isoformat()

    class Clock:
        @staticmethod
        def now(_):
            return END + timedelta(days=1)

    monkeypatch.setattr(job, "datetime", Clock)
    monkeypatch.setattr(job, "SessionLocal", lambda: nullcontext(db))
    monkeypatch.setattr(job, "notify_app", lambda *_: None)
    monkeypatch.setattr(
        "app.sorare.client.SorareClient.__init__", lambda *_: (_ for _ in ()).throw(AssertionError("No source calls"))
    )
    assert job.main() == 0
    final = db.get(ReadModel, "audit").payload
    assert final["strategies"]["weeks"][0]["final"]
    assert final["strategies"]["you"]["scored"] == 1
    assert final["strategies"]["you"]["points"] == 0
    assert job.main() == 0
    assert db.get(ReadModel, "audit").payload == final
