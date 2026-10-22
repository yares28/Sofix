"""Regulation outcomes cannot be replaced with extra-time or administrative totals."""

from copy import deepcopy

import pytest

from app.research.european_facts import regulation, venue


def raw():
    return {
        "id": "match",
        "status": "FINISHED",
        "homeTeam": {"id": "h"},
        "awayTeam": {"id": "a"},
        "score": {"regular": {"home": 1, "away": 0}, "total": {"home": 2, "away": 0}},
        "playerEvents": {
            "scorers": [
                {"id": "g1", "phase": "SECOND_HALF", "teamId": "h", "goalType": "SCORED", "time": {"minute": 95}},
                {
                    "id": "g2",
                    "phase": "EXTRA_TIME_FIRST_HALF",
                    "teamId": "h",
                    "goalType": "SCORED",
                    "time": {"minute": 99},
                },
            ]
        },
    }


def test_phase_not_minute_distinguishes_stoppage_time_from_extra_time():
    assert regulation(raw())["score90"] == [1, 0]


def test_own_goal_uses_the_event_actor_side_not_current_player_club():
    source = raw()
    source["playerEvents"]["scorers"][0].update(teamId="a", goalType="OWN", player={"clubId": "unrelated-current-club"})
    assert regulation(source)["score90"] == [1, 0]


@pytest.mark.parametrize("key,value", [("status", "ABANDONED"), ("status", "CANCELED")])
def test_nonplayed_and_awarded_scores_are_not_goals(key, value):
    source = raw()
    source[key] = value
    assert regulation(source)["score90"] is None


def test_missing_scorers_are_not_invented_for_a_positive_score():
    source = raw()
    source.pop("playerEvents")
    assert regulation(source)["score90"] is None
    source["score"] = {"regular": {"home": 0, "away": 0}, "total": {"home": 0, "away": 0}}
    assert regulation(source)["score90"] == [0, 0]
    assert regulation(source)["basis"] == "explicit completed scoreless result; not an inferred empty goal inventory"


def test_conflicting_period_or_goal_total_remains_unreviewed():
    source = raw()
    source["score"]["regular"]["home"] = 2
    assert regulation(source)["score90"] is None


def test_main_league_phase_has_no_extra_time_but_retains_a_wrong_period_field():
    source = raw()
    source.update(competitionPhase="TOURNAMENT", round={"mode": "GROUP", "phase": "TOURNAMENT"})
    source["playerEvents"]["scorers"][1]["phase"] = "SECOND_HALF"
    reviewed = regulation(source)
    assert reviewed["score90"] == [2, 0] and reviewed["reportedRegularConflict"] is True
    assert source["score"]["regular"] == {"home": 1, "away": 0}
    source = raw()
    source["score"]["total"]["home"] = 3
    assert regulation(source)["score90"] is None


def test_duplicate_goal_unknown_phase_or_actor_cannot_make_a_completed_inventory():
    source = raw()
    source["playerEvents"]["scorers"].append(deepcopy(source["playerEvents"]["scorers"][0]))
    assert regulation(source)["score90"] is None
    source = raw()
    source["playerEvents"]["scorers"][0]["phase"] = "UNSPECIFIED"
    assert regulation(source)["score90"] is None
    source = raw()
    source["playerEvents"]["scorers"][0]["teamId"] = "unknown"
    assert regulation(source)["score90"] is None


def test_reviewed_anderlecht_match_override_requires_the_exact_source_packet():
    source = raw()
    source.update(id="2036625", kickOffTime={"dateTime": "2023-02-23T17:45:00Z"}, seasonYear="2023")
    source["homeTeam"]["id"], source["awayTeam"]["id"] = "50074", "2603104"
    source["score"] = {"regular": {"home": 2, "away": 2}, "total": {"home": 2, "away": 1}}
    source["playerEvents"]["scorers"] = [
        {"id": str(i), "phase": "SECOND_HALF", "teamId": side, "goalType": "SCORED"}
        for i, side in enumerate(["50074", "50074", "2603104"])
    ]
    assert regulation(source)["score90"] == [2, 1]
    assert regulation(source)["evidence"] == "https://www.rsca.be/fr/andlud"
    source["homeTeam"]["id"] = "different"
    assert regulation(source)["score90"] is None


def test_unknown_foreign_ground_is_not_automatically_neutral():
    source = {
        "id": "unknown",
        "homeTeam": {"id": "h", "countryCode": "FRA"},
        "stadium": {"id": "s", "countryCode": "BEL"},
        "round": {"mode": "GROUP"},
        "kickOffTime": {"dateTime": "2025-01-01T12:00:00Z"},
    }
    assert venue(source)["neutral"] is None
    source["stadium"]["countryCode"] = "FRA"
    assert venue(source)["neutral"] is False
    source["round"]["mode"] = "FINAL"
    assert venue(source)["neutral"] is True


def test_documented_displaced_home_policy_needs_actual_foreign_stadium_and_date():
    source = {
        "id": "unknown",
        "homeTeam": {"id": "h", "countryCode": "UKR"},
        "stadium": {"id": "s", "countryCode": "POL"},
        "round": {"mode": "GROUP"},
        "kickOffTime": {"dateTime": "2022-09-01T12:00:00Z"},
    }
    assert venue(source)["neutral"] is True
    source["kickOffTime"]["dateTime"] = "2021-09-01T12:00:00Z"
    assert venue(source)["neutral"] is None
    source["kickOffTime"]["dateTime"] = "2022-09-01T12:00:00Z"
    source.pop("stadium")
    assert venue(source)["neutral"] is None


def test_tns_documented_local_groundshare_is_home_despite_welsh_association():
    source = {
        "id": "2042305",
        "homeTeam": {"id": "60457", "countryCode": "WAL"},
        "stadium": {"id": "1100109", "countryCode": "ENG"},
        "seasonYear": "2025",
        "round": {"mode": "GROUP"},
        "kickOffTime": {"dateTime": "2024-12-12T20:00:00Z"},
    }
    assert venue(source)["neutral"] is False
    source["stadium"]["id"] = "other"
    assert venue(source)["neutral"] is None


def test_reviewed_one_off_relocation_does_not_follow_a_match_id_to_another_ground():
    source = {
        "id": "2044403",
        "homeTeam": {"id": "52697", "countryCode": "ISL"},
        "awayTeam": {"id": "50084"},
        "stadium": {"id": "76106", "countryCode": "FIN"},
        "round": {"mode": "KNOCK_OUT"},
        "kickOffTime": {"dateTime": "2025-02-13T17:45:00Z"},
    }
    assert venue(source)["neutral"] is True
    source["stadium"]["id"] = "different"
    assert venue(source)["neutral"] is None
