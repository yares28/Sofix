# ruff: noqa: F811
from datetime import UTC, datetime

from app.models import ReadModel
from app.services.publish import put
from app.sorare import mission_pool, missions, player_games
from tests.test_pipeline import db  # noqa: F401
from tests.test_player_audit import cand, log

NOW = datetime(2026, 10, 9, tzinfo=UTC)


def test_mission_pool_reads_saved_detailed_stats_without_changing_old_count_format():
    game = {"date": "2026-10-07T19:00:00Z", "status": "FINAL", "played": True, "started": True, "score": 60}
    stats = {"goals": 1, "interception_won": 2}
    old = mission_pool.rolling_sheets({"a": [{**game, "stats": stats}]}, {"a": "MID"}, NOW)
    kept = mission_pool.rolling_sheets(
        {
            "a": [
                {
                    **game,
                    "stats": [{"stat": key, "statValue": value, "totalScore": 2} for key, value in stats.items()]
                    + [{"stat": "_context", "pos": "MID"}],
                }
            ]
        },
        {"a": "MID"},
        NOW,
    )
    assert kept == old


def test_kept_settlement_updates_daily_ledger_and_leaves_copied_legacy_untouched(db):
    payload = log([cand("a")], ["a"])
    put(db, "missions_log:2026-10", payload, NOW)
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
                    "stats": [{"stat": "goals", "statValue": 1, "totalScore": 25}],
                }
            ]
        },
        NOW,
    )
    missions.settle_kept(db, NOW)
    db.commit()
    db.expire_all()
    daily = db.get(ReadModel, "missions_day:2026-10-06:limited").payload
    assert daily["days"]["2026-10-06"]["limited"]["cands"][0]["r"]["did"]["Decisive Picker"] is True
    assert db.get(ReadModel, "missions_log:2026-10").payload == payload
