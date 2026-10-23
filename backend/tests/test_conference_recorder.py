"""Full-squad research forecasts and authentic settlement, without production promotion."""

import json
from pathlib import Path

import pytest

from app.research.conference_recorder import forecast_players, settle_players
from app.research.league_xscore_data import when

NOW = when("2026-11-02T10:00:00Z")


def candidate():
    path = Path(__file__).parents[2] / "docs/european_validation/CONF-candidate-v2.json"
    return json.loads(path.read_text(encoding="utf-8"))


def test_full_two_squads_keep_unknown_and_zero_history_without_a_guessed_role():
    squads = {
        "home": [{"slug": "keeper", "position": "Goalkeeper"}, {"slug": "unknown", "position": "Unknown"}],
        "away": [{"slug": "forward", "position": "Forward"}, {"slug": "coach", "position": "Coach"}],
    }
    history = {
        "zero": {
            "date": "2026-10-20T18:00Z",
            "availableAt": "2026-10-22T18:00Z",
            "mainStage": True,
            "competition": "CONF",
            "settled": True,
            "starts": {"forward": 0},
        },
        "future": {
            "date": "2026-10-25T18:00Z",
            "availableAt": "2026-11-03T18:00Z",
            "mainStage": True,
            "competition": "CL",
            "settled": True,
            "starts": {"forward": 100},
        },
    }
    p = {"cs_h": 0.3, "cs_a": 0.2, "lam_h": 1.5, "lam_a": 1.2}
    rows = forecast_players(candidate(), squads, p, history, NOW)
    assert set(rows) == {"keeper", "unknown", "forward"}
    assert rows["unknown"]["prediction"] is None
    assert rows["forward"]["baseline"] == 34
    assert rows["keeper"]["baseline"] == 51
    assert rows["forward"]["team"] == "away"
    assert all(0 <= rows[s]["prediction"] <= 100 for s in ("keeper", "forward"))


def test_settlement_requires_same_player_role_and_actual_side_and_accepts_zero():
    snapshot = {
        "players": {
            f"p{i}": {
                "pos": "GK" if i in (0, 11) else "DEF",
                "team": "home" if i < 11 else "away",
                "prediction": 50,
                "baseline": 51,
                "ablation": 49,
            }
            for i in range(22)
        }
    }
    starters = [
        {"slug": slug, "pos": p["pos"], "team": p["team"], "score": 0} for slug, p in snapshot["players"].items()
    ]
    settled = settle_players(snapshot, starters, "actual", "Game:test")
    assert len(settled) == 22 and settled[0]["score"] == 0
    for field, value in (("pos", "FWD"), ("team", "away"), ("slug", "uncaptured")):
        changed = [{**p} for p in starters]
        changed[0][field] = value
        with pytest.raises(ValueError, match="captured"):
            settle_players(snapshot, changed, "actual", "Game:test")
    with pytest.raises(ValueError, match="22"):
        settle_players(snapshot, starters[:21], "actual", "Game:test")


def test_cold_automatic_run_records_all_squads_and_fresh_process_settles_zero_scores(monkeypatch, tmp_path):
    from datetime import datetime
    from email.utils import format_datetime

    import httpx
    import pandas as pd

    from app.research import conference_recorder as recorder
    from app.research.conference_recording import Archive

    clock = [NOW]

    class Clock(datetime):
        @classmethod
        def now(cls, tz=None):
            return clock[0]

    monkeypatch.setattr(recorder, "datetime", Clock)
    native, games = [], {}
    bindings = {f"club{i}": str(i) for i in range(36)}
    for i in range(18):
        sides = [{"id": str(2 * i + j), "slug": f"club{2 * i + j}", "countryCode": "ESP"} for j in range(2)]
        raw = {
            "id": str(i),
            "competitionPhase": "TOURNAMENT",
            "round": {"mode": "GROUP"},
            "homeTeam": sides[0],
            "awayTeam": sides[1],
            "kickOffTime": {"dateTime": "2026-11-05T18:00Z"},
            "stadium": {"id": "stadium", "countryCode": "ESP"},
            "status": "UPCOMING",
        }
        native.append(raw)
        game = {
            "id": f"Game:{i}",
            "date": "2026-11-05T18:00Z",
            "homeTeam": sides[0],
            "awayTeam": sides[1],
            "competition": {"slug": "uefa-europa-conference-league"},
            "so5Fixture": {"slug": "actual", "cutOffDate": "2026-11-03T14:00Z"},
        }
        games[game["id"]] = game

    prior_native = {**native[0], "id": "old", "status": "FINISHED", "kickOffTime": {"dateTime": "2026-10-20T18:00Z"}}
    native.append(prior_native)
    games["Game:old"] = {
        **games["Game:0"],
        "id": "Game:old",
        "date": "2026-10-20T18:00Z",
        "so5Fixture": {"slug": "old-week", "cutOffDate": "2026-10-19T14:00Z"},
    }

    objects = {}

    def storage(method, key, body=b""):
        if method == "PUT":
            objects[key] = body
            return httpx.Response(200, headers={"Date": format_datetime(clock[0], usegmt=True)})
        return httpx.Response(200, content=objects[key]) if key in objects else httpx.Response(404)

    class Client:
        def query(self, query, variables):
            if query == recorder.FUTURE_QUERY:
                return {
                    "football": {
                        "competition": {
                            "slug": "uefa-europa-conference-league",
                            "futureGames": {
                                "nodes": [g for g in games.values() if when(g["date"]) > clock[0]],
                                "pageInfo": {"hasNextPage": False},
                            },
                        }
                    }
                }
            if query == recorder.SQUAD_QUERY:
                slug = variables["slug"]
                players = [
                    {
                        "slug": f"{slug}-p{i}",
                        "position": "Goalkeeper" if i == 0 else "Defender",
                        "activeClub": {"slug": slug},
                    }
                    for i in range(11)
                ]
                return {
                    "football": {
                        "club": {"slug": slug, "activePlayers": {"nodes": players, "pageInfo": {"hasNextPage": False}}}
                    }
                }
            if query == recorder.METADATA_QUERY:
                return {"nodes": [games[ident] for ident in variables["ids"]]}
            if query == recorder.foreign_history.QUERY:
                game = games[variables["id"]]
                return {
                    "anyGame": {
                        "id": game["id"],
                        "statusTyped": "played",
                        "homeGoals": 0,
                        "awayGoals": 0,
                        "starters": [
                            {
                                "slug": f"{game[side]['slug']}-p{i}",
                                "pos": "GK" if i == 0 else "DEF",
                                "team": game[side]["slug"],
                                "score": 0,
                            }
                            for side in ("homeTeam", "awayTeam")
                            for i in range(11)
                        ],
                    }
                }
            raise AssertionError("Unexpected source query")

    monkeypatch.setattr(recorder.european_sources, "calendars", lambda now: {"CONF": {2026: native}})
    original_read = recorder.read
    monkeypatch.setattr(
        recorder,
        "read",
        lambda path: {"bindings": bindings} if path == recorder.european_sources.REGISTRY else original_read(path),
    )
    monkeypatch.setattr(recorder, "align", lambda *args: {"bindings": bindings})
    monkeypatch.setattr(recorder.european_history, "recent_index", lambda *args: [games["Game:old"]])
    history = pd.DataFrame(
        [
            {
                "competition": "CONF",
                "date": "2026-10-12T18:00Z",
                "availableAt": "2026-10-14T18:00Z",
                "home": "0",
                "away": "1",
                "hg": 1,
                "ag": 0,
            }
        ]
    )
    monkeypatch.setattr(recorder.european_sources, "history", lambda *args: history)
    monkeypatch.setattr(
        recorder.european_history, "collect", lambda *args, **kwargs: ({}, {"complete": True, "games": {}})
    )

    class Model:
        def predict(self, *args, **kwargs):
            return pd.DataFrame(
                [
                    {
                        "p_h": 0.5,
                        "p_d": 0.3,
                        "p_a": 0.2,
                        "lam_h": 1.5,
                        "lam_a": 1.0,
                        "cs_h": 0.35,
                        "cs_a": 0.2,
                        "p_00": 0.1,
                    }
                ]
            )

    monkeypatch.setattr(recorder, "fit", lambda *args, **kwargs: Model())
    archive = Archive(candidate()["candidateSha256"], request=storage)
    state = recorder.run(Client(), archive, tmp_path)
    assert not state["errors"]
    assert state["squadProof"]["clubs"] == 36 and state["squadProof"]["players"] == 396
    assert state["status"]["capturedGames"] == 18
    assert state["excluded"]["old"]["lock"] == "2026-10-19T14:00:00+00:00"
    assert state["bindings"] == bindings
    original_captures = {key: list(refs) for key, refs in state["captures"].items()}
    clock[0] = when("2026-11-07T18:00Z")
    for game in native:
        game.update(status="FINISHED", score={"total": {"home": 0, "away": 0}})
    monkeypatch.setattr(recorder, "game_snapshot", lambda code, game, raw: {"raw": raw})
    monkeypatch.setattr(recorder.european_history, "pending_scores", lambda saved: False)
    monkeypatch.setattr(recorder, "admitted_starters", lambda saved: saved["raw"]["starters"])
    monkeypatch.setattr(
        recorder,
        "football_row",
        lambda code, season, raw: {
            "id": raw["id"],
            "hg": 0,
            "ag": 0,
            "phase": "league",
            "neutral": False,
            "extraTime": False,
        },
    )
    fresh = Archive(candidate()["candidateSha256"], request=storage)
    settled = recorder.run(Client(), fresh, tmp_path)
    assert not settled["errors"]
    assert settled["status"]["settledGames"] == 18
    assert settled["captures"] == original_captures
    assert all(p["score"] == 0 for game in settled["settled"].values() for p in game["players"])
    # Missing saved evidence can never be repaired with a newly computed post-match forecast.
    del settled["captures"]["0"]
    del settled["settled"]["0"]
    fresh.write_state(settled)
    blocked = recorder.run(Client(), fresh, tmp_path)
    assert blocked["status"]["settledGames"] == 17
    assert any("backfill forbidden" in error["reason"] for error in blocked["errors"])


def test_future_and_squad_connections_require_complete_advancing_pagination():
    from app.research.conference_recorder import future_games, squad

    class Client:
        def query(self, query, variables):
            if "futureGames" in query:
                page = {"nodes": [], "pageInfo": {"hasNextPage": True, "endCursor": "same"}}
                return {"football": {"competition": {"slug": "uefa-europa-conference-league", "futureGames": page}}}
            page = {"nodes": [], "pageInfo": {"hasNextPage": True, "endCursor": "same"}}
            return {"football": {"club": {"slug": "home", "activePlayers": page}}}

    with pytest.raises(ValueError, match="cursor"):
        future_games(Client())
    with pytest.raises(ValueError, match="cursor"):
        squad(Client(), "home")


def test_current_squad_matches_active_club_and_retains_noncurrent_source_receipts():
    from app.research.conference_recorder import squad

    current = [
        {"slug": f"p{i}", "position": "Unknown" if i == 0 else "Defender", "activeClub": {"slug": "home"}}
        for i in range(11)
    ]
    raw = [
        *current,
        {"slug": "loan", "position": "Forward", "activeClub": {"slug": "away"}},
        {"slug": "no-current-club", "position": "Forward", "activeClub": None},
    ]

    class Client:
        def query(self, query, variables):
            return {
                "football": {
                    "club": {"slug": "home", "activePlayers": {"nodes": raw, "pageInfo": {"hasNextPage": False}}}
                }
            }

    evidence = {}
    assert squad(Client(), "home", evidence=evidence) == current
    assert evidence["home"]["rawPlayers"] == raw
    assert len(evidence["home"]["nonCurrent"]) == 2


def test_cli_storage_failure_writes_a_receipt_without_starting_a_source_read(monkeypatch, tmp_path):
    from app.research import conference_recorder as recorder

    monkeypatch.setattr("sys.argv", ["recorder", "--out", str(tmp_path)])
    monkeypatch.setattr(recorder.r2, "configured", lambda: False)
    assert recorder.main() == 1
    receipt = json.loads((tmp_path / "receipt.json").read_text(encoding="utf-8"))
    assert receipt["modelEligible"] is False
    assert "Durable research storage" in receipt["errors"][0]["reason"]
