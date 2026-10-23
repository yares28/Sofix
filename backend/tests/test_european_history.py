from copy import deepcopy

import pytest

from app.sorare.european_history import context_of, link_games
from tests.test_european_cases import sample


def test_current_history_requires_whole_authentic_game_and_records_later_availability():
    saved = sample()
    native = {
        "id": "1",
        "homeTeam": {"id": "h"},
        "awayTeam": {"id": "a"},
        "kickOffTime": {"dateTime": "2025-10-23T16:45:00Z"},
    }
    context = context_of("CONF", native, saved)
    assert len(context["starts"]) == 22 and context["availableAt"] == "2025-10-26T14:00:00+00:00"
    assert context["date"] == "2025-10-23T16:45:00+00:00"
    saved["players"].pop()
    with pytest.raises(ValueError):
        context_of("CONF", native, saved)


def test_current_fixture_identity_requires_both_known_sides_and_unique_bounded_kickoff():
    native = {
        "id": "1",
        "homeTeam": {"id": "h"},
        "awayTeam": {"id": "a"},
        "kickOffTime": {"dateTime": "2026-10-22T19:00:00Z"},
    }
    source = {
        "id": "source",
        "date": "2026-10-22T19:10:00Z",
        "homeTeam": {"slug": "home", "name": "H"},
        "awayTeam": {"slug": "away", "name": "A"},
    }
    assert link_games([native], [source], {"home": "h", "away": "a"}) == {"1": source}
    assert link_games([native], [source], {"home": "h"}) == {}
    assert link_games([native], [{**source, "date": "2026-10-23T19:00:00Z"}], {"home": "h", "away": "a"}) == {}
    other = deepcopy(native)
    other["id"] = "2"
    assert link_games([native, other], [source], {"home": "h", "away": "a"}) == {}
