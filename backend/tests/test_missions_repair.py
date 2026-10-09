from datetime import UTC, datetime

from app.models import ReadModel
from app.sorare import mission_pool, missions
from app.sorare.mission_pool import rolling_sheets
from app.sorare.missions import _rule, daily_entry, did
from tests.test_pipeline import db  # noqa: F401
from tests.test_sorare_publish import snapshot


def test_shot_and_tackle_targets_keep_the_imported_threshold_and_settle_the_same_rule():
    for kind, stat, count, words in [
        ("shot", "ontarget_scoring_att", 2, "shots on target"),
        ("tackle", "won_tackle", 3, "tackles"),
        ("interception", "interception_won", 2, "interceptions"),
    ]:
        source = {
            "title": kind,
            "description": f"Pick a player with {count}+ {words}",
            "mode": "DECISIVE",
            "stats": [stat],
        }
        rule = _rule(source)
        assert rule["kind"] == kind and rule["atLeast"] == count
        assert did(rule, [stat], {"stats": {stat: [count, 0]}})
        assert not did(rule, [stat], {"stats": {stat: [count - 1, 0]}})
        source.update(id=kind, picks=1)
        pool = {
            "complete": True,
            "players": [
                {
                    "card": "a-2026-limited-1",
                    "player": "a",
                    "name": "A",
                    "rarity": "limited",
                    "pos": "MID",
                    "pic": "",
                    "p": 1,
                    "games": [{"id": "g", "kickoff": "2026-10-09T19:00:00Z"}],
                }
            ],
            "sheets": {"players": {"a": {"season": {stat: [count, 0]}}}},
        }
        entry = daily_entry(None, [source], pool, "limited", datetime(2026, 10, 9, 12, tzinfo=UTC))
        assert entry["missions"][0]["sofix"] == ["a"]
        assert 0 < entry["cands"][0]["c"][kind] < 1


def test_rolling_sheet_keeps_shot_and_tackle_counts_for_the_recent_target_samples():
    data = {
        "a": [
            {
                "date": "2026-10-07T12:00:00Z",
                "status": "FINAL",
                "started": True,
                "played": True,
                "stats": {"ontarget_scoring_att": 2, "won_tackle": 3},
            }
        ]
    }
    result = rolling_sheets(data, {"a": "MID"}, datetime(2026, 10, 8, 12, tzinfo=UTC))
    assert result["players"]["a"]["last"][0][7:] == [2, 3]


def test_zero_rate_clue_target_does_not_take_the_only_card_from_a_positive_xp_target():
    tasks = [
        {
            "id": "shots",
            "title": "Shots",
            "description": "2+ shots on target for 1 Clue",
            "mode": "DECISIVE",
            "stats": ["ontarget_scoring_att"],
            "picks": 3,
        },
        {
            "id": "tackles",
            "title": "Tackles",
            "description": "3+ tackles for 300 XP",
            "mode": "DECISIVE",
            "stats": ["won_tackle"],
            "picks": 3,
        },
    ]
    pool = {
        "complete": True,
        "players": [
            {
                "player": "a",
                "name": "A",
                "rarity": "limited",
                "pos": "MID",
                "pic": "",
                "p": 1,
                "games": [{"id": "g", "kickoff": "2026-10-09T19:00:00Z"}],
            }
        ],
        "sheets": {"players": {"a": {"season": {"ontarget_scoring_att": [0, 0], "won_tackle": [2, 0]}}}},
    }
    result = daily_entry(None, tasks, pool, "limited", datetime(2026, 10, 9, 12, tzinfo=UTC))
    assert [m["sofix"] for m in result["missions"]] == [[], ["a"]]


def test_daily_forecast_keeps_separate_copies_and_uses_single_game_availability():
    now = datetime(2026, 10, 8, 12, tzinfo=UTC)
    pool = {
        "complete": True,
        "players": [
            {
                "card": card,
                "player": "a",
                "name": "A",
                "rarity": "limited",
                "pos": "MID",
                "pic": "",
                "p": 0.99,
                "pStart": 0.05,
                "pOn": 0.05,
                "games": [{"id": "g", "kickoff": "2026-10-08T19:00:00Z"}],
            }
            for card in ["copy-a", "copy-b"]
        ],
        "sheets": {"players": {"a": {"season": {"goals": [1, 0], "interception_won": [1, 0]}}}},
    }
    loaded = [
        {
            "id": "essence",
            "title": "Interceptions",
            "description": "Essence",
            "mode": "DECISIVE",
            "picks": 1,
            "thresholds": [{"stat": "interception_won", "min": 1}],
            "eligibleCards": {"g": ["copy-a"]},
        },
        {
            "id": "xp",
            "title": "Goals",
            "description": "XP",
            "mode": "DECISIVE",
            "picks": 1,
            "thresholds": [{"stat": "goals", "min": 1}],
            "eligibleCards": {"g": ["copy-b"]},
        },
    ]
    entry = daily_entry(None, loaded, pool, "limited", now)
    assert [m["sofix"] for m in entry["missions"]] == [["a"], ["a"]]
    assert [m["sofixPicks"][0]["card"] for m in entry["missions"]] == ["copy-a", "copy-b"]
    assert entry["cands"][0]["c"]["essence"] == 0.063


def test_imported_id_keeps_frozen_forecast_without_colliding_with_same_title():
    now = datetime(2026, 10, 8, 18, tzinfo=UTC)
    original = {
        "key": "Decisive Picker",
        "picks": 3,
        "mode": "DECISIVE",
        "description": "decisive",
        "rule": {"kind": "decisive"},
        "sofix": ["a"],
        "yours": [],
    }
    cand = {
        "s": "a",
        "g": "g",
        "k": "2026-10-08T17:00:00Z",
        "c": {"Decisive Picker": 0.3},
        "r": {"did": {"Decisive Picker": True}},
    }
    task = {"id": "task:1", "title": "Decisive Picker", "description": "decisive", "mode": "DECISIVE", "picks": 3}
    result = daily_entry({"missions": [original], "cands": [cand]}, [task], {"players": []}, "limited", now)
    assert result["cands"][0]["c"]["task:1"] == 0.3
    assert result["cands"][0]["r"]["did"]["task:1"] is True
    result = daily_entry(result, [{**task, "id": "task:2"}], {"players": []}, "limited", now)
    assert result["missions"][0]["sofix"] == []
    assert "task:2" not in result["cands"][0]["c"]


def test_unloaded_empty_day_is_retained_without_inventing_a_forecast():
    now = datetime(2026, 10, 8, 12, tzinfo=UTC)
    entry = daily_entry(None, None, {"players": [], "sheets": {"players": {}}}, "limited", now)
    assert entry["loaded"] is False
    assert entry["missions"][0]["title"] == "Decisive Picker"
    assert entry["missions"][0]["sofix"] == []


def test_live_game_on_first_capture_is_evidence_not_a_retroactive_forecast():
    now = datetime(2026, 10, 8, 18, tzinfo=UTC)
    pool = {
        "players": [
            {
                "player": "a",
                "name": "A",
                "rarity": "limited",
                "pos": "MID",
                "pic": "",
                "p": 1,
                "games": [{"id": "g", "kickoff": "2026-10-08T17:00:00+00:00"}],
            }
        ],
        "sheets": {"players": {}},
    }
    entry = daily_entry(None, None, pool, "limited", now)
    assert entry["cands"][0]["late"] is True
    assert entry["cands"][0]["c"] == {}
    assert entry["missions"][0]["sofix"] == []


def test_rolling_sheets_only_use_scored_starts_before_cutoff():
    rows = {
        "a": [
            {
                "date": "2026-10-07T12:00:00Z",
                "status": "FINAL",
                "started": True,
                "played": True,
                "score": 70,
                "stats": {"goals": 1, "interception_won": 2},
            },
            {"date": "2026-10-09T12:00:00Z", "status": "PENDING", "started": True, "stats": {"goals": 10}},
        ]
    }
    sheets = rolling_sheets(rows, {"a": "MID"}, datetime(2026, 10, 8, 12, tzinfo=UTC))
    assert sheets["players"]["a"]["starts"] == 1
    assert sheets["players"]["a"]["last"][0][4:7] == [2, 0, 1]
    assert sheets["players"]["a"]["decAll"] == 1


def test_pool_includes_active_gameweek_and_card_identity_without_so5_exclusions():
    data = snapshot()
    data["missionAliases"] = ["plan", "live0"]
    for c in data["cards"]:
        c["player"]["live0"] = [{**c["player"]["plan"][0], "id": "live", "date": "2026-10-08T19:00:00Z"}]
    pool = mission_pool.build(data, datetime(2026, 10, 8, 12, tzinfo=UTC))
    assert len(pool["players"]) == len(data["cards"])
    sealed = next(p for p in pool["players"] if p["card"] == "sealed-one")
    assert sealed["eligibility"] == "sealed"
    assert any(g["id"] == "live" for g in pool["players"][0]["games"])


def test_daily_capture_copies_legacy_and_fills_gaps_idempotently(db):  # noqa: F811
    now = datetime(2026, 10, 8, 12, tzinfo=UTC)
    legacy = {
        "days": {
            "2026-10-06": {
                "limited": {
                    "loaded": True,
                    "missions": [
                        {
                            "key": "Decisive Picker",
                            "picks": 3,
                            "mode": "DECISIVE",
                            "description": "",
                            "stats": [],
                            "rule": {"kind": "decisive"},
                            "sofix": [],
                            "yours": [{"player": "oblak", "status": "FAILURE"}],
                        }
                    ],
                    "cands": [],
                }
            },
            "2026-10-07": {},
        }
    }
    db.add(ReadModel(key="missions_log:2026-10", payload=legacy, updated_at=now))
    db.commit()
    pool = {
        "players": [{"rarity": "limited", "player": "a", "name": "A", "pos": "MID", "pic": "", "games": []}],
        "sheets": {},
        "complete": True,
    }
    missions.capture(db, pool, now)
    db.commit()
    missions.capture(db, pool, now)
    db.commit()
    assert db.get(ReadModel, "missions_log:2026-10").payload == legacy
    copied = db.get(ReadModel, "missions_day:2026-10-06:limited").payload
    assert copied["days"]["2026-10-06"]["limited"]["missions"][0]["yours"][0]["player"] == "oblak"
    days = missions.logs_of(db)[0]["days"]
    assert sorted(days) == ["2026-10-06", "2026-10-07", "2026-10-08"]
    assert days["2026-10-07"]["limited"]["loaded"] is False
    assert days["2026-10-07"]["limited"]["missions"][0]["sofix"] == []
