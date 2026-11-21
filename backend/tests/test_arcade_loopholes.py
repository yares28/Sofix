"""Arcade loopholes and post-mortems (plans/arcade-trust.md step 12)."""

from datetime import UTC, datetime, timedelta

from app.sorare import arcade_loopholes as h

KICK = datetime(2026, 11, 28, 17, 30, tzinfo=UTC)
ms = lambda d: int(d.timestamp() * 1000)  # noqa: E731


def test_a_cancelled_insurance_lineup_is_judged_by_the_steps_lineups_left_either_side_of_it():
    log = {
        "lineups": {"I1": {"step": 4, "result": "cancelled", "resultAt": ms(KICK + timedelta(hours=3))}},
        "history": [
            {"at": ms(KICK - timedelta(hours=1)), "step": 4, "remaining": 2},
            {"at": ms(KICK + timedelta(hours=4)), "step": 4, "remaining": 2},
        ],
    }
    out = h.insurance_cost(log)
    assert out["answer"] == "no" and out["seen"] == 1
    log["history"][1]["remaining"] = 1
    assert h.insurance_cost(log)["answer"] == "yes"
    assert h.insurance_cost({"lineups": {}, "history": []})["answer"] is None  # not seen yet


def test_editing_until_kick_off_is_read_from_when_lineups_were_editable_and_locked():
    lineup = {
        "firstKickoff": KICK.isoformat(),
        "editableAt": ms(KICK - timedelta(minutes=8)),
        "lockedAt": ms(KICK + timedelta(minutes=2)),
    }
    out = h.edit_until({"lineups": {"L1": lineup}})
    assert out["answer"] == "yes" and out["lastEditableMinutes"] == 8
    assert h.edit_until({"lineups": {}})["answer"] is None


def test_a_second_window_the_same_day_after_a_clear_is_counted():
    wins = [
        (KICK, KICK, 0.0),
        (KICK + timedelta(hours=3), KICK + timedelta(hours=3), 0.0),
        (KICK + timedelta(days=1), KICK + timedelta(days=1), 0.0),
    ]
    moves = [{"window": 0}, {"window": 2}]
    assert h.second_window(wins, moves) == {"clears": 2, "withLater": 1}


def test_kick_off_slots_say_how_often_each_steps_target_was_reached():
    tue = datetime(2026, 11, 24, 20, 0, tzinfo=UTC)  # 21:00 in Madrid on a Tuesday: a European night
    sat = datetime(2026, 11, 28, 17, 30, tzinfo=UTC)  # 18:30 on a Saturday
    fives = [
        {"at": tue.isoformat(), "total": 420.0},
        {"at": sat.isoformat(), "total": 300.0},
        {"at": (sat + timedelta(days=7)).isoformat(), "total": 410.0},
    ]
    out = {s["slot"]: s for s in h.slots(fives, [300.0, 400.0])}
    assert out["European night"] == {"slot": "European night", "windows": 1, "clears": {"1": 1, "2": 1}}
    assert out["18:30"] == {"slot": "18:30", "windows": 2, "clears": {"1": 2, "2": 1}}


def test_the_post_mortem_names_the_card_that_cost_the_lineup_and_why():
    log = {
        "lineups": {
            "L1": {
                "step": 4,
                "target": 400,
                "score": 312.0,
                "result": "missed",
                "resultAt": ms(KICK + timedelta(hours=3)),
                "cards": [
                    {"slug": "a", "player": "a", "game": "G", "captain": False, "score": 70.0},
                    {"slug": "b", "player": "b", "game": "G", "captain": True, "score": 0.0},
                ],
            }
        }
    }
    said = {
        ("a", "G"): {"started": True, "played": True, "expected": 55.0},
        ("b", "G"): {"started": False, "played": False, "expected": 60.0},
    }
    names = {"a": "Ann", "b": "Bidwell"}
    out = h.post_mortem(log, said, names)
    assert out is not None
    assert out["name"] == "Bidwell" and out["reason"] == "did not play" and out["captain"] is True
    assert out["total"] == 312.0 and out["target"] == 400
