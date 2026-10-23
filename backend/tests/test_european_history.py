from copy import deepcopy
from datetime import UTC, datetime, timedelta
from types import SimpleNamespace

import pytest

from app.sorare.european_history import context_of, link_games, pending_scores
from tests.test_european_cases import sample


def test_cold_final_timestamp_is_retained_and_reviewing_does_not_block_other_games(monkeypatch):
    from app.sorare import european_history as h

    now = datetime(2026, 10, 23, tzinfo=UTC)
    native = [
        {
            "id": str(i),
            "status": "FINISHED",
            "homeTeam": {"id": "h"},
            "awayTeam": {"id": "a"},
            "kickOffTime": {"dateTime": (now - timedelta(days=5)).isoformat()},
        }
        for i in range(2)
    ]
    monkeypatch.setattr(h.european_sources, "calendars", lambda _: {"CL": {2026: native}})
    monkeypatch.setattr(h, "is_main", lambda _: True)
    source = [{"id": str(i), "date": native[i]["kickOffTime"]["dateTime"]} for i in range(2)]
    monkeypatch.setattr(h, "recent_index", lambda *args: source)
    monkeypatch.setattr(h, "align", lambda *args: {"bindings": {}})
    monkeypatch.setattr(h, "link_games", lambda *args: {r["id"]: r for r in source})

    def snapshot(code, game, raw):
        saved = sample()
        saved["raw"]["date"] = game["date"]
        if game["id"] == "0":
            saved["players"][0]["status"] = "REVIEWING"
        return saved

    monkeypatch.setattr(h, "game_snapshot", snapshot)
    monkeypatch.setattr(h.foreign_history, "history_of_slug", lambda *args: {})
    client = SimpleNamespace(query=lambda *args: {"anyGame": {"statusTyped": "played"}})
    _, state = h.collect(client, now, {})
    assert state["complete"] and len(state["pending"]) == 1
    assert list(state["games"]) == ["1"]
    assert state["games"]["1"]["availableAt"] == now.isoformat()
    assert state["games"]["1"]["firstFinalAt"] == now.isoformat()
    _, later = h.collect(client, now + timedelta(hours=1), state)
    assert later["games"]["1"]["firstFinalAt"] == now.isoformat()


def test_reviewing_scores_remain_pending_not_zero_or_an_admitted_history_case():
    saved = sample()
    saved["players"][0]["status"] = "REVIEWING"
    assert pending_scores(saved) is True
    assert pending_scores(sample()) is False
    broken = sample()
    broken["players"].pop()
    with pytest.raises(ValueError):
        pending_scores(broken)


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
