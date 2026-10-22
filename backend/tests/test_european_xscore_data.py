"""Source collection must not turn partial European coverage into a passed model."""

import json
from datetime import UTC, datetime
from types import SimpleNamespace

import pytest

from app.research import european_xscore_data as data


def game(ident="Game:a", date="2025-10-01T19:00:00Z", status="played"):
    return {
        "id": ident,
        "date": date,
        "statusTyped": status,
        "homeTeam": {"slug": "h", "name": "Home"},
        "awayTeam": {"slug": "a", "name": "Away"},
        "homeGoals": None,
        "awayGoals": 0,
    }


def test_index_preserves_null_and_administrative_status_and_follows_cursor():
    calls = []

    def query(text, variables):
        calls.append(variables)
        more = variables["after"] is None
        return {
            "football": {
                "competition": {
                    "slug": "uefa-europa-league",
                    "pastGames": {
                        "nodes": [game(status="cancelled")] if more else [game("old", "2022-05-01T19:00:00Z")],
                        "pageInfo": {"hasNextPage": True, "endCursor": "next"},
                    },
                }
            }
        }

    rows = data.game_index(SimpleNamespace(query=query), "EL")
    assert len(rows) == 1 and rows[0]["statusTyped"] == "cancelled"
    assert rows[0]["homeGoals"] is None and rows[0]["awayGoals"] == 0
    assert calls[1]["after"] == "next" and calls[0]["slug"] == "uefa-europa-league"


def test_index_rejects_wrong_source_and_unsorted_dates():
    def query(text, variables):
        return {
            "football": {
                "competition": {
                    "slug": "uefa-champions-league",
                    "pastGames": {
                        "nodes": [game("old", "2022-01-01T00:00:00Z"), game()],
                        "pageInfo": {"hasNextPage": False},
                    },
                }
            }
        }

    with pytest.raises(ValueError, match="competition"):
        data.game_index(SimpleNamespace(query=query), "CONF")
    with pytest.raises(ValueError, match="order"):
        data.game_index(SimpleNamespace(query=query), "CL")


def test_snapshot_checks_competition_both_teams_and_date():
    expected = game()
    raw = {**expected, "competition": {"slug": "uefa-champions-league"}, "playerGameScores": []}
    assert data.game_snapshot("CL", expected, raw)["modelEligible"] is False
    raw["homeTeam"] = {"slug": "wrong"}
    with pytest.raises(ValueError, match="team"):
        data.game_snapshot("CL", expected, raw)


def test_collector_resumes_with_no_requests_and_never_claims_uefa_alignment(tmp_path):
    expected = game()
    raw = {**expected, "competition": {"slug": "uefa-champions-league"}, "playerGameScores": []}
    calls = []

    def query(text, variables):
        calls.append(variables)
        return {"anyGame": raw}

    client = SimpleNamespace(query=query)
    first = data.collect(client, "CL", [expected], tmp_path)
    second = data.collect(client, "CL", [expected], tmp_path)
    assert len(calls) == 1 and first["sourceComplete"] is True and second["saved"] == 1
    assert first["modelEligible"] is False and first["uefaAligned"] is False
    saved = json.loads(next((tmp_path / "games").glob("*.json")).read_text(encoding="utf-8"))
    assert saved["raw"]["homeGoals"] is None and saved["raw"]["awayGoals"] == 0


def test_game_missing_a_starter_is_retained_as_evidence(tmp_path):
    raw = {
        **game(),
        "competition": {"slug": "uefa-champions-league"},
        "homeFormation": {"startingLineupAvailable": True, "startingLineup": [{"slug": "h1"}]},
        "awayFormation": {"startingLineupAvailable": False},
        "playerGameScores": [],
    }
    client = SimpleNamespace(query=lambda *args: {"anyGame": raw})
    result = data.collect(client, "CL", [game()], tmp_path)
    assert result["sourceComplete"] is True and result["missingStartingXI"] == ["Game:a"]


def test_expired_current_club_cache_is_not_silently_used_for_current_coverage():
    assert data.current_cache_fresh({"at": "2026-10-21T12:00:00Z"}, datetime(2026, 10, 23, tzinfo=UTC)) is False
    assert data.current_cache_fresh({"at": "2026-10-22T23:00:00Z"}, datetime(2026, 10, 23, tzinfo=UTC)) is True
