"""What a run could not get from Sorare: counted, so a week is not made final on the one run that happened to miss something."""

from __future__ import annotations

from typing import Any

import httpx
import pytest

from app.sorare import client as client_module
from app.sorare import sync
from app.sorare.client import SorareClient, SorareError


def client_with(handler: Any, monkeypatch: pytest.MonkeyPatch) -> SorareClient:
    monkeypatch.setattr(
        client_module.time, "sleep", lambda seconds: None
    )  # the back-off between tries is not the point
    return SorareClient(api_key="k", pause=0, client=httpx.Client(transport=httpx.MockTransport(handler)))


# --------------------------------------------------------------------------- the client counts questions that got no answer
def test_an_answer_is_returned_and_is_not_an_error(monkeypatch: pytest.MonkeyPatch) -> None:
    client = client_with(lambda request: httpx.Response(200, json={"data": {"ok": True}}), monkeypatch)
    assert client.query("query { ok }") == {"ok": True}
    assert (client.calls, client.errors) == (1, 0)


def test_a_rate_limit_that_clears_is_not_an_error(monkeypatch: pytest.MonkeyPatch) -> None:
    answers = iter([httpx.Response(429), httpx.Response(200, json={"data": {"ok": True}})])
    client = client_with(lambda request: next(answers), monkeypatch)
    assert client.query("query { ok }") == {"ok": True}
    assert (client.calls, client.errors) == (2, 0)


def test_a_server_that_keeps_failing_is_tried_three_times_and_counted_once(monkeypatch: pytest.MonkeyPatch) -> None:
    client = client_with(lambda request: httpx.Response(503), monkeypatch)
    with pytest.raises(SorareError):
        client.query("query { ok }")
    assert (client.calls, client.errors) == (3, 1)


def test_a_question_sorare_refuses_is_counted(monkeypatch: pytest.MonkeyPatch) -> None:
    client = client_with(
        lambda request: httpx.Response(200, json={"errors": [{"message": "no such field"}]}), monkeypatch
    )
    with pytest.raises(SorareError):
        client.query("query { nope }")
    assert client.errors == 1


def test_an_answer_with_no_data_is_counted(monkeypatch: pytest.MonkeyPatch) -> None:
    client = client_with(lambda request: httpx.Response(200, json={"data": None}), monkeypatch)
    with pytest.raises(SorareError):
        client.query("query { ok }")
    assert client.errors == 1


# --------------------------------------------------------------------------- what the replay of the week just played lacks
def owner(*players: tuple[str, bool]) -> list[dict[str, Any]]:
    """Cards of players, each with (or without) a game in the week just played."""
    return [{"player": {"slug": slug, "past": [{"id": "g"}] if played else []}} for slug, played in players]


def test_nothing_missing_is_no_gap() -> None:
    comps = [
        {"league": "Europe", "track": "Contender"},
        {"league": "MLS", "track": "Cup", "skipped": "no cards in this league"},
    ]
    assert sync.past_gaps(comps, owner(("a", True), ("b", False)), {"a": []}, 0) == []


def test_a_competition_that_could_not_be_read_is_a_gap() -> None:
    comps = [
        {"league": "Europe", "track": "Champion", "skipped": "could not be read"},
        {"league": "Europe", "track": "Contender"},
    ]
    assert sync.past_gaps(comps, [], {}, 0) == ["Europe | Champion: could not be read"]


def test_a_player_with_a_game_that_week_and_no_scores_read_is_a_gap_and_one_without_a_game_is_not() -> None:
    cards = owner(("played", True), ("unread", True), ("idle", False))
    assert sync.past_gaps([], cards, {"played": []}, 0) == ["unread: his scores could not be read"]


def test_questions_that_got_no_answer_are_a_gap() -> None:
    assert sync.past_gaps([], [], {}, 2) == [
        "2 question(s) about the week's competitions and what they paid got no answer"
    ]
