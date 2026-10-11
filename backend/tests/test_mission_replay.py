import copy
from datetime import UTC, datetime

from app.models import ReadModel
from app.sorare import missions, player_games
from app.sorare.mission_replay import needed, reconstruct
from tests.test_pipeline import db  # noqa: F401


def test_missing_legacy_pass_and_best_choices_are_rebuilt_without_changing_captured_forecasts():
    day = "2026-10-10"
    tasks = [
        {
            "id": kind,
            "title": kind,
            "description": reward,
            "mode": "DECISIVE",
            "picks": 1,
            "thresholds": [{"stat": stat, "min": threshold}],
        }
        for kind, reward, stat, threshold in [
            ("xp", "200 XP", "goals", 1),
            ("clue", "1 clue", "ontarget_scoring_att", 1),
            ("essence", "50 Essence", "accurate_pass", 70),
        ]
    ]
    entry = {
        "loaded": True,
        "coverage": "snapshot",
        "missions": [
            {
                "key": t["id"],
                "source": t,
                "title": t["title"],
                "description": t["description"],
                "mode": t["mode"],
                "picks": 1,
                "sofix": ["a"] if t["id"] == "xp" else [],
                "yours": [],
                "stats": [],
                "rule": {"kind": "goal"},
            }
            for t in tasks
        ],
        "cands": [
            {
                "s": slug,
                "n": slug.upper(),
                "pos": "MID",
                "pic": "",
                "card": slug + "-card",
                "g": "g",
                "k": day + "T19:00:00Z",
                "c": {"xp": 0.9},
                "r": {"did": {"xp": True}},
                "match": {
                    "id": "g",
                    "kickoff": day + "T19:00:00Z",
                    "competition": "laliga-es",
                    "pStart": 0.9,
                    "pOn": 0,
                    "availabilityKnown": True,
                },
            }
            for slug in ["a", "b", "c"]
        ],
    }
    history = {
        slug: {
            "games": [
                {
                    "gameId": str(i),
                    "date": f"2026-10-0{i}T19:00:00+00:00",
                    "status": "FINAL",
                    "played": True,
                    "started": True,
                    "stats": {
                        "accurate_pass": 75 if slug == "a" and i == 1 else 40,
                        "goals": 1,
                        "ontarget_scoring_att": 1,
                    },
                    "competition": "laliga-es",
                }
                for i in range(1, 8)
            ]
            + [
                {
                    "gameId": "result",
                    "date": day + "T19:00:00+00:00",
                    "status": "FINAL",
                    "played": True,
                    "started": True,
                    "stats": {"accurate_pass": 500, "goals": 100},
                }
            ]
        }
        for slug in ["a", "b", "c"]
    }
    before = copy.deepcopy(entry)
    result = reconstruct(entry, history, "limited", day, datetime(2026, 10, 11, tzinfo=UTC))
    assert entry == before
    assert result["reconstructed"] is True
    assert result["missions"][2]["sofix"] == ["a"]  # Essence wins over the much bigger goal chance
    assert result["cands"][0]["c"]["xp"] > result["cands"][0]["c"]["essence"] > 0
    assert all(m["bestPicks"] for m in result["missions"])
    assert len({p["card"] for m in result["missions"] for p in m["sofixPicks"]}) == 3
    assert result["cands"][0]["sheet"]["form"]["windows"]["l10"]["means"]["accurate_pass"] == 45
    assert "r" not in result["cands"][0]  # outcomes are settled independently after ranking


def test_replay_does_not_turn_post_kickoff_availability_into_a_pre_game_forecast():
    entry = {
        "loaded": True,
        "coverage": "snapshot",
        "missions": [],
        "cands": [
            {
                "s": "a",
                "n": "A",
                "pic": "",
                "pos": "MID",
                "g": "g",
                "k": "2026-10-10T19:00:00Z",
                "c": {},
                "late": True,
                "match": {"id": "g", "kickoff": "2026-10-10T19:00:00Z", "pStart": 1, "pOn": 0},
            }
        ],
    }
    for late in (True, False):
        # No capture time is not evidence that a 100% estimate existed before kickoff either.
        entry["cands"][0]["late"] = late
        result = reconstruct(entry, {}, "limited", "2026-10-10", datetime(2026, 10, 11, tzinfo=UTC))
        assert result["cands"][0]["match"]["availabilityKnown"] is False
        assert "pStart" not in result["cands"][0]["match"]


def test_refresh_publishes_and_settles_a_reconstruction_without_backfilling_the_audit(db):  # noqa: F811
    at = datetime(2026, 10, 11, 23, tzinfo=UTC)
    task = {
        "id": "passes",
        "title": "Pass",
        "description": "70+ accurate passes for 50 Essence",
        "mode": "DECISIVE",
        "picks": 1,
        "stats": ["accurate_pass"],
        "appearances": [{"player": "a", "game": "g", "rarity": "limited", "status": "SUCCESS"}],
    }
    original = {
        "loaded": True,
        "coverage": "snapshot",
        "missions": [
            {
                "key": "passes",
                "source": task,
                "title": "Pass",
                "description": task["description"],
                "mode": "DECISIVE",
                "rule": {"kind": "pass", "atLeast": 70},
                "stats": ["accurate_pass"],
                "picks": 1,
                "sofix": [],
                "yours": task["appearances"],
            }
        ],
        "cands": [
            {
                "s": "a",
                "n": "A",
                "pos": "MID",
                "pic": "",
                "card": "a-copy",
                "g": "g",
                "k": "2026-10-10T19:00:00Z",
                "c": {},
            }
        ],
    }
    key = "missions_day:2026-10-10:limited"
    db.add(ReadModel(key=key, payload={"days": {"2026-10-10": {"limited": original}}}, updated_at=at))
    player_games.save(
        db,
        {
            "a": [
                {
                    "gameId": f"past-{i}",
                    "date": f"2026-10-0{i}T19:00:00Z",
                    "competition": "laliga-es",
                    "status": "FINAL",
                    "played": True,
                    "started": True,
                    "stats": [{"stat": "accurate_pass", "statValue": 80}],
                }
                for i in range(1, 8)
            ]
            + [
                {
                    "gameId": "g",
                    "date": "2026-10-10T19:00:00Z",
                    "competition": "laliga-es",
                    "status": "FINAL",
                    "played": True,
                    "started": True,
                    "stats": [{"stat": "accurate_pass", "statValue": 75}],
                }
            ]
        },
        at,
    )
    missions.settle_kept(db, at)
    db.commit()
    entry = db.get(ReadModel, key).payload["days"]["2026-10-10"]["limited"]
    assert entry["missions"][0]["sofix"] == []
    assert entry["replay"]["missions"][0]["sofix"] == ["a"]
    assert entry["replay"]["cands"][0]["r"]["did"]["passes"] is True
    assert missions.record([{"days": {"2026-10-10": {"limited": entry}}}])["counted"] == 0
    first = copy.deepcopy(entry)
    missions.settle_kept(db, at)
    db.commit()
    assert db.get(ReadModel, key).payload["days"]["2026-10-10"]["limited"] == first


def test_a_late_card_does_not_replace_an_existing_dated_benchmark_with_a_reconstruction():
    candidate = {"s": "a", "n": "A", "pos": "MID", "k": "2026-10-10T19:00:00Z"}
    entry = {
        "missions": [{"key": "pass", "description": "70+ accurate passes", "mode": "DECISIVE", "picks": 3}],
        "cands": [
            {**candidate, "sheet": {"form": {"before": "2026-10-10T08:00:00Z"}}},
            {**candidate, "s": "late-player", "late": True},
        ],
    }
    assert not needed(entry, datetime(2026, 10, 11, tzinfo=UTC))
