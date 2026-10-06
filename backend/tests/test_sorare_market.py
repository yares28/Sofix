"""The LaLiga index reads each club on its own, lists every player, and turns Sorare's cents into euros."""

from __future__ import annotations

from app.sorare.client import SorareError
from app.sorare.sync import laliga_index


class _Client:
    def __init__(self, answers: dict[str, dict]) -> None:
        self.answers = answers
        self.calls: list[tuple[str, dict]] = []

    def query(self, query: str, variables: dict | None = None) -> dict:
        self.calls.append((query, variables or {}))
        key = "clubs" if "competition(slug" in query else variables["s"]
        answer = self.answers.get(key)
        if isinstance(answer, Exception):
            raise answer
        return answer


def test_prices_are_euros_and_a_club_that_fails_is_skipped() -> None:
    client = _Client(
        {
            "clubs": {
                "football": {"competition": {"clubs": {"nodes": [{"slug": "barcelona-barcelona"}, {"slug": "broken"}]}}}
            },
            "barcelona-barcelona": {
                "football": {
                    "club": {
                        "activePlayers": {
                            "pageInfo": {"hasNextPage": False, "endCursor": None},
                            "nodes": [
                                {
                                    "slug": "pedri",
                                    "displayName": "Pedri",
                                    "position": "Midfielder",
                                    "pictureUrl": "p",
                                    "avatarPictureUrl": "",
                                    "activeClub": {"shortName": "Barça", "name": "Barcelona", "pictureUrl": "c"},
                                    "average": 61.2,
                                    "nextClassicFixtureProjectedScore": 70,
                                    "commonPlayer": {"marketValue": {"eurCents": 4397}},
                                },
                                {
                                    "slug": "unpriced",
                                    "displayName": "Unpriced",
                                    "position": "Forward",
                                    "commonPlayer": {"marketValue": {"eurCents": None}},
                                },
                            ],
                        }
                    }
                }
            },
            "broken": SorareError("club unreadable"),
        }
    )
    rows = laliga_index(client)
    assert rows == [
        {
            "slug": "pedri",
            "name": "Pedri",
            "pos": "MID",
            "club": "Barça",
            "crest": "c",
            "average": 61.2,
            "projection": 70,
            "eur": 43.97,
            "pic": "p",
        },
        # every LaLiga player is listed, priced or not: the Players page gives each a start chance and an xScore
        {
            "slug": "unpriced",
            "name": "Unpriced",
            "pos": "FWD",
            "club": None,
            "crest": None,
            "average": 0.0,
            "projection": None,
            "eur": None,
            "pic": "",
        },
    ]
    assert any(variables.get("s") == "broken" for _, variables in client.calls)
    assert all("anyGamesForFixture" not in query for query, _ in client.calls)

    # With the gameweek being planned, each row keeps Sorare's player (odds and games) for the forecast
    rows = laliga_index(client, fixture="football-9-oct-2026")
    assert rows[0]["player"]["slug"] == "pedri"
    squad = [(q, v) for q, v in client.calls if v.get("s") == "barcelona-barcelona"][-1]
    assert "plan: anyGamesForFixture" in squad[0] and squad[1]["plan"] == "football-9-oct-2026"


def test_a_broken_club_list_leaves_the_index_empty() -> None:
    client = _Client({"clubs": SorareError("schema")})
    assert laliga_index(client) == []
