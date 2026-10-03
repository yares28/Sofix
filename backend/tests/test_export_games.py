"""The export of every LaLiga game, player by player, that the new xScore is built and tracked on (plans/xscore.md P9 X1; roadmap 10.1)."""

from __future__ import annotations

import json
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any

from app.jobs import export_games as export
from app.sorare.client import SorareError

START = datetime(2026, 8, 20, tzinfo=UTC)


def listed(n: int, *, status: str = "played", team: str = "club") -> dict[str, Any]:
    """One game as `pastGames` lists it: game n, `n` days after START."""
    when = (START + timedelta(days=n)).isoformat().replace("+00:00", "Z")
    return {
        "id": f"Game:{n}",
        "date": when,
        "statusTyped": status,
        "homeGoals": n % 3,
        "awayGoals": 1,
        "homeTeam": {"slug": f"{team}-h{n}", "name": f"Home {n}"},
        "awayTeam": {"slug": f"{team}-a{n}", "name": f"Away {n}"},
    }


def score(slug: str, team: str, **fields: Any) -> dict[str, Any]:
    """A player's score as the first question returns it (a keeper who started and kept a clean sheet unless said otherwise)."""
    played = fields.pop("played", True)
    row: dict[str, Any] = {
        "score": 84.8 if played else 0.0,
        "scoringVersion": 3,
        "positionTyped": fields.pop("pos", "Goalkeeper"),
        "projection": {"score": 46.0, "grade": "C", "reliabilityBasisPoints": 10000},
        "anyPlayer": {"slug": slug},
        "anyPlayerGameStats": {
            "playedInGame": played,
            "gameStarted": (1 if fields.pop("started", True) else None) if played else None,
            "minsPlayed": 90 if played else 0,
            "penaltyTaken": 0,
            "setPieceTaken": 0,
            "cornerTaken": None,
            "attFreekickTotal": None,
            "anyTeam": {"slug": team},
        },
        "allAroundScore": 14.8 if played else 0.0,
        "decisiveScore": {"totalScore": 70.0 if played else 35.0},
    }
    row["anyPlayerGameStats"].update(fields)
    return row


def stats(slug: str, **values: float) -> dict[str, Any]:
    """The same player in the second question: every stat, most of them zero."""
    detail = [
        {"stat": "level_score", "statValue": 0, "totalScore": 70.0},
        {"stat": "mins_played", "statValue": 90, "totalScore": 0},
    ]
    detail += [{"stat": "yellow_card", "statValue": 0, "totalScore": 0}]
    detail += [{"stat": name, "statValue": value, "totalScore": round(value * 2, 1)} for name, value in values.items()]
    return {"anyPlayer": {"slug": slug}, "detailedScore": detail}


def formation(*, available: bool = True) -> dict[str, Any]:
    return {
        "startingLineupAvailable": available,
        "startingLineup": [[{"slug": "k1"}], [{"slug": "d1"}, {"slug": "d2"}]] if available else [],
        "bench": [{"slug": "b1"}] if available else [],
    }


class Sorare:
    """Sorare as the export sees it: the list of games a page at a time, and for a game the two questions."""

    def __init__(self, games: list[dict[str, Any]], *, page: int = 2, fail: dict[str, Exception] | None = None) -> None:
        self.games, self.page, self.fail = games, page, fail or {}
        self.asked: list[tuple[str, dict[str, Any]]] = []

    def query(self, text: str, variables: dict[str, Any] | None = None) -> dict[str, Any]:
        variables = variables or {}
        if "pastGames" in text:
            self.asked.append(("list", variables))
            newest_first = sorted(self.games, key=lambda g: g["date"], reverse=True)
            at = int(variables["after"]) if variables.get("after") else 0
            nodes = newest_first[at : at + self.page]
            more = at + self.page < len(newest_first)
            return {
                "football": {
                    "competition": {
                        "pastGames": {
                            "nodes": nodes,
                            "pageInfo": {"hasNextPage": more, "endCursor": str(at + self.page) if more else None},
                        }
                    }
                }
            }
        game_id = variables["id"]
        if game_id in self.fail:
            raise self.fail[game_id]
        if "detailedScore" in text:
            self.asked.append(("stats", variables))
            return {"anyGame": {"playerGameScores": [stats("k1", saves=5, clean_sheet_60=1), stats("m9")]}}
        self.asked.append(("scores", variables))
        return {
            "anyGame": {
                "homeFormation": formation(),
                "awayFormation": formation(available=False),
                "playerGameScores": [
                    score("k1", "club-h1"),
                    score("m9", "club-a1", pos="Midfielder", played=False),
                ],
            }
        }


# ------------------------------------------------------------------------------------------------ the list of games


def test_the_list_keeps_played_games_from_the_start_day_oldest_first_and_stops_asking_once_a_page_reaches_back_before_it() -> (
    None
):
    games = (
        [listed(n) for n in (1, 2, 3, 4, 5)]
        + [listed(6, status="postponed")]
        + [listed(n) for n in (-3, -4, -5, -6, -7)]
    )
    sorare = Sorare(games, page=3)

    found = export.fetch_game_list(sorare, START)

    assert [g["id"] for g in found] == [
        "Game:1",
        "Game:2",
        "Game:3",
        "Game:4",
        "Game:5",
    ]  # postponed and older ones left out
    assert found[0]["home"] == {"slug": "club-h1", "name": "Home 1"} and found[0]["away"]["slug"] == "club-a1"
    assert found[0]["homeGoals"] == 1 and found[0]["awayGoals"] == 1
    lists = [asked for kind, asked in sorare.asked if kind == "list"]
    assert (
        len(lists) == 3
    )  # newest first: 6 5 4 / 3 2 1 / -3 -4 -5 reaches before the start: the page after it is never asked


# ------------------------------------------------------------------------------------------------ one game


def test_a_game_comes_back_with_each_players_score_its_parts_his_team_and_the_stats_he_made() -> None:
    sorare = Sorare([listed(1)])
    game = export.fetch_game(sorare, export.fetch_game_list(sorare, START)[0])

    keeper = game["players"]["k1"]
    assert keeper["pos"] == "GK" and keeper["team"] == "club-h1"
    assert keeper["score"] == 84.8 and keeper["level"] == 70.0 and keeper["aa"] == 14.8
    assert keeper["ver"] == 3  # which scoring table Sorare used for this game
    assert keeper["proj"] == 46.0 and keeper["grade"] == "C" and keeper["rel"] == 10000
    assert keeper["played"] is True and keeper["started"] is True and keeper["mins"] == 90
    assert (
        keeper["pen"] == 0 and keeper["setp"] == 0 and keeper["corners"] == 0 and keeper["fk"] == 0
    )  # a missing count is none
    # Only what he did, each with the points it earned: no zeros, and the level and the minutes are not stats.
    assert keeper["stats"] == {"saves": [5, 10.0], "clean_sheet_60": [1, 2.0]}
    assert game["id"] == "Game:1" and game["homeGoals"] == 1  # what the list said travels with it


def test_a_player_who_did_not_play_is_kept_with_nothing_made() -> None:
    sorare = Sorare([listed(1)])
    game = export.fetch_game(sorare, export.fetch_game_list(sorare, START)[0])

    bench = game["players"]["m9"]
    assert bench["pos"] == "MID" and bench["played"] is False and bench["started"] is False and bench["mins"] == 0
    assert bench["level"] == 35.0 and bench["stats"] == {}


def test_the_official_elevens_say_whether_they_were_out_and_who_started_and_sat() -> None:
    sorare = Sorare([listed(1)])
    game = export.fetch_game(sorare, export.fetch_game_list(sorare, START)[0])

    assert game["xi"]["home"] == {"available": True, "start": [["k1"], ["d1", "d2"]], "bench": ["b1"]}
    assert game["xi"]["away"] == {"available": False, "start": [], "bench": []}


# ------------------------------------------------------------------------------------------------ the run


def lines(out: Path) -> list[dict[str, Any]]:
    return [json.loads(line) for line in out.read_text("utf-8").splitlines() if line.strip()]


def test_a_run_writes_a_line_per_game_and_a_second_run_reads_only_the_games_it_does_not_have(tmp_path: Path) -> None:
    out = tmp_path / "games.jsonl"
    first = Sorare([listed(1), listed(2)])
    result = export.run(first, export.fetch_game_list(first, START), out, pause=0)
    assert result["games"] == 2 and [g["id"] for g in lines(out)] == ["Game:1", "Game:2"]

    second = Sorare([listed(1), listed(2), listed(3)])
    result = export.run(second, export.fetch_game_list(second, START), out, pause=0)

    assert result["games"] == 1 and result["skipped"] == 2
    assert [g["id"] for g in lines(out)] == ["Game:1", "Game:2", "Game:3"]
    assert {asked["id"] for kind, asked in second.asked if kind != "list"} == {
        "Game:3"
    }  # nothing already kept is asked again


def test_a_limit_reads_only_that_many_games_and_the_next_run_goes_on_from_there(tmp_path: Path) -> None:
    out = tmp_path / "games.jsonl"
    sorare = Sorare([listed(1), listed(2), listed(3)])
    games = export.fetch_game_list(sorare, START)

    first = export.run(sorare, games, out, pause=0, limit=2)
    second = export.run(sorare, games, out, pause=0, limit=2)

    assert first["games"] == 2 and second["games"] == 1 and second["skipped"] == 2
    assert [g["id"] for g in lines(out)] == ["Game:1", "Game:2", "Game:3"]


def test_a_game_sorare_will_not_give_is_listed_and_the_run_goes_on(tmp_path: Path) -> None:
    out = tmp_path / "games.jsonl"
    sorare = Sorare([listed(1), listed(2)], fail={"Game:1": SorareError("no such game")})

    result = export.run(sorare, export.fetch_game_list(sorare, START), out, pause=0)

    assert result["failed"] == ["Game:1"] and result["games"] == 1
    assert [g["id"] for g in lines(out)] == ["Game:2"]


def test_a_run_that_is_still_refused_after_the_waits_stops_there_keeping_what_it_has(tmp_path: Path) -> None:
    out = tmp_path / "games.jsonl"
    sorare = Sorare([listed(1), listed(2), listed(3)], fail={"Game:2": SorareError("rate limited, try later")})

    result = export.run(sorare, export.fetch_game_list(sorare, START), out, pause=0, cool_down=0)

    assert result["stoppedAt"] == "Game:2" and result["games"] == 1
    assert [g["id"] for g in lines(out)] == [
        "Game:1"
    ]  # the game before it is kept, the one after is left for the next run


def test_a_half_written_last_line_is_dropped_and_that_game_is_read_again(tmp_path: Path) -> None:
    out = tmp_path / "games.jsonl"
    sorare = Sorare([listed(1), listed(2)])
    export.run(sorare, export.fetch_game_list(sorare, START), out, pause=0)
    out.write_text(out.read_text("utf-8") + '{"id":"Game:3","da', "utf-8")  # a run stopped in the middle of a line

    again = Sorare([listed(1), listed(2), listed(3)])
    result = export.run(again, export.fetch_game_list(again, START), out, pause=0)

    assert result["games"] == 1 and [g["id"] for g in lines(out)] == ["Game:1", "Game:2", "Game:3"]
