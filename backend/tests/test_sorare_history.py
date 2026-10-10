"""What the run keeps of each player's past games: the score, and whether he started or came on."""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Any

from app.sorare import sync


class FakeClient:
    def __init__(self, nodes: list[dict[str, Any]]) -> None:
        self.nodes = nodes
        self.queries: list[str] = []

    def query(self, query: str, variables: dict[str, Any] | None = None) -> dict[str, Any]:
        self.queries.append(query)
        return {"anyPlayer": {"allPlayerGameScores": {"nodes": self.nodes}}}


def game(date: str, score: float, stats: dict[str, Any] | None) -> dict[str, Any]:
    return {
        "score": score,
        "scoreStatus": "FINAL",
        "anyGame": {"id": f"g-{date}", "date": date, "competition": {"slug": "laliga-es"}},
        "anyPlayerGameStats": stats,
    }


def test_history_says_whether_he_started_and_for_how_long() -> None:
    client = FakeClient(
        [
            game("2026-09-26T18:00:00Z", 90.7, {"playedInGame": True, "gameStarted": 1, "minsPlayed": 90}),
            game("2026-09-20T18:00:00Z", 41.0, {"playedInGame": True, "gameStarted": 0, "minsPlayed": 22}),
            game("2026-09-13T18:00:00Z", 0.0, {"playedInGame": False, "gameStarted": None, "minsPlayed": None}),
            game("2026-09-06T18:00:00Z", 0.0, None),
        ]
    )
    rows = sync.history(client, ["a-player"], datetime(2026, 9, 29, tzinfo=UTC))["a-player"]  # type: ignore[arg-type]

    assert [(r["played"], r["started"], r["mins"]) for r in rows] == [
        (True, True, 90),
        (True, False, 22),
        (False, False, None),
        (None, None, None),
    ]
    assert "gameStarted" in client.queries[0] and "minsPlayed" in client.queries[0]


def test_history_keeps_the_games_position_side_and_decisive_level_for_stat_sheets():
    row = game(
        "2026-09-26T18:00:00Z",
        70,
        {"playedInGame": True, "gameStarted": True, "anyTeam": {"slug": "away", "name": "Away"}},
    )
    row.update(
        positionTyped="Goalkeeper",
        decisiveScore={"totalScore": 60},
        detailedScore=[{"stat": "saves", "statValue": 5, "totalScore": 10}],
    )
    row["anyGame"].update(homeTeam={"name": "Home"}, awayTeam={"name": "Away"})
    client = FakeClient([row])
    client.api_key = "fixture"
    saved = sync.history(client, ["a"], datetime(2026, 9, 29, tzinfo=UTC))["a"][0]
    assert {"stat": "_context", "pos": "GK", "team": "away", "venue": "A", "level": 60} in saved["stats"]
    assert (
        "positionTyped" in client.queries[0] and "anyTeam" in client.queries[0] and "decisiveScore" in client.queries[0]
    )


def test_cards_are_asked_only_with_an_api_key_and_a_red_card_is_kept() -> None:
    sent_off = {**game("2026-09-20T18:00:00Z", 12.0, {"playedInGame": True, "gameStarted": 1, "minsPlayed": 60})}
    sent_off["detailedScore"] = [{"stat": "yellow_card", "statValue": 0.0}, {"stat": "red_card", "statValue": 1.0}]
    keyless = FakeClient([game("2026-09-20T18:00:00Z", 12.0, None)])
    keyed = FakeClient([sent_off])
    keyed.api_key = "key"  # type: ignore[attr-defined]

    plain = sync.history(keyless, ["a"], datetime(2026, 9, 29, tzinfo=UTC))["a"]  # type: ignore[arg-type]
    carded = sync.history(keyed, ["a"], datetime(2026, 9, 29, tzinfo=UTC))["a"]  # type: ignore[arg-type]

    assert "detailedScore" not in keyless.queries[0], "over the keyless complexity limit of 500"
    assert "detailedScore" in keyed.queries[0]
    assert "red" not in plain[0], "not asked is not 'no red card'"
    assert carded[0]["red"] is True


def test_history_pages_and_keeps_teams_yellows_and_nonzero_stats() -> None:
    first = game("2026-08-15T18:00:00Z", 60.0, {"playedInGame": True, "gameStarted": True, "minsPlayed": 90})
    first["anyGame"].update(homeTeam={"name": "Home"}, awayTeam={"name": "Away"})
    first["detailedScore"] = [
        {"stat": "yellow_card", "statValue": 1, "totalScore": -3},
        {"stat": "red_card", "statValue": 0, "totalScore": 0},
        {"stat": "accurate_pass", "statValue": 40, "totalScore": 4},
    ]

    class Pages:
        api_key = "fixture-key"

        def __init__(self):
            self.asked = []

        def query(self, query, variables):
            self.asked.append(variables.copy())
            assert "pageInfo" in query and "after:" in query and "totalScore" in query and "homeTeam" in query
            if variables["after"] is None:
                return {
                    "anyPlayer": {
                        "allPlayerGameScores": {
                            "nodes": [first],
                            "pageInfo": {"hasNextPage": True, "endCursor": "page-2"},
                        }
                    }
                }
            return {
                "anyPlayer": {
                    "allPlayerGameScores": {
                        "nodes": [game("2026-08-22T18:00:00Z", 55.0, None)],
                        "pageInfo": {"hasNextPage": False, "endCursor": None},
                    }
                }
            }

    client = Pages()
    rows = sync.history(client, ["a"], datetime(2026, 9, 29, tzinfo=UTC))["a"]  # type: ignore[arg-type]
    assert len(rows) == 2 and [v["after"] for v in client.asked] == [None, "page-2"]
    assert rows[0]["home"] == "Home" and rows[0]["away"] == "Away"
    assert rows[0]["yellow"] == 1 and rows[0]["red"] is False
    assert rows[0]["stats"] == [
        first["detailedScore"][0],
        first["detailedScore"][2],
        {"stat": "_context", "zeros": ["red_card"]},
    ]
    assert sync._yellows([{"stat": "red_card", "statValue": 1}]) == 0, "a second yellow is red only"


def test_failed_later_page_does_not_publish_an_incomplete_read() -> None:
    from app.sorare.client import SorareError

    class Broken:
        def query(self, query, variables):
            if variables.get("after"):
                raise SorareError("page unavailable")
            return {
                "anyPlayer": {
                    "allPlayerGameScores": {
                        "nodes": [game("2026-09-20T18:00:00Z", 55.0, None)],
                        "pageInfo": {"hasNextPage": True, "endCursor": "page-2"},
                    }
                }
            }

    assert sync.history(Broken(), ["a"], datetime(2026, 9, 29, tzinfo=UTC)) == {}  # type: ignore[arg-type]


def test_first_owner_read_starts_at_season_start_while_kept_players_use_recent_form() -> None:
    class Windows(FakeClient):
        def __init__(self):
            super().__init__([])
            self.windows = {}

        def query(self, query, variables):
            self.windows[variables["p"]] = variables["from"]
            return super().query(query, variables)

    client = Windows()
    sync.history(
        client, ["new", "kept"], datetime(2026, 10, 8, tzinfo=UTC), since={"new": datetime(2026, 8, 1, tzinfo=UTC)}
    )  # type: ignore[arg-type]
    assert client.windows == {"new": "2026-08-01T00:00:00+00:00", "kept": "2026-07-30T00:00:00+00:00"}


def test_unread_roles_and_cards_remain_unknown() -> None:
    client = FakeClient([{**game("2026-09-20T18:00:00Z", 0, None), "detailedScore": None}])
    row = sync.history(client, ["a"], datetime(2026, 9, 29, tzinfo=UTC))["a"][0]  # type: ignore[arg-type]
    assert row["played"] is None and row["started"] is None
    assert "yellow" not in row and "red" not in row and "stats" not in row


def test_history_preserves_unknown_stats_and_zero_action_names_compactly():
    source = {
        **game("2026-09-20T18:00:00Z", 50, None),
        "detailedScore": [
            {"stat": "accurate_pass", "statValue": None, "totalScore": None},
            {"stat": "saves", "statValue": 0, "totalScore": 0},
        ],
    }
    row = sync.history(FakeClient([source]), ["a"], datetime(2026, 9, 29, tzinfo=UTC))["a"][0]
    assert row["stats"][0] == source["detailedScore"][0]
    assert next(s for s in row["stats"] if s["stat"] == "_context")["zeros"] == ["saves"]
