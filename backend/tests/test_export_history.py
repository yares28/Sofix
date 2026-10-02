"""The one-off export of the owner's players' game history that the xScore backtest runs on (roadmap 3.1, plans/xscore.md P2)."""

from __future__ import annotations

import json
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any

import pytest

from app.jobs import export_history as export

SINCE = datetime(2026, 1, 1, tzinfo=UTC)
END = datetime(2026, 4, 1, tzinfo=UTC)


def game(
    day: int, *, score: float = 50.0, played: bool = True, started: bool = True, competition: str = "laliga-es"
) -> dict[str, Any]:
    when = SINCE + timedelta(days=day)
    return {
        "date": when.isoformat().replace("+00:00", "Z"),
        "competition": competition,
        "gameId": f"g{day}",
        "score": score if played else 0.0,
        "played": played,
        "started": started and played,
        "mins": 90 if played else None,
        "status": "FINAL" if played else "DID_NOT_PLAY",
    }


class Sorare:
    """Sorare as the export sees it: a player's games in a window, at most `page` of them, and what it was asked."""

    def __init__(self, games: dict[str, list[dict[str, Any]]], page: int = 8) -> None:
        self.games, self.page, self.asked = games, page, []

    def query(self, text: str, variables: dict[str, Any] | None = None) -> dict[str, Any]:
        variables = variables or {}
        self.asked.append(variables)
        slug = variables["p"]
        start = datetime.fromisoformat(variables["from"])
        end = datetime.fromisoformat(variables["to"])
        inside = [
            g
            for g in self.games.get(slug, [])
            if start <= datetime.fromisoformat(g["date"].replace("Z", "+00:00")) <= end
        ]
        nodes = [
            {
                "score": g["score"],
                "scoreStatus": g["status"],
                "anyGame": {"id": g["gameId"], "date": g["date"], "competition": {"slug": g["competition"]}},
                "anyPlayerGameStats": {
                    "playedInGame": g["played"],
                    "gameStarted": g["started"] or None,
                    "minsPlayed": g["mins"],
                },
            }
            for g in inside[: self.page]
        ]
        return {
            "anyPlayer": {
                "displayName": slug.replace("-", " ").title(),
                "position": "Forward",
                "activeClub": {"name": "Club A"},
                "activeNationalTeam": {"name": "Spain"},
                "allPlayerGameScores": {"nodes": nodes},
            }
        }


def test_a_players_games_come_back_once_each_in_date_order_with_what_the_backtest_needs() -> None:
    sorare = Sorare({"p1": [game(30, score=61.5), game(5, played=False), game(70, started=False, score=33.0)]})

    found = export.fetch_player(sorare, "p1", SINCE, END)

    assert found["pos"] == "FWD" and found["name"] == "P1" and found["club"] == "Club A" and found["nation"] == "Spain"
    assert [g["gameId"] for g in found["games"]] == ["g5", "g30", "g70"]
    first, second, third = found["games"]
    assert (first["played"], first["started"], first["mins"], first["status"]) == (False, False, None, "DID_NOT_PLAY")
    assert (second["score"], second["started"], second["mins"], second["competition"]) == (61.5, True, 90, "laliga-es")
    assert third["started"] is False and third["played"] is True


def test_a_window_that_comes_back_full_is_split_so_no_game_is_lost_to_the_page_limit() -> None:
    crowded = [game(day) for day in range(10, 30)]  # twenty games in a month: far over a page of eight
    sorare = Sorare({"p1": crowded}, page=8)

    found = export.fetch_player(sorare, "p1", SINCE, END)

    assert [g["gameId"] for g in found["games"]] == [f"g{day}" for day in range(10, 30)]
    assert len(sorare.asked) > 3


def test_a_game_on_the_edge_of_two_windows_is_kept_once() -> None:
    edge = export.WINDOW  # the first window ends where the second begins
    sorare = Sorare({"p1": [game(edge.days)]})

    found = export.fetch_player(sorare, "p1", SINCE, SINCE + 3 * edge)

    assert [g["gameId"] for g in found["games"]] == [f"g{edge.days}"]


def test_a_player_sorare_cannot_answer_for_is_left_out_not_fatal(tmp_path: Path) -> None:
    class Failing(Sorare):
        def query(self, text: str, variables: dict[str, Any] | None = None) -> dict[str, Any]:
            if (variables or {}).get("p") == "broken":
                raise export.SorareError("no")
            return super().query(text, variables)

    out = tmp_path / "history.json"
    sorare = Failing({"ok": [game(10)]})

    done = export.run(sorare, ["broken", "ok"], out, since=SINCE, until=END, pause=0)

    assert done == {"players": 1, "games": 1, "failed": ["broken"], "skipped": 0}
    saved = json.loads(out.read_text("utf-8"))
    assert list(saved["players"]) == ["ok"] and saved["since"] == SINCE.isoformat()


class Limited(Sorare):
    """Sorare as it answers a client that asked too fast: the nth call (counting from 1) and every one after `until` are refused."""

    def __init__(
        self, games: dict[str, list[dict[str, Any]]], *, refused: set[int] | None = None, always: bool = False
    ) -> None:
        super().__init__(games)
        self.calls, self.refused, self.always = 0, refused or set(), always

    def query(self, text: str, variables: dict[str, Any] | None = None) -> dict[str, Any]:
        self.calls += 1
        if self.always or self.calls in self.refused:
            raise export.SorareError("gave up after 3 tries: rate limited")
        return super().query(text, variables)


def test_a_rate_limit_is_waited_out_and_only_the_refused_question_is_asked_again(tmp_path: Path) -> None:
    out = tmp_path / "history.json"
    sorare = Limited({"a": [game(10), game(40)]}, refused={3})  # refused on the third window of the first player

    done = export.run(sorare, ["a"], out, since=SINCE, until=END, pause=0, cool_down=0)

    assert done == {"players": 1, "games": 2, "failed": [], "skipped": 0}
    assert sorare.calls == len(sorare.asked) + 1, "one refusal, and the windows before it were not asked for again"


def test_a_run_that_stays_rate_limited_stops_where_it_is_instead_of_leaving_out_every_player_after(
    tmp_path: Path,
) -> None:
    out = tmp_path / "history.json"
    sorare = Limited({"a": [game(10)], "b": [game(20)]}, always=True)

    done = export.run(sorare, ["a", "b"], out, since=SINCE, until=END, pause=0, cool_down=0)

    assert done["stoppedAt"] == "a" and done["players"] == 0 and done["failed"] == []
    assert sorare.calls == export.RATE_WAITS + 1, (
        "the question was tried once and again after each wait, and b was never asked"
    )
    assert not out.exists(), "nothing was learned, so nothing is written"


class Gameweeks:
    """Sorare's list of gameweeks, two to a page."""

    def __init__(self, nodes: list[dict[str, Any]]) -> None:
        self.nodes = nodes

    def query(self, text: str, variables: dict[str, Any] | None = None) -> dict[str, Any]:
        start = int((variables or {}).get("after") or 0)
        return {
            "so5": {
                "so5Fixtures": {
                    "pageInfo": {"hasNextPage": start + 2 < len(self.nodes), "endCursor": str(start + 2)},
                    "nodes": self.nodes[start : start + 2],
                }
            }
        }


def gameweek(slug: str, start: str, end: str) -> dict[str, Any]:
    return {"slug": slug, "startDate": start, "endDate": end, "cutOffDate": start}


def test_the_gameweeks_come_back_page_by_page_with_their_windows_oldest_first() -> None:
    nodes = [
        gameweek("gw3", "2026-10-02T14:00:00Z", "2026-10-06T14:00:00Z"),
        gameweek("gw1", "2026-09-18T14:00:00Z", "2026-09-22T14:00:00Z"),
        {"slug": "no-dates"},
        gameweek("gw2", "2026-09-25T14:00:00Z", "2026-09-29T14:00:00Z"),
    ]

    found = export.fetch_fixtures(Gameweeks(nodes))

    assert [f["slug"] for f in found] == ["gw1", "gw2", "gw3"], "all three pages read, the one without dates left out"
    assert found[0] == {
        "slug": "gw1",
        "start": "2026-09-18T14:00:00Z",
        "end": "2026-09-22T14:00:00Z",
        "cutOff": "2026-09-18T14:00:00Z",
    }


def test_the_file_keeps_the_gameweeks_and_a_later_run_does_not_lose_them(tmp_path: Path) -> None:
    out = tmp_path / "history.json"
    windows = [
        {
            "slug": "gw1",
            "start": "2026-01-02T14:00:00Z",
            "end": "2026-01-06T14:00:00Z",
            "cutOff": "2026-01-02T14:00:00Z",
        }
    ]
    export.run(Sorare({"a": [game(10)]}), ["a"], out, since=SINCE, until=END, pause=0, fixtures=windows)
    assert json.loads(out.read_text("utf-8"))["fixtures"] == windows

    export.run(Sorare({"a": [game(10)], "b": [game(20)]}), ["a", "b"], out, since=SINCE, until=END, pause=0)

    assert json.loads(out.read_text("utf-8"))["fixtures"] == windows, (
        "a run that was not given them keeps what the file had"
    )


def test_a_run_that_was_stopped_goes_on_where_it_stopped(tmp_path: Path) -> None:
    out = tmp_path / "history.json"
    sorare = Sorare({"a": [game(10)], "b": [game(20)]})
    export.run(sorare, ["a"], out, since=SINCE, until=END, pause=0)

    again = Sorare({"a": [game(10)], "b": [game(20)]})
    done = export.run(again, ["a", "b"], out, since=SINCE, until=END, pause=0)

    assert done["skipped"] == 1 and done["players"] == 1, "a was kept, only b was asked for"
    assert {v["p"] for v in again.asked} == {"b"}
    assert sorted(json.loads(out.read_text("utf-8"))["players"]) == ["a", "b"]


def test_the_players_of_the_collection_are_each_listed_once_with_their_position() -> None:
    page = {
        "collection": [
            {"player": "a", "pos": "GK"},
            {"player": "b", "pos": "MID"},
            {"player": "a", "pos": "GK"},
            {"pos": "FWD"},
        ]
    }

    assert export.collection_players(page) == {"a": "GK", "b": "MID"}
    assert export.collection_players({}) == {}


@pytest.mark.parametrize("name", ["position", "unknown"])
def test_a_position_sorare_does_not_know_is_kept_as_none(name: str) -> None:
    class Odd(Sorare):
        def query(self, text: str, variables: dict[str, Any] | None = None) -> dict[str, Any]:
            data = super().query(text, variables)
            data["anyPlayer"]["position"] = name
            return data

    assert export.fetch_player(Odd({"p1": [game(10)]}), "p1", SINCE, END)["pos"] is None
