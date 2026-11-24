"""Sofix's xS for every upcoming game of every tracked player (plans/xs-ahead.md, owner 24 Nov 2026)."""

from datetime import UTC, datetime, timedelta

from app.sorare import ahead
from app.sorare.keeper import Outcome
from app.sorare.scores import Made

NOW = datetime(2026, 11, 24, 12, tzinfo=UTC)


def at(days: float) -> str:
    return (NOW + timedelta(days=days)).isoformat().replace("+00:00", "Z")


def cell(opponent: str, days: float, venue: str = "H", status: str = "scheduled") -> dict:
    return {
        "opponent_code": opponent,
        "kickoff_utc": at(days),
        "venue": venue,
        "status": status,
        "prediction": {"xg_for": 1.5},
    }


LALIGA = {
    "teams": [
        {
            "code": "ELC",
            "name": "Elche",
            "cells": [
                [cell("ATL", 4)],
                [cell("BAR", 11, "A")],
                [cell("RMA", 60)],
                [cell("SEV", -3, status="finished")],
            ],
        },
        {"code": "ATL", "name": "Atleti", "cells": [[cell("ELC", 4, "A")]]},
        {"code": "BAR", "name": "Barcelona", "cells": [[cell("ELC", 11, "H")]]},
    ]
}
PL = {
    "competition": "PL",
    "teams": [
        {"code": "ARS", "name": "Arsenal", "history_name": "Arsenal", "cells": [[cell("CHE", 5)]]},
        {"code": "CHE", "name": "Chelsea", "history_name": "Chelsea", "cells": [[cell("ARS", 5, "A")]]},
    ],
}
CL = {
    "competition": "CL",
    "_fresh": True,
    "teams": [
        {"code": "ELC", "name": "Elche", "sorare_slug": "elche-cf", "cells": [[cell("PSG", 8, "A")]]},
        {"code": "PSG", "name": "Paris", "sorare_slug": "psg-paris", "cells": [[cell("ELC", 8, "H")]]},
    ],
}


def player(slug: str, club: str, club_slug: str, league: str, position: str = "Defender") -> dict:
    return {
        "player": {
            "slug": slug,
            "position": position,
            "activeClub": {"name": club, "slug": club_slug, "domesticLeague": {"slug": league}},
        }
    }


def test_a_clubs_games_on_every_board_in_the_next_45_days_in_kickoff_order():
    games = ahead.club_games(player("chust", "Elche CF", "elche-cf", "laliga-es")["player"], LALIGA, {"CL": CL}, NOW)
    assert [(g["competition"], g["opponent"], g["venue"]) for g in games] == [
        ("laliga-es", "Atleti", "H"),
        ("uefa-champions-league", "Paris", "A"),
        ("laliga-es", "Barcelona", "A"),
    ]  # the finished game and the one 60 days away are left out
    assert all(g["forecastBefore"] == NOW.isoformat() for g in games)
    assert games[1]["teamSlug"] == "elche-cf" and games[1]["opponentSlug"] == "psg-paris"


def test_a_stale_european_board_and_a_club_on_no_board_add_no_game():
    stale = {**CL, "_fresh": False}
    games = ahead.club_games(player("chust", "Elche CF", "elche-cf", "laliga-es")["player"], LALIGA, {"CL": stale}, NOW)
    assert {g["competition"] for g in games} == {"laliga-es"}
    assert ahead.club_games(player("x", "Unknown FC", "unknown", "laliga-es")["player"], LALIGA, {}, NOW) == []
    # A club name the league's board does not know is no club of it, never an error
    assert (
        ahead.club_games(
            player("y", "Wolverhampton Wanderers FC", "wolves", "premier-league-gb-eng")["player"],
            LALIGA,
            {"PL": PL},
            NOW,
        )
        == []
    )


def outcome(start: float) -> Outcome:
    return Outcome(
        p_clean_sheet=0.3, p_decisive=0.25, if_decisive=70.0, if_plain=45.0, start=start, low=30.0, high=70.0
    )


def test_every_game_is_scored_by_the_jobs_own_scorer_and_published_by_league():
    asked: list[tuple[str, str, list]] = []

    def scorer(p, games, projection, past):
        assert (
            len(games) == 1 and projection is None
        )  # each game on its own, Sorare's projection never used this far out
        asked.append((p["slug"], games[0]["kickoff"], past))
        if games[0]["opponent"] == "Barcelona":
            return Made((), None)  # a game the model cannot tell is left out, never filled in
        return Made((outcome(50.0 + len(asked)),), None)

    rows = [
        player("chust", "Elche CF", "elche-cf", "laliga-es"),
        player("saka", "Arsenal FC", "arsenal", "premier-league-gb-eng", "Forward"),
    ]
    history = {"chust": [{"date": at(-7), "score": 60.0}]}
    out = ahead.build(rows, history, scorer, LALIGA, {"CL": CL, "PL": PL}, NOW)
    assert set(out) == {"LL", "PL"}
    chust = out["LL"]["players"]["chust"]
    assert [r[1] for r in chust] == ["laliga-es", "uefa-champions-league"]
    assert chust[0][:4] == [at(4), "laliga-es", "H", "Atleti"] and chust[0][4] == 51.0 and chust[0][6] == 0.25
    assert chust[0][7] == [0.25, 45.0, 70.0, 0.0, 0.0]  # v3's whole model: chance, normal, decisive, their spreads
    assert out["PL"]["players"]["saka"][0][3] == "Chelsea"
    assert out["LL"]["horizonDays"] == 45
    assert asked[0][2] == history["chust"]  # his own past, as the job's next-game number uses it


def test_each_games_xs_is_kept_as_it_was_said_at_35_21_14_7_and_2_days_and_dropped_a_month_after_it():
    block = {
        "LL": {
            "horizonDays": 45,
            "players": {
                "chust": [
                    [at(20), "laliga-es", "H", "Atleti", 52.0, 40.0, 0.2],
                    [at(1.5), "laliga-es", "A", "Getafe", 49.0, 39.0, 0.2],
                ]
            },
        }
    }
    said = ahead.remember({}, block, NOW)
    assert said == {
        f"chust|laliga-es|{at(20)[:10]}": {"35": 52.0, "21": 52.0},
        f"chust|laliga-es|{at(1.5)[:10]}": {"35": 49.0, "21": 49.0, "14": 49.0, "7": 49.0, "2": 49.0},
    }
    # A later run keeps what was said first and adds only a mark just crossed
    block["LL"]["players"]["chust"][0][4] = 55.0
    later = ahead.remember(said, block, NOW + timedelta(days=7))
    assert later[f"chust|laliga-es|{at(20)[:10]}"] == {"35": 52.0, "21": 52.0, "14": 55.0}
    old = {"x|laliga-es|2026-10-01": {"7": 50.0}}
    assert "x|laliga-es|2026-10-01" not in ahead.remember(old, block, NOW)


def test_a_player_of_a_league_no_board_covers_keeps_his_european_games():
    rows = [player("psg-man", "Paris", "psg-paris", "liga-portugal")]
    out = ahead.build(rows, {}, lambda p, g, pr, past: Made((outcome(55.0),), None), LALIGA, {"CL": CL}, NOW)
    assert list(out) == ["EU"]
    assert out["EU"]["players"]["psg-man"][0][1:4] == ["uefa-champions-league", "H", "Elche"]
