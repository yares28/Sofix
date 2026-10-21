"""The new-league evaluation must keep real nulls, identity and complete source cohorts."""

from datetime import UTC, datetime
from types import SimpleNamespace

import pytest

from app.research import league_xscore_data as data


def test_null_scores_and_roles_are_not_zero_or_dnp():
    raw = {
        "score": None,
        "scoringVersion": 7,
        "positionTyped": "Goalkeeper",
        "anyPlayer": {"slug": "keeper"},
        "anyPlayerGameStats": None,
    }
    row = data.player(raw)
    assert row["score"] is None and row["played"] is None and row["started"] is None
    raw["score"] = 0
    raw["anyPlayerGameStats"] = {"playedInGame": True, "gameStarted": True, "minsPlayed": 90, "anyTeam": {"slug": "a"}}
    row = data.player(raw)
    assert row["score"] == 0 and row["started"] is True and row["team"] == "a"


def test_complete_list_is_scoped_and_pages_without_duplicates():
    calls = []

    def query(text, variables):
        calls.append(variables)
        page = variables["after"]
        nodes = (
            [{"id": "current", "date": "2026-08-01T12:00:00Z"}, {"id": "last", "date": "2025-08-01T12:00:00Z"}]
            if page is None
            else [{"id": "last", "date": "2025-08-01T12:00:00Z"}, {"id": "old", "date": "2022-08-01T12:00:00Z"}]
        )
        for node in nodes:
            node.update(
                statusTyped="played",
                homeTeam={"slug": "a", "name": "A"},
                awayTeam={"slug": "b", "name": "B"},
                homeGoals=1,
                awayGoals=0,
            )
        return {
            "football": {
                "competition": {"pastGames": {"nodes": nodes, "pageInfo": {"hasNextPage": True, "endCursor": "next"}}}
            }
        }

    rows = data.game_list(SimpleNamespace(query=query), "PL")
    assert [r["id"] for r in rows] == ["last"]
    assert len(calls) == 2 and all(c["league"] == "premier-league-gb-eng" for c in calls)
    with pytest.raises(ValueError):
        data.game_list(SimpleNamespace(query=query), "PD")


def test_repeated_cursor_is_a_failure_not_a_partial_complete_cohort():
    def query(*args):
        return {
            "football": {
                "competition": {"pastGames": {"nodes": [], "pageInfo": {"hasNextPage": True, "endCursor": "stuck"}}}
            }
        }

    with pytest.raises(ValueError, match="cursor"):
        data.game_list(SimpleNamespace(query=query), "BL1")


def test_wrong_game_or_competition_cannot_be_cached():
    raw = {"id": "different", "competition": {"slug": "bundesliga-de"}}
    with pytest.raises(ValueError, match="identity"):
        data.validate_game("PL", {"id": "wanted"}, raw, datetime.now(UTC))


def test_game_reader_never_duplicates_the_root_field_sorare_rejects():
    calls = []

    def query(text, variables):
        calls.append((text, variables))
        assert text.count("anyGame(") == 1, "Sorare rejects repeated roots even with aliases"
        return {"anyGame": {"id": variables["id"]}}

    got = data.fetch_games(SimpleNamespace(query=query), [{"id": str(i)} for i in range(10)])
    assert len(calls) == 10 and len(got) == 10 and calls[-1][1]["id"] == "9"
    assert "scoringVersion" in calls[0][0] and "scoreStatus" in calls[0][0]


def test_actual_sorare_windows_preserve_their_cutoff_not_a_weekday_guess():
    row = {
        "slug": "old-rhythm",
        "startDate": "2024-01-05T15:00:00Z",
        "endDate": "2024-01-09T15:00:00Z",
        "cutOffDate": "2024-01-05T14:00:00Z",
    }
    client = SimpleNamespace(
        query=lambda *args: {"so5": {"so5Fixtures": {"nodes": [row], "pageInfo": {"hasNextPage": False}}}}
    )
    assert data.windows(client) == [row]


def test_stopped_collection_resumes_without_reading_completed_games(tmp_path):
    expected = [{"id": str(i), "date": "2025-08-01T12:00:00Z"} for i in range(3)]
    calls = []

    def query(text, variables):
        def game(ident):
            calls.append(ident)
            return {
                "id": ident,
                "date": "2025-08-01T12:00:00Z",
                "competition": {"slug": "premier-league-gb-eng"},
                "statusTyped": "played",
                "homeGoals": 0,
                "awayGoals": 0,
                "homeTeam": {"slug": "a", "name": "A"},
                "awayTeam": {"slug": "b", "name": "B"},
                "playerGameScores": [],
            }

        if "id" in variables:
            return {"anyGame": game(variables["id"])}
        return {f"g{i}": game(ident) for i, ident in enumerate(variables.values())}

    client = SimpleNamespace(query=query)
    first = data.collect(client, "PL", expected, tmp_path, limit=1)
    assert first["complete"] is False and calls == ["0"]
    second = data.collect(client, "PL", expected, tmp_path)
    assert second["complete"] is True and calls == ["0", "1", "2"]
