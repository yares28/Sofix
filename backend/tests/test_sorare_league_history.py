"""Every LaLiga player's past games, read a batch a run and kept between runs."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

from app.sorare import sync
from app.sorare.client import SorareError

NOW = datetime(2026, 10, 7, 10, tzinfo=UTC)


def row(slug: str, plays: bool = True) -> dict:
    return {"slug": slug, "player": {"slug": slug, "plan": [{"id": "g"}] if plays else []}}


def test_never_read_players_with_a_game_go_first_then_the_stalest_and_fresh_ones_wait() -> None:
    market = [row("benched", plays=False), row("stale"), row("fresh"), row("new"), row("yours")]
    cached = {
        "stale": {"at": (NOW - timedelta(days=9)).isoformat(), "games": []},
        "fresh": {"at": (NOW - timedelta(hours=5)).isoformat(), "games": []},
    }
    assert sync.league_batch(market, cached, {"yours"}, NOW) == ["new", "benched", "stale"]
    assert sync.league_batch(market, cached, {"yours"}, NOW, size=1) == ["new"]


class _Client:
    def __init__(self, broken: set[str]) -> None:
        self.broken, self.asked = broken, []

    def query(self, query: str, variables: dict) -> dict:
        self.asked.append(variables["p"])
        if variables["p"] in self.broken:
            raise SorareError("no answer")
        node = {
            "score": 61.0,
            "scoreStatus": "FINAL",
            "anyGame": {"id": "g1", "date": "2026-09-27T14:00:00Z", "competition": {"slug": "laliga-es"}},
            "anyPlayerGameStats": {"playedInGame": True, "gameStarted": True, "minsPlayed": 90},
        }
        return {"anyPlayer": {"allPlayerGameScores": {"nodes": [node]}}}


def test_a_run_adds_its_batch_keeps_what_it_had_and_drops_who_left_laliga() -> None:
    old = (NOW - timedelta(days=9)).isoformat()
    cached = {
        "kept": {"at": old, "games": ["x"]},
        "gone": {"at": old, "games": []},
        "silent": {"at": old, "games": ["y"]},
    }
    client = _Client(broken={"silent"})
    out = sync.league_history(client, [row("new"), row("kept"), row("silent")], cached, set(), NOW, NOW, size=2)  # type: ignore[arg-type]
    assert client.asked == ["new", "kept"]  # a batch, never-read first
    assert out["new"]["at"] == NOW.isoformat() and out["new"]["games"][0]["started"] is True
    assert out["kept"]["games"][0]["score"] == 61.0  # read again: it was stale
    assert out["silent"] == cached["silent"]  # not in this batch: kept as it was
    assert "gone" not in out
