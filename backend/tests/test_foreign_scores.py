from copy import deepcopy
from datetime import UTC, datetime
from types import SimpleNamespace

from app.sorare import foreign_scores as f
from app.sorare.scores import Made

LOCK = datetime(2026, 10, 23, 14, tzinfo=UTC)


def fixture():
    cell = {
        "opponent_code": "B",
        "venue": "H",
        "kickoff_utc": "2026-10-24T14:00:00Z",
        "forecast_at": "2026-10-21T12:00:00Z",
        "status": "scheduled",
        "prediction": {"clean_sheet": 0.4, "xg_for": 1.5, "xg_against": 0.9},
    }
    grid = {
        "competition": "PL",
        "model_version": f.expected_version("PL"),
        "teams": [
            {"code": "A", "history_name": "Arsenal", "cells": [[cell]]},
            {"code": "B", "history_name": "Chelsea", "cells": []},
        ],
    }
    game = {
        "competition": "premier-league-gb-eng",
        "teamName": "Arsenal FC",
        "opponentName": "Chelsea FC",
        "venue": "H",
        "kickoff": "2026-10-24T14:00:00Z",
        "forecastBefore": LOCK.isoformat(),
    }
    return grid, game


def test_fixture_join_requires_both_playing_sides_venue_timestamp_and_matching_model():
    grid, game = fixture()
    assert f.find_numbers("PL", grid, game).xgf == 1.5
    for key, value in [
        ("opponentName", "Fulham FC"),
        ("teamName", "England"),
        ("venue", "A"),
        ("competition", "world-cup"),
        ("kickoff", "2026-10-30T14:00:00Z"),
    ]:
        assert f.find_numbers("PL", grid, {**game, key: value}) is None
    for stamp in [None, "2026-10-23T15:00:00Z"]:
        changed = deepcopy(grid)
        changed["teams"][0]["cells"][0][0]["forecast_at"] = stamp
        assert f.find_numbers("PL", changed, game) is None
    grid["model_version"] = "LaLiga"
    assert f.find_numbers("PL", grid, game) is None


def test_foreign_history_is_league_only_before_cutoff_and_never_uses_laliga_sub_shape():
    grid, game = fixture()
    seen = []

    def outcome(numbers, home, own_dec, own_score, projection):
        seen.append((home, own_score, projection))
        return SimpleNamespace(start=own_score)

    bundle = SimpleNamespace(outfield={"DEF": SimpleNamespace(outcome=outcome)}, keeper=None, subs={})
    fallback = lambda *args: Made((), "Spanish shape")
    score = f.scores_for({"PL": bundle}, {"PL": grid}, fallback)
    past = [
        {
            "date": "2026-10-20T12:00:00Z",
            "competition": "premier-league-gb-eng",
            "status": "FINAL",
            "played": True,
            "started": True,
            "score": 0,
        },
        {
            "date": "2026-10-19T12:00:00Z",
            "competition": "laliga-es",
            "status": "FINAL",
            "played": True,
            "started": True,
            "score": 100,
        },
    ]
    made = score({"position": "Defender"}, [game], 99, past)
    assert made.sub is None and len(made.outcomes) == 1
    assert seen == [(True, 40.0, None)]
    assert score({"position": "Defender"}, [{**game, "opponentName": "Unknown"}], 99, past).sub is None
    assert score({"position": "Defender"}, [{**game, "competition": "laliga-es"}], 99, past).sub == "Spanish shape"


def test_artifact_requires_complete_evidence_not_just_validated_boolean(tmp_path):
    import json

    raw = json.loads((f.ROOT / "BL1.json").read_text())
    path = tmp_path / "BL1.json"
    path.write_text(json.dumps(raw))
    assert f.load("BL1", tmp_path) is not None
    for change in [
        lambda r: r["evidence"].update(coverageComplete=False),
        lambda r: r["evidence"]["versusForm"].update(hi=0),
        lambda r: r.update(protocol={}),
        lambda r: r["evidence"].update(competition="PL"),
    ]:
        changed = deepcopy(raw)
        change(changed)
        path.write_text(json.dumps(changed))
        assert f.load("BL1", tmp_path) is None
