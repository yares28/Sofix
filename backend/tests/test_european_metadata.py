"""A resumed game retains its actual Sorare deadline, even outside that window."""

from datetime import UTC, datetime
from types import SimpleNamespace

import pytest

from app.research.european_metadata import actual_window, collect


def source(ident="Game:a"):
    return {"id": ident, "date": "2025-10-24T14:00:00Z", "homeTeam": {"slug": "rijeka"}, "awayTeam": {"slug": "sparta"}}


def metadata(ident="Game:a"):
    return {
        **source(ident),
        "competition": {"slug": "uefa-europa-conference-league"},
        "so5Fixture": {
            "slug": "football-21-24-oct-2025",
            "startDate": "2025-10-21T14:00:00Z",
            "endDate": "2025-10-24T13:59:00Z",
            "cutOffDate": "2025-10-21T14:00:00Z",
        },
    }


def test_actual_deadline_is_not_reconstructed_from_the_resumption_date():
    assert actual_window(metadata()) == ("football-21-24-oct-2025", datetime(2025, 10, 21, 14, tzinfo=UTC))


def test_no_actual_fixture_cannot_be_filled_from_neighbouring_dates():
    row = metadata()
    row["so5Fixture"] = None
    with pytest.raises(ValueError, match="actual Sorare"):
        actual_window(row)


def test_collects_bounded_metadata_batches_and_joins_by_id_not_return_order(tmp_path):
    calls = []

    def query(text, variables):
        calls.append(variables)
        assert "playerGameScores" not in text and len(variables["ids"]) <= 25
        return {"nodes": [metadata(ident) for ident in reversed(variables["ids"])]}

    expected = [source(f"Game:{i}") for i in range(51)]
    client = SimpleNamespace(query=query)
    result = collect(client, "CONF", expected, tmp_path)
    assert len(result) == 51 and len(calls) == 3
    assert collect(client, "CONF", expected, tmp_path) == result and len(calls) == 3


def test_missing_or_wrong_node_blocks_metadata_completeness(tmp_path):
    client = SimpleNamespace(query=lambda *args: {"nodes": []})
    with pytest.raises(ValueError, match="missing|Missing"):
        collect(client, "CONF", [source()], tmp_path)
    client = SimpleNamespace(query=lambda *args: {"nodes": [metadata("wrong")]})
    with pytest.raises(ValueError, match="identity"):
        collect(client, "CONF", [source()], tmp_path)


def test_current_team_or_game_time_change_does_not_reuse_stale_metadata(tmp_path):
    client = SimpleNamespace(query=lambda *args: {"nodes": [metadata()]})
    collect(client, "CONF", [source()], tmp_path)
    changed = source()
    changed["awayTeam"] = {"slug": "other"}
    with pytest.raises(ValueError, match="team"):
        collect(client, "CONF", [changed], tmp_path)
