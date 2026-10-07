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
        (False, False, None),
    ]
    assert "gameStarted" in client.queries[0] and "minsPlayed" in client.queries[0]


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
