"""Do not hide missing qualifiers, source conflicts or ambiguous club identities."""

from copy import deepcopy

import pytest

from app.research.european_alignment import align


def fixture(ident, home, away, date="2025-08-20T19:00:00Z"):
    return {
        "id": ident,
        "seasonYear": "2026",
        "competitionPhase": "QUALIFYING",
        "competition": {"id": "1", "code": "UCL", "sex": "MALE", "teamCategory": "CLUB"},
        "homeTeam": {"id": home, "internationalName": home, "isPlaceHolder": False},
        "awayTeam": {"id": away, "internationalName": away, "isPlaceHolder": False},
        "kickOffTime": {"dateTime": date},
        "status": "FINISHED",
        "score": {"total": {"home": 0, "away": 1}},
    }


def game(ident, home, away, date="2025-08-20T19:00:00Z"):
    return {
        "id": ident,
        "date": date,
        "homeTeam": {"slug": home.lower(), "name": home},
        "awayTeam": {"slug": away.lower(), "name": away},
        "homeGoals": 0,
        "awayGoals": 1,
        "statusTyped": "played",
    }


def test_exact_source_names_and_actual_oriented_fixture_join():
    result = align("CL", 2025, [fixture("u1", "Home", "Away")], [game("s1", "Home", "Away")])
    assert result["complete"] is True and result["matches"] == [{"uefa": "u1", "sorare": "s1", "phase": "QUALIFYING"}]
    assert result["modelEligible"] is False


def test_unique_known_opponent_and_exact_kickoff_proves_fixture_specific_alias():
    result = align("CL", 2025, [fixture("u1", "Home", "Away")], [game("s1", "Home", "Away FC")])
    assert result["complete"] is True
    assert result["bindings"]["away fc"] == "Away"
    assert any(r["basis"] == "unique oriented fixture and exact kickoff" for r in result["evidence"])


def test_missing_qualifier_is_reported_without_shrinking_the_denominator():
    rows = [fixture("u1", "Home", "Away"), fixture("u2", "Other", "Third")]
    result = align("CL", 2025, rows, [game("s1", "Home", "Away")])
    assert result["complete"] is False and result["expected"] == 2 and result["missingUefa"] == ["u2"]


def test_a_score_disagreement_is_not_used_to_pick_a_more_convenient_pair():
    raw = fixture("u1", "Home", "Away")
    raw["score"]["total"]["home"] = 2
    result = align("CL", 2025, [raw], [game("s1", "Home", "Away")])
    assert result["complete"] is False and result["conflicts"][0]["reason"] == "score totals differ"
    assert len(result["matches"]) == 1


def test_no_fuzzy_bridge_or_match_when_both_clubs_are_unknown():
    result = align("CL", 2025, [fixture("u1", "Home", "Away")], [game("s1", "Home FC", "Away FC")])
    assert result["matches"] == [] and result["missingSorare"] == ["s1"]


def test_never_select_an_alias_from_goals_when_two_fixtures_share_time_and_opponent():
    rows = [fixture("u1", "Home", "Away"), fixture("u2", "Home", "Other")]
    result = align("CL", 2025, rows, [game("s1", "Home", "Unmapped FC")])
    assert "unmapped fc" not in result["bindings"] and not result["complete"]


def test_same_label_two_native_clubs_stays_ambiguous():
    rows = [fixture("u1", "Home", "Away"), fixture("u2", "Other", "Third")]
    rows[1]["homeTeam"]["internationalName"] = "Home"
    result = align("CL", 2025, rows, [game("s1", "Home", "New Opponent")])
    assert "home" not in result["bindings"] and not result["complete"]


def test_date_or_side_changes_are_not_silently_tolerated():
    raw = fixture("u1", "Home", "Away")
    result = align("CL", 2025, [raw], [game("s1", "Home", "Away", "2025-08-21T19:00:00Z")])
    assert result["matches"] == []
    result = align("CL", 2025, [raw], [game("s1", "Away", "Home")])
    assert result["matches"] == []


def test_duplicate_native_or_sorare_fixture_is_a_failure():
    raw, source = fixture("u1", "Home", "Away"), game("s1", "Home", "Away")
    with pytest.raises(ValueError, match="Repeated"):
        align("CL", 2025, [raw, deepcopy(raw)], [source])
    with pytest.raises(ValueError, match="Repeated"):
        align("CL", 2025, [raw], [source, deepcopy(source)])
