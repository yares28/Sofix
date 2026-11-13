import asyncio
from datetime import UTC, datetime

import httpx
import pytest
from sqlalchemy.orm import sessionmaker

from app.jobs import scorer_odds
from app.models import ReadModel
from tests import test_pipeline

db = test_pipeline.db

NOW = datetime(2026, 11, 14, 9, tzinfo=UTC)
KEY = "k" * 32
SOON = {"id": "ev1", "home_team": "Real Sociedad", "away_team": "Malaga", "commence_time": "2026-11-14T20:00:00Z"}
LATER = {"id": "ev2", "home_team": "Barcelona", "away_team": "Sevilla FC", "commence_time": "2026-11-16T20:00:00Z"}
STARTED = {"id": "ev3", "home_team": "Getafe", "away_team": "Celta Vigo", "commence_time": "2026-11-14T08:00:00Z"}


def props(event):
    return {
        **event,
        "bookmakers": [
            {
                "key": "fanduel",
                "markets": [
                    {
                        "key": "player_goal_scorer_anytime",
                        "last_update": "2026-11-14T08:55:00Z",
                        "outcomes": [
                            {"name": "Yes", "description": "Mikel Oyarzabal", "price": 2.4},
                            {"name": "Yes", "description": "Takefusa Kubo", "price": 3.8},
                        ],
                    },
                    {
                        "key": "player_shots_on_target",
                        "outcomes": [{"name": "Over", "description": "Mikel Oyarzabal", "point": 0.5, "price": 1.5}],
                    },
                ],
            }
        ],
    }


def client(events, odds, remaining="400", calls=None):
    def handler(request: httpx.Request) -> httpx.Response:
        if calls is not None:
            calls.append(request)
        if request.url.path.endswith("/events"):
            return httpx.Response(200, json=events, headers={"x-requests-remaining": remaining})
        event_id = request.url.path.split("/")[-2]
        return httpx.Response(200, json=odds[event_id], headers={"x-requests-remaining": remaining})

    return httpx.AsyncClient(transport=httpx.MockTransport(handler))


def factory(session):
    return sessionmaker(bind=session.get_bind())


def run(session, http, now=NOW, key=KEY):
    return asyncio.run(scorer_odds.main(factory(session), http, now, key))


def test_without_a_key_nothing_is_asked(db):
    assert run(db, client([], {}), key="") == {"skipped": "no ODDS_API_KEY"}


def test_each_game_is_saved_once_within_a_day_of_kick_off(db):
    calls: list[httpx.Request] = []
    result = run(db, client([SOON, LATER, STARTED], {"ev1": props(SOON)}, calls=calls), NOW)
    assert result["saved"] == ["Real Sociedad v Malaga"]
    asked = [c for c in calls if not c.url.path.endswith("/events")]
    assert [c.url.path.split("/")[-2] for c in asked] == ["ev1"]  # not the far game, not the started one
    assert asked[0].url.params["regions"] == "us"
    assert set(asked[0].url.params["markets"].split(",")) == set(scorer_odds.MARKETS)

    row = db.get(ReadModel, "scorer_odds:ev1")
    assert row is not None
    payload = row.payload
    assert payload["kickoff"] == "2026-11-14T20:00:00+00:00" and payload["capturedAt"] == NOW.isoformat()
    assert payload["hoursBefore"] == 11.0
    goal = payload["markets"]["player_goal_scorer_anytime"]
    assert goal["Mikel Oyarzabal"] == [["fanduel", "Yes", None, 2.4]]
    assert payload["markets"]["player_shots_on_target"]["Mikel Oyarzabal"] == [["fanduel", "Over", 0.5, 1.5]]

    calls.clear()
    again = run(db, client([SOON], {"ev1": props(SOON)}, calls=calls), NOW)
    assert again["saved"] == [] and [c for c in calls if not c.url.path.endswith("/events")] == []


def test_a_game_without_player_prices_yet_is_tried_again(db):
    first = run(db, client([SOON], {"ev1": {**SOON, "bookmakers": []}}), NOW)
    assert first["saved"] == [] and first["noPrices"] == ["Real Sociedad v Malaga"]
    assert db.get(ReadModel, "scorer_odds:ev1") is None
    assert run(db, client([SOON], {"ev1": props(SOON)}), NOW)["saved"] == ["Real Sociedad v Malaga"]


def test_the_match_odds_keep_their_credits(db):
    calls: list[httpx.Request] = []
    low = str(scorer_odds.RESERVE + len(scorer_odds.MARKETS) - 1)
    result = run(db, client([SOON], {"ev1": props(SOON)}, remaining=low, calls=calls), NOW)
    assert result["saved"] == [] and result["held"] == ["Real Sociedad v Malaga"]
    assert [c for c in calls if not c.url.path.endswith("/events")] == []


@pytest.mark.parametrize("status", [401, 429, 500])
def test_errors_never_carry_the_key(db, status):
    http = httpx.AsyncClient(transport=httpx.MockTransport(lambda r: httpx.Response(status, json={"m": str(r.url)})))
    with pytest.raises(Exception) as caught:
        run(db, http)
    assert KEY not in str(caught.value)


def test_transport_errors_never_carry_the_key(db, caplog):
    def handler(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError(f"boom {request.url}")

    with pytest.raises(RuntimeError) as caught:
        run(db, httpx.AsyncClient(transport=httpx.MockTransport(handler)))
    assert KEY not in str(caught.value) and KEY not in caplog.text
