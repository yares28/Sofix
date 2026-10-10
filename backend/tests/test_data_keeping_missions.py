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


def test_your_pick_can_settle_without_inventing_a_missing_sofix_forecast(db):
    payload = log([cand("a")], [])
    entry = payload["days"]["2026-10-06"]["limited"]
    entry["cands"][0].update(c={}, r={"played": True, "did": {}})
    entry["missions"][0].update(
        key="Pass",
        rule={"kind": "unsupported"},
        source={"title": "Pass", "description": "70+ accurate passes", "mode": "DECISIVE", "stats": ["accurate_pass"]},
        yours=[{"player": "a", "game": "Game:1", "status": "READY"}],
    )
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
                    "stats": [{"stat": "accurate_pass", "statValue": 75, "totalScore": 7.5}],
                }
            ]
        },
        NOW,
    )
    missions.settle_kept(db, NOW)
    db.commit()
    db.expire_all()
    stored = db.get(ReadModel, "missions_day:2026-10-06:limited").payload["days"]["2026-10-06"]["limited"]
    assert stored["cands"][0]["r"]["did"]["Pass"] is True
    assert stored["cands"][0]["c"] == {}
    assert stored["missions"][0]["sofix"] == []


def test_sofix_score_target_settles_from_its_captured_threshold_without_your_pick(db):
    payload = log([cand("a")], ["a"])
    entry = payload["days"]["2026-10-06"]["limited"]
    entry["cands"][0]["targets"] = {"Decisive Picker": 60}
    entry["missions"][0].update(rule={"kind": "score"}, yours=[])
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
                    "score": 65,
                }
            ]
        },
        NOW,
    )
    missions.settle_kept(db, NOW)
    db.commit()
    result = db.get(ReadModel, "missions_day:2026-10-06:limited").payload["days"]["2026-10-06"]["limited"]["cands"][0]
    assert result["r"]["did"]["Decisive Picker"] is True


def test_eligible_unrated_cards_settle_without_creating_forecasts(db):
    payload = log([cand("a")], [])
    entry = payload["days"]["2026-10-06"]["limited"]
    entry["cands"][0].update(c={}, eligible=["Decisive Picker"])
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
                    "stats": [{"stat": "goals", "statValue": 1}],
                }
            ]
        },
        NOW,
    )
    missions.settle_kept(db, NOW)
    db.commit()
    result = db.get(ReadModel, "missions_day:2026-10-06:limited").payload["days"]["2026-10-06"]["limited"]["cands"][0]
    assert result["c"] == {} and result["r"]["did"]["Decisive Picker"] is True


def test_unknown_target_stat_does_not_settle_as_failure(db):
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
                    "stats": [{"stat": "goals", "statValue": None}],
                }
            ]
        },
        NOW,
    )
    missions.settle_kept(db, NOW)
    result = db.get(ReadModel, "missions_day:2026-10-06:limited").payload["days"]["2026-10-06"]["limited"]["cands"][0]
    assert "r" not in result


def test_comparison_checks_the_chosen_game_when_a_player_has_two_results():
    a = cand("a")
    a["r"] = {"played": True, "did": {"Decisive Picker": False}}
    other = {**a, "g": "Game:2", "r": {"played": True, "did": {"Decisive Picker": True}}}
    payload = log([a, other], ["a"])
    entry = payload["days"]["2026-10-06"]["limited"]
    entry["missions"][0]["sofixPicks"] = [{"player": "a", "game": "Game:1"}]
    result = missions.record([payload])
    assert result["counted"] == 1 and result["success"] == 0 and result["caught"] == 0
