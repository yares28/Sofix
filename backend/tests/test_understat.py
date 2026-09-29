"""Understat's season player and team numbers: read politely, once per league, and never trusted when they go wrong."""

from __future__ import annotations

import gzip
import json
from datetime import date
from typing import Any

import httpx
import pytest

from app.sources import understat


def league_json() -> dict[str, Any]:
    """The shape Understat answers for getLeagueData, numbers as strings, as seen on 2026-09-29."""
    return {
        "teams": {
            "83": {
                "id": "83",
                "title": "Real Madrid",
                "history": [
                    {"xG": 2.0, "xGA": 0.5, "h_a": "h"},
                    {"xG": 1.0, "xGA": 1.5, "h_a": "a"},
                    {"xG": 3.0, "xGA": 0.1, "h_a": "h"},
                ],
            },
            "88": {"id": "88", "title": "Getafe", "history": []},
        },
        "players": [
            {
                "id": "12190",
                "player_name": "Arda Güler",
                "games": "7",
                "time": "359",
                "goals": "1",
                "xG": "1.9162545204162598",
                "assists": "2",
                "xA": "3.9",
                "shots": "11",
                "key_passes": "28",
                "yellow_cards": "1",
                "red_cards": "0",
                "position": "M S",
                "team_title": "Real Madrid",
                "npg": "1",
                "npxG": "1.9162545204162598",
                "xGChain": "5.8",
                "xGBuildup": "2.2",
            },
            {
                "id": "8026",
                "player_name": "Raphinha",
                "games": "7",
                "time": "577",
                "goals": "12",
                "xG": "9.057607993483543",
                "assists": "3",
                "xA": "2.6",
                "shots": "25",
                "key_passes": "14",
                "yellow_cards": "0",
                "red_cards": "0",
                "position": "F",
                "team_title": "Barcelona",
                "npg": "9",
                "npxG": "6.827774986624718",
                "xGChain": "10.2",
                "xGBuildup": "1.9",
            },
        ],
        "dates": [],
    }


def test_the_season_is_the_year_it_started() -> None:
    assert understat.season_of(date(2026, 9, 29)) == 2026  # 2026/27
    assert understat.season_of(date(2027, 3, 1)) == 2026
    assert understat.season_of(date(2026, 7, 1)) == 2026  # the new season opens in July
    assert understat.season_of(date(2026, 6, 30)) == 2025


def test_it_turns_strings_into_numbers_and_a_team_into_its_average_xg() -> None:
    league = understat.parse(league_json())

    guler = next(p for p in league.players if p.name == "Arda Güler")
    assert (guler.id, guler.team, guler.games, guler.position) == ("12190", "Real Madrid", 7, "M S")
    assert guler.minutes == 359.0
    assert guler.xg == pytest.approx(1.9162545)
    assert guler.npxg == pytest.approx(1.9162545)
    # A taker of penalties: what his xG holds beyond the non-penalty part.
    raphinha = next(p for p in league.players if p.name == "Raphinha")
    assert raphinha.xg - raphinha.npxg == pytest.approx(2.2298330)
    # Real Madrid's average over its three games; a team with no games has no average, not a zero.
    assert league.team_xg == {"Real Madrid": pytest.approx(2.0)}


def test_it_skips_a_player_whose_numbers_cannot_be_read() -> None:
    payload = league_json()
    payload["players"].append(
        {
            "id": "1",
            "player_name": "Broken",
            "games": "x",
            "time": "",
            "xG": None,
            "npxG": "1",
            "position": "F",
            "team_title": "A",
        }
    )
    assert [p.name for p in understat.parse(payload).players] == ["Arda Güler", "Raphinha"]


def client_for(handler) -> httpx.Client:
    return httpx.Client(transport=httpx.MockTransport(handler), headers={"User-Agent": understat.USER_AGENT})


def test_it_asks_once_per_league_politely_and_reads_a_gzip_body() -> None:
    seen: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(request)
        body = gzip.compress(json.dumps(league_json()).encode())  # Understat has answered a gzip body without saying so
        return httpx.Response(200, content=body, headers={"content-type": "text/javascript"})

    leagues = understat.fetch_leagues(
        ["laliga-es", "bundesliga-de", "mls-us"], 2026, client=client_for(handler), pause=0
    )

    # Only the leagues Understat covers are asked, one call each, with a clear agent and the header it expects.
    assert [r.url.path for r in seen] == ["/getLeagueData/La_liga/2026", "/getLeagueData/Bundesliga/2026"]
    assert all(r.headers["x-requested-with"] == "XMLHttpRequest" for r in seen)
    assert all("Sofix" in r.headers["user-agent"] for r in seen)
    assert set(leagues) == {"laliga-es", "bundesliga-de"}
    assert len(leagues["laliga-es"].players) == 2


def test_a_league_that_fails_is_left_out_and_never_stands_in_with_old_numbers() -> None:
    calls = {"n": 0}

    def handler(request: httpx.Request) -> httpx.Response:
        calls["n"] += 1
        if "La_liga" in request.url.path:
            return httpx.Response(503)
        return httpx.Response(200, json=league_json())

    leagues = understat.fetch_leagues(["laliga-es", "bundesliga-de"], 2026, client=client_for(handler), pause=0)

    assert set(leagues) == {"bundesliga-de"}  # LaLiga answered 503 twice (one retry) and has nothing
    assert calls["n"] == 3  # one retry on a server error, none on the league that worked


@pytest.mark.parametrize(
    "response",
    [
        httpx.Response(200, content=b"<html>not json</html>"),
        httpx.Response(200, json={"players": "no"}),
        httpx.Response(404),
    ],
)
def test_an_answer_that_is_not_league_data_is_a_failure_not_an_empty_league(response: httpx.Response) -> None:
    leagues = understat.fetch_leagues(["laliga-es"], 2026, client=client_for(lambda request: response), pause=0)
    assert leagues == {}
