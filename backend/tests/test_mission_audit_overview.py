from copy import deepcopy

from app.sorare import mission_audit
from tests.test_sorare_missions import cand, hit, log, miss


def overview(payload):
    return mission_audit.overview([payload])


def test_compares_same_mission_and_keeps_zero_separate_from_missing():
    payload = log([hit("a"), miss("b")], ["b"], yours=[{"player": "a", "status": "SUCCESS"}])
    row = overview(payload)["rows"][0]
    assert (row["sofix"], row["yours"], row["best"], row["state"]) == (0, 1, 1, "checked")
    payload["days"]["2026-10-06"]["limited"]["missions"][0]["yours"] = []
    assert overview(payload)["rows"][0]["yours"] is None


def test_own_verdict_is_kept_without_a_forecast_or_eligible_inventory():
    payload = log([], [], yours=[{"player": "a", "status": "SUCCESS"}])
    row = overview(payload)["rows"][0]
    assert row["yours"] == 1
    assert row["sofix"] is None and row["best"] is None
    assert row["state"] == "unrecorded"


def test_incomplete_and_reconstructed_forecasts_are_visible_but_never_accuracy():
    payload = log([hit("a")], ["a"])
    entry = payload["days"]["2026-10-06"]["limited"]
    entry["missions"][0]["source"] = {"eligibilityComplete": False}
    entry["replay"] = deepcopy(entry)
    row = overview(payload)["rows"][0]
    assert row["state"] == "incomplete" and row["best"] is None and row["replay"]
    entry["reconstructed"] = True
    assert overview(payload)["rows"][0]["state"] == "reconstructed"


def test_zero_opportunity_is_checked_and_all_history_is_retained():
    payload = log([miss("a")], ["a"])
    row = overview(payload)["rows"][0]
    assert (row["state"], row["best"], row["sofix"]) == ("checked", 0, 0)
    entries = payload["days"].pop("2026-10-06")
    payload["days"] = {f"2026-08-{d:02}": deepcopy(entries) for d in range(1, 32)}
    assert len(overview(payload)["rows"]) == 31


def test_only_explicit_reward_terms_are_valued_and_full_house_bonus_is_respected():
    payload = log([hit("a"), hit("b"), hit("c")], ["a", "b", "c"])
    m = payload["days"]["2026-10-06"]["limited"]["missions"][0]
    m["description"] = (
        "Win 50 All-Star Essence per correct choice. Win up to 500 All-Star Essence if all picks are successful."
    )
    assert overview(payload)["rows"][0]["reward"] == {"unit": "All-Star Essence", "each": 50, "full": 500}
    m["description"] = "Earn 200 XP for each player you select who gets a positive decisive action."
    assert overview(payload)["rows"][0]["reward"] == {"unit": "XP", "each": 200, "full": 600}
    m["description"] = (
        "Win 1 Nationality Clue per correct choice. Win up to 10 Nationality Clues if all picks are successful."
    )
    assert overview(payload)["rows"][0]["reward"] == {"unit": "Nationality Clues", "each": 1, "full": 10}
    m["description"] = "Win 300 XP per correct choice. Win up to 1,500 XP if all picks are successful."
    assert overview(payload)["rows"][0]["reward"]["full"] == 1500
    m["description"] = "Win up to 500 Essence."
    assert overview(payload)["rows"][0]["reward"] is None


def test_selection_identity_and_source_verdict_win_over_another_copy_and_manual_status():
    payload = log([hit("a"), miss("b")], ["b"])
    entry = payload["days"]["2026-10-06"]["limited"]
    entry["cands"][0].update(card="a-copy")
    m = entry["missions"][0]
    m["yours"] = [{"player": "a", "card": "other-copy", "game": "Game:1", "status": "FAILURE"}]
    m["override"] = {"picks": [{"player": "a", "card": "a-copy", "game": "Game:1", "status": "SUCCESS"}]}
    assert overview(payload)["rows"][0]["yours"] == 1
    m["override"]["picks"][0]["card"] = "unknown-copy"
    assert overview(payload)["rows"][0]["yours"] is None


def test_confirmed_empty_choices_are_zero_but_unknown_choices_are_missing():
    payload = log([hit("a")], ["a"])
    m = payload["days"]["2026-10-06"]["limited"]["missions"][0]
    assert overview(payload)["rows"][0]["yours"] is None
    m["source"] = {"appearances": []}
    assert overview(payload)["rows"][0]["yours"] == 0
    payload["days"]["2026-10-06"]["limited"]["cands"][0].pop("r")
    assert overview(payload)["rows"][0]["yours"] is None


def test_every_mission_has_one_status_including_unsupported_and_future_results():
    payload = log([hit("a"), miss("b")], ["a"])
    entry = payload["days"]["2026-10-06"]["limited"]
    entry["cands"][1].pop("r")
    assert overview(payload)["rows"][0]["state"] == "pending"
    entry["missions"][0]["rule"] = {"kind": "unsupported"}
    assert overview(payload)["rows"][0]["state"] == "unsupported"


def test_a_captured_plan_that_allocated_all_cards_elsewhere_is_an_honest_zero():
    payload = log([hit("a")], [])
    entry = payload["days"]["2026-10-06"]["limited"]
    entry["captured"] = "2026-10-06T08:00:00Z"
    row = overview(payload)["rows"][0]
    assert (row["state"], row["sofix"], row["best"]) == ("checked", 0, 1)


def test_only_void_own_games_do_not_become_a_checked_failure():
    payload = log([cand("a", void=True)], ["a"], yours=[{"player": "a", "game": "Game:1", "status": "READY"}])
    assert overview(payload)["rows"][0]["yours"] is None
