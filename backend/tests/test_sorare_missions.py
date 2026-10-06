"""The daily missions log: settled from each game a day after it, and scored against what the owner's cards could have done."""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Any

from app.sorare.missions import did, record, settle_log

DECISIVE = {"kind": "decisive", "label": "a decisive action"}
INTERCEPT = {"kind": "interception", "atLeast": 2, "label": "2+ interceptions"}
NOW = datetime(2026, 10, 8, 12, tzinfo=UTC)


def row(pos: str = "MID", played: bool = True, **stats: float) -> dict[str, Any]:
    return {"pos": pos, "played": played, "stats": {name: [value, 0.0] for name, value in stats.items()}}


def cand(
    slug: str, chance: float = 0.3, kickoff: str = "2026-10-06T19:00:00Z", game: str | None = "Game:1", **result: Any
) -> dict[str, Any]:
    out: dict[str, Any] = {
        "s": slug,
        "n": slug.title(),
        "pic": "",
        "pos": "MID",
        "g": game,
        "k": kickoff,
        "c": {"Decisive Picker": chance},
    }
    if result:
        out["r"] = result
    return out


def log(
    cands: list[dict[str, Any]], sofix: list[str], picks: int = 3, yours: list[dict[str, Any]] | None = None
) -> dict[str, Any]:
    mission = {
        "key": "Decisive Picker",
        "rule": DECISIVE,
        "stats": [],
        "picks": picks,
        "sofix": sofix,
        "yours": yours or [],
    }
    return {"days": {"2026-10-06": {"limited": {"loaded": False, "missions": [mission], "cands": cands}}}}


def test_a_decisive_action_is_any_positive_one_and_a_clean_sheet_only_for_a_goalkeeper():
    assert did(DECISIVE, [], row(goal_assist=1))
    assert not did(DECISIVE, [], row(clean_sheet_60=1))
    assert did(DECISIVE, [], row("GK", clean_sheet_60=1))
    assert not did(DECISIVE, [], row(interception_won=5))
    assert did(DECISIVE, ["interception_won"], row(interception_won=1))  # the mission's own list wins
    assert did(INTERCEPT, [], row(interception_won=2)) and not did(INTERCEPT, [], row(interception_won=1))


def test_settling_waits_a_day_marks_who_did_it_and_voids_a_game_never_scored_after_a_week():
    payload = log(
        [
            cand("a"),
            cand("b"),
            cand("c", kickoff="2026-10-08T10:00:00Z"),
            cand("d", game=None, kickoff="2026-09-29T19:00:00Z"),
        ],
        ["a"],
    )
    assert settle_log(payload, {}, NOW) == ["Game:1"]  # c played two hours ago: not yet
    game = {"players": {"a": row(goals=1), "b": row(played=False)}}
    settle_log(payload, {"Game:1": game}, NOW)
    by = {c["s"]: c.get("r") for c in payload["days"]["2026-10-06"]["limited"]["cands"]}
    assert by["a"] == {"played": True, "did": {"Decisive Picker": True}}
    assert by["b"] == {"played": False, "did": {"Decisive Picker": False}}
    assert by["c"] is None
    assert by["d"] == {"void": True}


def test_a_game_sorare_has_not_scored_waits_then_is_void():
    payload = log([cand("a")], ["a"])
    settle_log(payload, {"Game:1": {"players": {}}}, NOW)
    assert "r" not in payload["days"]["2026-10-06"]["limited"]["cands"][0]
    settle_log(payload, {"Game:1": {"players": {}}}, datetime(2026, 10, 14, tzinfo=UTC))
    assert payload["days"]["2026-10-06"]["limited"]["cands"][0]["r"] == {"void": True}


def hit(slug: str) -> dict[str, Any]:
    return cand(slug, played=True, did={"Decisive Picker": True})


def miss(slug: str) -> dict[str, Any]:
    return cand(slug, played=True, did={"Decisive Picker": False})


def test_the_owners_example_picking_1_2_3_when_1_4_5_did_it_is_a_miss():
    cands = [hit("p1"), miss("p2"), miss("p3"), hit("p4"), hit("p5")] + [miss(f"p{i}") for i in range(6, 11)]
    figures = record([log(cands, ["p1", "p2", "p3"])])
    assert figures["counted"] == 1 and figures["success"] == 0
    assert figures["caught"] == 1 and figures["best"] == 3
    day = figures["days"][0]
    assert [c["slug"] for c in day["missed"]] == ["p4", "p5"]
    assert [(c["slug"], c["hit"]) for c in day["picks"]] == [("p1", True), ("p2", False), ("p3", False)]


def test_the_best_possible_is_capped_by_the_achievers_and_a_day_nobody_could_do_is_not_counted():
    # One achiever among ten: picking him is the best possible, so a success even with two other picks missing.
    one = record([log([hit("a"), miss("b"), miss("c"), miss("d")], ["a", "b", "c"])])
    assert (one["counted"], one["success"], one["best"]) == (1, 1, 1)
    nobody = record([log([miss("a"), miss("b"), miss("c")], ["a", "b", "c"])])
    assert (nobody["counted"], nobody["nobody"]) == (0, 1)


def test_a_day_still_waiting_for_a_game_is_pending_and_a_void_player_is_left_out():
    waiting = record([log([hit("a"), cand("b")], ["a", "b"])])
    assert (waiting["counted"], waiting["pending"]) == (0, 1)
    void = record([log([hit("a"), cand("b", void=True), miss("c")], ["a", "b"], picks=2)])
    assert (void["counted"], void["success"], void["best"]) == (1, 1, 1)


def test_your_own_picks_are_scored_the_same_way_by_sorares_verdict():
    yours = [
        {"player": "b", "game": "Game:1", "rarity": "limited", "status": "SUCCESS"},
        {"player": "c", "game": "Game:1", "rarity": "limited", "status": "FAILURE"},
    ]
    figures = record([log([hit("a"), hit("b"), miss("c")], ["a", "c"], picks=2, yours=yours)])
    assert figures["success"] == 0  # Sofix got 1 of a best of 2
    assert figures["yours"] == {"counted": 1, "success": 0}
    assert figures["said"] == 0.3 and figures["happened"] == 0.5
