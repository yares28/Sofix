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


def test_real_sorare_formation_rows_are_flattened_before_counting_eleven(tmp_path):
    raw = {**game(), "competition": {"slug": "uefa-champions-league"}, "playerGameScores": []}
    for side in ("home", "away"):
        raw[f"{side}Formation"] = {
            "startingLineupAvailable": True,
            "startingLineup": [
                [{"slug": f"{side}0"}],
                [{"slug": f"{side}{i}"} for i in range(1, 5)],
                [{"slug": f"{side}{i}"} for i in range(5, 9)],
                [{"slug": f"{side}9"}, {"slug": f"{side}10"}],
            ],
        }
    client = SimpleNamespace(query=lambda *args: {"anyGame": raw})
    assert data.collect(client, "CL", [game()], tmp_path)["missingStartingXI"] == []


def test_expired_current_club_cache_is_not_silently_used_for_current_coverage():
    assert data.current_cache_fresh({"at": "2026-10-21T12:00:00Z"}, datetime(2026, 10, 23, tzinfo=UTC)) is False
    assert data.current_cache_fresh({"at": "2026-10-22T23:00:00Z"}, datetime(2026, 10, 23, tzinfo=UTC)) is True


def test_training_edition_keeps_june_preliminary_qualifiers():
    def query(*args):
        return {
            "football": {
                "competition": {
                    "slug": "uefa-champions-league",
                    "pastGames": {
                        "nodes": [game("preliminary", "2023-06-27T19:00:00Z")],
                        "pageInfo": {"hasNextPage": False, "endCursor": None},
                    },
                }
            }
        }

    rows = data.game_index(SimpleNamespace(query=query), "CL")
    assert rows[0]["id"] == "preliminary"


def test_actual_sorare_cutoffs_include_early_qualifying_window():
    row = {
        "slug": "june-qualifiers",
        "startDate": "2023-06-23T14:00:00Z",
        "endDate": "2023-06-27T14:00:00Z",
        "cutOffDate": "2023-06-23T13:50:00Z",
    }
    client = SimpleNamespace(
        query=lambda *args: {"so5": {"so5Fixtures": {"nodes": [row], "pageInfo": {"hasNextPage": False}}}}
    )
    assert data.european_windows(client) == [row]


def test_cloud_collector_cold_start_then_resumes_without_repeating_source_reads(tmp_path, monkeypatch):
    # Exercise the actual CLI orchestration with bounded public responses, no DB or network.

    calls = []

    def inventory(client, code, season, folder):
        folder.mkdir(parents=True, exist_ok=True)
        assert code == "CL" and season in (2023, 2024, 2025, 2026)
        return {"fixtures": [1], "phases": {"qualifying": 1}}

    class Client:
        api_key = "fixture-only"

        def __init__(self, **kwargs):
            pass

        def __enter__(self):
            return self

        def __exit__(self, *args):
            pass

        def query(self, text, variables):
            calls.append(variables)
            if text == data.GAME_QUERY:
                return {"anyGame": {**game(), "competition": {"slug": "uefa-champions-league"}, "playerGameScores": []}}
            raise AssertionError("No unexpected source query")

    monkeypatch.setattr(data, "fetch_inventory", inventory)
    monkeypatch.setattr(
        data, "sorare_clubs", lambda query, code: calls.append("clubs") or [{"slug": "h"}, {"slug": "a"}]
    )
    monkeypatch.setattr(data, "game_index", lambda client, code: calls.append("index") or [game()])
    monkeypatch.setattr(data, "european_windows", lambda client: calls.append("windows") or [])
    monkeypatch.setattr(data, "SorareClient", Client)
    monkeypatch.setattr(data.time, "sleep", lambda _: None)
    monkeypatch.setattr("sys.argv", ["collector", "--league", "CL", "--out", str(tmp_path)])
    assert data.main() == 0 and len(calls) == 4
    assert data.main() == 0 and len(calls) == 4
    # Older domestic-period index is re-enumerated, but authentic cached outcomes are kept.
    (tmp_path / "CL" / "index-period.json").write_text("{}", encoding="utf-8")
    assert data.main() == 0 and calls[-2:] == ["index", "windows"] and len(calls) == 6
    assert json.loads((tmp_path / "CL" / "coverage.json").read_text(encoding="utf-8"))["modelEligible"] is False
