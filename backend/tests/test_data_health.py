from datetime import UTC, datetime, timedelta

from app.models import MatchOdds, PlayerAbsence, PlayerGame, ReadModel, RefreshRun
from app.services import data_health
from tests.test_pipeline import db  # noqa: F401

NOW = datetime(2026, 10, 9, 12, tzinfo=UTC)


def test_health_covers_every_kept_dataset_and_distinguishes_empty_from_unread(db):  # noqa: F811
    db.add(PlayerGame(player="one", game_id="past", date=NOW - timedelta(days=1), competition="LaLiga", read_at=NOW))
    db.add(PlayerGame(player="one", game_id="future", date=NOW + timedelta(days=5), competition="LaLiga", said_at=NOW))
    db.add(
        ReadModel(
            key="my_week:one", updated_at=NOW, payload={"end": "2026-10-01T14:00:00Z", "savedAt": NOW.isoformat()}
        )
    )
    db.commit()
    page = data_health.build(db, NOW)
    rows = {r["id"]: r for r in page["datasets"]}
    assert set(rows) == {"games", "odds", "forecasts", "absences", "weeks"}
    assert rows["games"]["count"] == 2 and rows["games"]["players"] == 1
    assert rows["games"]["newest"].startswith("2026-10-08")
    assert rows["games"]["lastRead"] == NOW.isoformat()
    assert rows["odds"]["newest"] is None and rows["odds"]["count"] == 0
    assert rows["weeks"]["count"] == 1 and rows["weeks"]["newest"].startswith("2026-10-01")
    data_health.publish(db, NOW)
    assert db.get(ReadModel, "data_health").payload == page


def test_source_failure_keeps_counts_and_warns_without_disclosing_raw_errors(db):  # noqa: F811
    db.add(
        MatchOdds(
            season="2026/27",
            date=NOW.date(),
            home="FCB",
            away="RMA",
            source="football-data.co.uk",
            hg=2,
            ag=1,
            odds_h=2.0,
            odds_d=3.0,
            odds_a=4.0,
            which="PSCH",
            read_at=NOW - timedelta(days=1),
        )
    )
    db.add(
        RefreshRun(
            trigger="cli",
            status="failed",
            started_at=NOW,
            details={
                "odds": {"status": "failed", "error": "secret URL must never reach the page"},
                "predict": {"status": "succeeded", "result": {"history_source": "stored matches"}},
            },
        )
    )
    db.commit()
    odds = next(r for r in data_health.build(db, NOW)["datasets"] if r["id"] == "odds")
    assert "football-data.co.uk" in " ".join(odds["warnings"])
    assert "The Odds API" in " ".join(odds["warnings"])
    assert "secret" not in str(odds)
    assert odds["count"] == 1 and odds["source"] == "football-data.co.uk (PSCH)"
    assert db.query(MatchOdds).one().read_at.replace(tzinfo=UTC) == NOW - timedelta(days=1)
    db.add(
        RefreshRun(
            trigger="cli",
            status="succeeded",
            started_at=NOW + timedelta(hours=7),
            details={
                "odds": {"status": "succeeded", "result": {"rows": 3}},
                "predict": {"status": "succeeded", "result": {"history_source": "CSV"}},
            },
        )
    )
    db.commit()
    assert next(r for r in data_health.build(db, NOW)["datasets"] if r["id"] == "odds")["warnings"] == []


def test_throttling_does_not_hide_an_unresolved_odds_outage(db):  # noqa: F811
    db.add_all(
        [
            RefreshRun(trigger="cli", status="failed", started_at=NOW, details={"odds": {"status": "failed"}}),
            RefreshRun(
                trigger="cli",
                status="succeeded",
                started_at=NOW + timedelta(hours=1),
                details={"odds": {"status": "succeeded", "result": {"skipped": "fetched 1.0 h ago"}}},
            ),
        ]
    )
    db.commit()
    assert next(r for r in data_health.build(db, NOW)["datasets"] if r["id"] == "odds")["warnings"]


def test_a_recorded_return_is_a_fresh_absence_read(db):  # noqa: F811
    db.add(
        PlayerAbsence(
            ff_id="123", kind="out", first_seen=NOW - timedelta(days=3), last_seen=NOW - timedelta(days=2), back=NOW
        )
    )
    db.commit()
    absence = next(r for r in data_health.build(db, NOW)["datasets"] if r["id"] == "absences")
    assert absence["newest"] == NOW.isoformat() and absence["lastRead"] == NOW.isoformat()
    assert absence["ongoing"] == 0


def test_refresh_publishes_health_even_without_sorare_data(db):  # noqa: F811
    from app.services.publish import publish_all

    publish_all(db)
    assert len(db.get(ReadModel, "data_health").payload["datasets"]) == 5
