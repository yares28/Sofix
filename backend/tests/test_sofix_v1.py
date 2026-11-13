from datetime import datetime

import numpy as np
import pytest

from app.sorare import keeper, publish, scores, sofix_v1, versus
from app.sorare.forecast import GameStart, PlayerWeek, forecast


def test_seven_point_pick_and_expected_score_answer_different_questions():
    hist = np.zeros((2, 101))
    hist[0, 40], hist[1, 80] = 0.6, 0.4
    result = sofix_v1.from_distribution(hist, 0.3)
    assert result.point == 40
    assert result.outcome.start == pytest.approx(56)
    assert result.outcome.p_decisive == pytest.approx(0.4)


def test_history_is_settled_strictly_before_lock():
    lock = datetime.fromisoformat("2026-10-09T14:00:00+00:00")
    old = {"date": "2026-10-07T13:59:59Z", "competition": keeper.LALIGA, "started": True, "played": True, "score": 0}
    assert sofix_v1.eligible(
        [old, {**old, "date": "2026-10-07T14:00:00Z"}, {**old, "competition": "uefa-champions-league"}], lock
    ) == [old]


def test_la_liga_model_publishes_both_roles_with_no_player_history():
    model = sofix_v1.Model({"start": [[[[45], [1]]]], "bench": [[[[35], [1]]]]})
    callback = scores.scores_for(None, {}, lambda *_: keeper.GameNumbers(0.2, 1.5, 1), v1=model)
    player = {"position": "Defender", "activeClub": {"name": "Celta"}}
    game = {"kickoff": "2026-10-10T20:00:00Z", "forecastBefore": "2026-10-09T14:00:00Z", "competition": keeper.LALIGA}
    result = callback(player, [game], 82, [])
    (outcome,) = result.outcomes
    assert isinstance(outcome, sofix_v1.GameScore)
    assert outcome.point == 45
    assert outcome.sub.point == 35
    assert callback(player, [{**game, "competition": "uefa-champions-league"}], 82, []).outcomes == ()


def test_live_version_uses_actual_role_and_does_not_require_sorare_projection():
    def game(started, score, **extra):
        return {
            "modelVersion": sofix_v1.VERSION,
            "sofixPoint": 45,
            "sofixOnPoint": 35,
            "previousSofix": 55,
            "previousSofixOn": 42,
            "actual": {"played": True, "started": started, "score": score},
            **extra,
        }

    record = {
        "gameweek": {"lock": "2026-10-09T14:00:00Z"},
        "writtenAt": "2026-10-09T13:00:00Z",
        "settledAt": "2026-10-13T13:00:00Z",
        "players": {"p": {"games": [game(True, 45), game(False, 32), game(True, 55, modelVersion=None)]}},
    }
    late = {**record, "writtenAt": "2026-10-09T14:00:00Z"}
    assert versus.model_versions([record, late])[sofix_v1.VERSION] == {
        "start": {"cases": 1, "hits": 1, "paired": 1, "gained": 1, "spoiled": 0},
        "bench": {"cases": 1, "hits": 1, "paired": 1, "gained": 1, "spoiled": 0},
    }


def test_expected_points_and_frozen_predictions_are_published_together():
    model = sofix_v1.Model({"start": [[[[40, 181], [6, 4]]]], "bench": [[[[35], [1]]]]})
    outcome = model.game("DEF", True, keeper.GameNumbers(0.3, 1, 1), [], None)
    game = {"id": "a", "kickoff": "2026-10-10T20:00:00Z", "competition": keeper.LALIGA}
    week = PlayerWeek(
        games=1,
        pos="DEF",
        game_ids=["a"],
        game_starts=[GameStart("a", 1)],
        game_scores=(outcome.start,),
        game_models=(outcome,),
        shape=outcome,
        game_dec=(outcome.p_decisive,),
    )
    made = forecast(week)
    assert made.game_x == (56,)
    assert publish._game_numbers([game], made)["a"] == {
        "x": 56,
        "start": 56,
        "modelVersion": sofix_v1.VERSION,
        "startPoint": 40,
        "subPoint": 35,
    }
    record = publish.score_record(
        {"slug": "week", "number": 1, "lock": "2026-10-09T14:00:00Z"},
        {"p": week},
        {"p": made},
        {"p": [game]},
        {"fetchedAt": "2026-10-09T13:00:00Z"},
    )
    (saved,) = record["players"]["p"]["games"]
    assert (saved["sofixPoint"], saved["sofix"], saved["sofixOnPoint"], saved["modelVersion"]) == (
        40,
        56,
        35,
        sofix_v1.VERSION,
    )


def test_competition_artifact_loads_as_sofix_v1_and_refuses_another_version_or_code(tmp_path, monkeypatch):
    import gzip
    import json

    monkeypatch.setattr(sofix_v1, "COMPETITION_ARTIFACTS", tmp_path)
    sofix_v1.load_competition.cache_clear()
    data = {
        "code": "EL",
        "competition": "uefa-europa-league",
        "version": "Sofix v1",
        "trainedThrough": "2026-11-10T00:00:00+00:00",
        "trees": {"start": [[[[45], [1]]]], "bench": [[[[35], [1]]]]},
    }
    (tmp_path / "EL.json.gz").write_bytes(gzip.compress(json.dumps(data).encode()))
    (tmp_path / "CL.json.gz").write_bytes(gzip.compress(json.dumps({**data, "version": "Sofix v2"}).encode()))
    model = sofix_v1.load_competition("EL")
    assert (model.version, model.competition) == ("Sofix v1", "uefa-europa-league")
    assert sofix_v1.load_competition("PL") is None
    with pytest.raises(ValueError):
        sofix_v1.load_competition("CL")
    sofix_v1.load_competition.cache_clear()


def test_live_counts_keep_each_competition_apart_under_one_name():
    def game(competition, score):
        return {
            "modelVersion": sofix_v1.VERSION,
            "competition": competition,
            "sofixPoint": 45,
            "sofixOnPoint": 35,
            "actual": {"played": True, "started": True, "score": score},
        }

    record = {
        "gameweek": {"lock": "2026-11-20T14:00:00Z"},
        "writtenAt": "2026-11-20T13:00:00Z",
        "settledAt": "2026-11-24T13:00:00Z",
        "players": {
            "a": {"games": [game(keeper.LALIGA, 45), game("premier-league-gb-eng", 70)]},
            "b": {"games": [game("uefa-champions-league", 50)]},
        },
    }
    counts = versus.model_versions([record])
    assert {k: (v["start"]["cases"], v["start"]["hits"]) for k, v in counts.items()} == {
        "Sofix v1": (1, 1),
        "Sofix v1 PL": (1, 0),
        "Sofix v1 CL": (1, 1),
    }
