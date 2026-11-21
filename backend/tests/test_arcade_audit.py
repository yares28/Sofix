"""The Arcade audit's hindsight: what your cards could have done with real scores (plans/arcade-trust.md step 10)."""

from datetime import UTC, datetime, timedelta

from app.sorare import arcade_audit as a

T0 = datetime(2026, 11, 1, 12, tzinfo=UTC)


def card(slug, pos, bonus=1.0, team="club"):
    return {
        "slug": slug,
        "player": slug,
        "name": slug.title(),
        "team": team.title(),
        "teamSlug": team,
        "teamPicture": None,
        "picture": None,
        "positions": [pos],
        "bonus": bonus,
    }


SQUAD = [
    card("gk", "Goalkeeper"),
    card("d1", "Defender"),
    card("d2", "Defender"),
    card("m1", "Midfielder"),
    card("f1", "Forward"),
    card("f2", "Forward", 1.1),
]


def test_games_within_75_minutes_of_a_windows_first_kick_off_share_it():
    times = [T0, T0 + timedelta(minutes=60), T0 + timedelta(minutes=80), T0 + timedelta(hours=5)]
    assert [len(w) for w in a.windows(times)] == [2, 1, 1]


def test_the_best_five_fills_every_slot_once_with_the_captain_where_he_adds_most():
    scores = {"gk": 50.0, "d1": 40.0, "d2": 60.0, "m1": 55.0, "f1": 70.0, "f2": 65.0}
    best = a.best_five(SQUAD, scores, captain=0.5)
    assert best is not None
    assert sorted(p["card"] for p in best["picks"]) == [
        "d2",
        "f1",
        "f2",
        "gk",
        "m1",
    ]  # d2 as defender, the other forward as extra
    # As captain f1 adds 70 x 0.5 = 35, f2 (a 10% edition) 65 x 0.5 = 32.5: f1 is captain.
    captain = next(p for p in best["picks"] if p["captain"])
    assert captain["card"] == "f1"
    assert best["total"] == round(50 + 60 + 55 + 70 * 1.5 + 65 * 1.1, 2)
    assert a.best_five(SQUAD[:4], scores, captain=0.5) is None  # no forward: no five


def test_the_hindsight_climb_plays_only_windows_that_clear_and_waits_for_each_to_settle():
    targets = [100.0, 200.0, 300.0]
    # (window start, last kick-off, best total)
    wins = [
        (T0, T0, 150.0),
        (T0 + timedelta(hours=1), T0 + timedelta(hours=1), 400.0),
        (T0 + timedelta(hours=3), T0 + timedelta(hours=3), 250.0),
        (T0 + timedelta(hours=6), T0 + timedelta(hours=6), 350.0),
    ]
    plan = a.replay(wins, targets)
    # 12:00 clears step 1; 13:00 starts before 12:00 settles (14:00); 15:00 clears step 2; 18:00 clears step 3, the top.
    assert [(m["step"], m["window"]) for m in plan["moves"]] == [(1, 0), (2, 2), (3, 3)]
    assert plan["tops"] == 1 and plan["clears"] == {1: 1, 2: 1, 3: 1}


def test_the_climb_prefers_more_tops_over_more_clears():
    targets = [100.0, 500.0]
    wins = [
        (T0 + timedelta(hours=3 * i), T0 + timedelta(hours=3 * i), total)
        for i, total in enumerate([150.0, 150.0, 600.0, 150.0])
    ]
    plan = a.replay(wins, targets)
    assert plan["tops"] == 1
