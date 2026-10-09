"""Every LaLiga player's past games, read all at once by the daily job and kept between runs (owner's ask of 6 Oct 2026)."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import Any

import pytest

from app.jobs import league_history as job
from app.jobs import sorare as sorare_job
from app.models import PlayerGame, ReadModel
from app.services.publish import put
from app.sorare import sync
from app.sorare.client import SorareError
from tests.test_pipeline import db  # noqa: F401  (fixture)
from tests.test_sorare_publish import _FakeClient, snapshot

NOW = datetime(2026, 10, 8, 3, 30, tzinfo=UTC)
OLD = (NOW - timedelta(days=1)).isoformat()


class _Client:
    def __init__(self, broken: set[str] = frozenset(), stop_at: str | None = None) -> None:  # type: ignore[assignment]
        self.broken, self.stop_at, self.asked = broken, stop_at, []

    def query(self, query: str, variables: dict[str, Any]) -> dict[str, Any]:
        if variables["p"] == self.stop_at:
            raise RuntimeError("the run is cut off")
        self.asked.append(variables["p"])
        if variables["p"] in self.broken:
            raise SorareError("no answer")
        node = {
            "score": 61.0,
            "scoreStatus": "FINAL",
            "anyGame": {"id": "g1", "date": "2026-10-05T14:00:00Z", "competition": {"slug": "laliga-es"}},
            "anyPlayerGameStats": {"playedInGame": True, "gameStarted": True, "minsPlayed": 90},
        }
        return {"anyPlayer": {"allPlayerGameScores": {"nodes": [node]}}}


def test_everyone_is_read_stalest_first_and_who_left_laliga_drops_out() -> None:
    cached = {
        "kept": {"at": OLD, "games": ["x"]},
        "older": {"at": (NOW - timedelta(days=3)).isoformat(), "games": []},
        "gone": {"at": OLD, "games": []},
        "silent": {"at": OLD, "games": ["y"]},
    }
    client = _Client(broken={"silent"})
    out = sync.league_history(client, ["kept", "new", "older", "silent"], cached, NOW, lambda _: None)  # type: ignore[arg-type]

    assert client.asked == ["new", "older", "kept", "silent"], "never read, then the stalest"
    assert out["new"]["at"] == NOW.isoformat() and out["new"]["games"][0]["started"] is True
    assert out["kept"]["games"][0]["score"] == 61.0
    assert out["silent"] == cached["silent"], "Sorare did not answer: his last reading stays"
    assert "gone" not in out


def test_a_run_cut_off_midway_has_saved_what_it_read() -> None:
    saved: list[dict[str, Any]] = []
    with pytest.raises(RuntimeError):
        sync.league_history(
            _Client(stop_at="c"), ["a", "b", "c", "d"], {}, NOW, lambda out: saved.append(dict(out)), every=2
        )  # type: ignore[arg-type]

    assert len(saved) == 1 and set(saved[0]) == {"a", "b"}, "the first 2 were saved before the run stopped"


def test_the_job_reads_the_refreshs_laliga_list_and_writes_its_status(db) -> None:  # noqa: F811
    put(
        db,
        sorare_job.SORARE_KEY,
        {
            "market": [{"slug": "a"}, {"slug": "b"}, {"name": "no slug"}],
            "collection": [{"player": "a"}, {"player": "outside-laliga"}],
            "timeline": [{"start": "2026-08-01T14:00:00Z"}],
        },
        NOW,
    )

    status = job.run(db, _Client(broken={"b"}), NOW)  # type: ignore[arg-type]

    assert status == {"players": 3, "read": 2, "at": NOW.isoformat()}
    assert {row.player for row in db.query(PlayerGame)} == {"a", "outside-laliga"}
    assert db.get(ReadModel, sorare_job.LEAGUE_HISTORY_KEY) is None, "the rolling JSON is no longer written"
    assert db.get(ReadModel, sorare_job.LEAGUE_STATUS_KEY).payload == status
    health = db.get(ReadModel, "data_health").payload
    assert next(row for row in health["datasets"] if row["id"] == "games")["warnings"]


def test_a_refresh_reads_the_league_history_and_never_writes_it(db, monkeypatch) -> None:  # noqa: F811
    daily = {"someone": {"at": OLD, "games": []}}
    put(db, sorare_job.LEAGUE_HISTORY_KEY, daily, NOW)
    stale = snapshot()
    stale["leagueHistory"] = {"someone-else": {"at": "2026-10-01T00:00:00+00:00", "games": []}}
    monkeypatch.delenv("GITHUB_ACTIONS", raising=False)
    monkeypatch.setattr(sorare_job.settings, "sorare_api_key", "test-key")
    monkeypatch.setattr(sorare_job, "SorareClient", lambda *a, **k: _FakeClient())
    monkeypatch.setattr(sorare_job.sorare_sync, "snapshot", lambda *a, **k: stale)
    monkeypatch.setattr(sorare_job.understat, "fetch_leagues", lambda *a, **k: {})

    sorare_job.run(db, "yares", runs=1)

    assert db.get(ReadModel, sorare_job.LEAGUE_HISTORY_KEY).payload == daily, (
        "a refresh never writes back an older copy"
    )
    assert db.get(PlayerGame, ("keeper-one", "past")).score == 60.0, "the owner's fresh read is kept too"
    statement = db.get(PlayerGame, ("keeper-one", "game-keeper-one"))
    assert statement.sorare_x == 55.0 and statement.sorare_start == 0.9, "refresh saves the pre-lock statements too"


def test_incremental_history_rechecks_corrections_without_losing_older_games() -> None:
    class Dates(_Client):
        def __init__(self):
            super().__init__()
            self.windows = []

        def query(self, query, variables):
            self.windows.append(variables.copy())
            return super().query(query, variables)

    client = Dates()
    start = datetime(2026, 8, 1, tzinfo=UTC)
    cached = {
        "a": {
            "at": OLD,
            "games": [
                {"gameId": "old", "date": "2026-08-01T14:00:00Z", "status": "FINAL"},
                {"gameId": "g1", "date": "2026-10-05T14:00:00Z", "status": "PENDING"},
                {"gameId": "future", "date": "2026-10-14T14:00:00Z", "status": "PENDING"},
            ],
        }
    }
    saved = []
    out = sync.league_history(client, ["a", "new"], cached, NOW, saved.append, since=start)  # type: ignore[arg-type]
    asked = {v["p"]: v for v in client.windows}
    assert asked["new"]["from"] == start.isoformat()
    assert asked["a"]["from"] == "2026-10-02T14:00:00+00:00", "future rows cannot move the cursor past results"
    assert asked["a"]["to"] == (NOW + timedelta(days=8)).isoformat()
    assert {game["gameId"] for game in out["a"]["games"]} == {"old", "g1", "future"}
    assert next(game for game in out["a"]["games"] if game["gameId"] == "g1")["status"] == "FINAL"
    assert {game["gameId"] for game in saved[0]["a"]["games"]} == {"g1"}, "save only the fresh batch"
