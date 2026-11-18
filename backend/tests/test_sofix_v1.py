from dataclasses import replace
from datetime import datetime
from types import SimpleNamespace

import numpy as np
import pytest

from app.sorare import keeper, planner, publish, scores, sofix_v1, versus
from app.sorare.forecast import GameStart, PlayerWeek, forecast
from app.sorare.score_fixes import ScoreFix


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
        "subPrev": 42.0,
        "pDec": 0.4,
        "decIf": 80.0,
        "subPDec": 0.0,
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


def test_each_game_carries_every_xs_version_and_the_decisive_scenario():
    """The version switch (plans/xscore-versions.md step 1): v1 (`x`, `start`), v2 (`startPoint`), v0 (`startPrev`) and the
    decisive scenario ("40% chance of 80": `pDec`, `decIf`) ride with each game; a chance of none has no score to name."""
    model = sofix_v1.Model({"start": [[[[40, 181], [6, 4]]]], "bench": [[[[35], [1]]]]})
    numbers = keeper.GameNumbers(0.3, 1, 1)
    old = model.game("DEF", True, numbers, [], None)
    outcome = model.game("DEF", True, numbers, [], old)
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
    published = publish._game_numbers([game], forecast(week))["a"]
    assert (published["startPoint"], published["start"], published["startPrev"]) == (40, 56, 56)
    assert (published["pDec"], published["decIf"]) == (0.4, 80)
    assert published["subPDec"] == 0 and "subDecIf" not in published
    # Sofix v3 (owner, 17 Nov 2026): v0's normal score, and its decisive scenario apart while the chance is under 75%
    assert (published["startV3"], published["pDecPrev"], published["decPrevIf"]) == (40, 0.4, 80)


def test_sofix_v3_takes_v0s_decisive_score_from_a_75_percent_chance_and_then_names_no_scenario():
    model = sofix_v1.Model({"start": [[[[40, 181], [1, 4]]]], "bench": [[[[35], [1]]]]})
    numbers = keeper.GameNumbers(0.3, 1, 1)
    outcome = model.game("DEF", True, numbers, [], model.game("DEF", True, numbers, [], None))
    published = publish._versions(outcome, None)
    assert published["startV3"] == 80 and not {"pDecPrev", "decPrevIf"} & published.keys()


def test_a_game_without_sofix_v1_publishes_no_other_version():
    """No made-up numbers: a game Sofix v1 did not work out names no v0, v2 or decisive scenario (never v1 copied in)."""
    game = {"id": "a", "kickoff": "2026-10-10T20:00:00Z", "competition": keeper.LALIGA}
    week = PlayerWeek(games=1, pos="DEF", game_ids=["a"], game_starts=[GameStart("a", 1)], game_scores=(50.0,))
    published = publish._game_numbers([game], forecast(week)).get("a", {})
    assert not {"startPoint", "startPrev", "pDec", "decIf"} & published.keys()


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


def test_the_pre_lock_record_keeps_v0s_normal_and_decisive_scores_for_sofix_v3():
    """Sofix v3 (research plan Phase V3) is judged live from v0's two scores and its decisive chance, saved before the lock
    next to `previousSofix`; nothing on screen reads them."""
    model = sofix_v1.Model({"start": [[[[40, 181], [6, 4]]]], "bench": [[[[35], [1]]]]})
    numbers = keeper.GameNumbers(0.3, 1, 1)
    old = model.game("DEF", True, numbers, [], None)
    outcome = model.game("DEF", True, numbers, [], old)
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
    record = publish.score_record(
        {"slug": "week", "number": 1, "lock": "2026-10-09T14:00:00Z"},
        {"p": week},
        {"p": forecast(week)},
        {"p": [game]},
        {"fetchedAt": "2026-10-09T13:00:00Z"},
    )
    (saved,) = record["players"]["p"]["games"]
    assert (saved["previousSofix"], saved["startPlainPrev"], saved["startDecPrev"], saved["pDecPrev"]) == (
        56,
        40,
        80,
        0.4,
    )
    first = model.game("DEF", True, numbers, [], None)
    week.game_models = (first,)
    (bare,) = publish.score_record(
        {"slug": "week", "number": 1, "lock": "2026-10-09T14:00:00Z"},
        {"p": week},
        {"p": forecast(week)},
        {"p": [game]},
        {"fetchedAt": "2026-10-09T13:00:00Z"},
    )["players"]["p"]["games"]
    assert (
        not {"startPlainPrev", "startDecPrev", "pDecPrev"} & bare.keys()
    )  # no v0 on file: none saved, never v1's copied in


def _shaped(previous=None, sub_at=30):
    start, sub = np.zeros(101), np.zeros(101)
    start[40], start[80], sub[sub_at] = 0.7, 0.3, 1
    outcome = keeper.Outcome(0.2, 0.3, 80, 40, 52, 40, 80)
    return sofix_v1.GameScore(
        **vars(outcome),
        point=40,
        sub=sofix_v1.Score(sub_at, keeper.Outcome(0.2, 0, sub_at, sub_at, sub_at, sub_at, sub_at), sub),
        previous=previous.start if previous else None,
        previous_outcome=previous,
        mass=start,
    )


def _week(*models, starts=(1.0,)):
    ids = [f"g{i}" for i in range(len(models))]
    return PlayerWeek(
        games=len(models),
        pos="DEF",
        game_ids=ids,
        game_starts=[GameStart(g, p) for g, p in zip(ids, starts, strict=True)],
        game_scores=tuple(m.start if m else None for m in models),
        game_models=models,
    )


def _plan_draws(made, seed=1):
    card = SimpleNamespace(player="p", positions=["DEF"])
    return planner._draw([card], {"p": made}, np.random.default_rng(seed), 20000)[1][:, 0]


def test_the_plan_draws_a_player_from_his_own_two_humped_score_not_a_bell():
    made = forecast(_week(_shaped()))
    drawn = _plan_draws(made)
    assert (drawn >= 70).mean() == pytest.approx(0.3, abs=0.01)
    assert ((drawn > 50) & (drawn < 70)).mean() == 0
    assert drawn.mean() == pytest.approx(made.mu, abs=0.5)
    bell = _plan_draws(replace(made, score_cdf=None))
    assert ((bell > 50) & (bell < 70)).mean() > 0.3


def test_a_moved_number_moves_the_shape_and_a_known_score_stays_known():
    made = forecast(_week(_shaped()))
    assert _plan_draws(replace(made, mu=made.mu + 5)).mean() == pytest.approx(made.mu + 5, abs=0.5)
    assert set(_plan_draws(replace(made, mu=61, sd=0.0))) == {61}


def test_the_shape_mixes_starting_and_coming_on_by_their_chances():
    cdf = forecast(_week(_shaped(), starts=(0.5,))).score_cdf
    made = forecast(_week(_shaped(), starts=(0.5,)))
    on_share = made.p_on / (made.p_start + made.p_on)
    assert cdf[30] == pytest.approx(on_share)
    assert cdf[40] == pytest.approx(on_share + (1 - on_share) * 0.7)


def test_the_shape_is_half_the_model_and_half_v0s_normal_and_decisive_scores():
    previous = keeper.Outcome(0.2, 0.25, 90, 20, 37.5, 20, 90, sd_decisive=5, sd_plain=5)
    cdf = forecast(_week(_shaped(previous))).score_cdf
    assert cdf[50] == pytest.approx(0.5 * 0.7 + 0.5 * 0.75, abs=0.001)


def test_two_games_keep_the_better_score_and_a_game_with_no_model_keeps_the_bell():
    cdf = forecast(_week(_shaped(), _shaped(), starts=(1.0, 1.0))).score_cdf
    assert cdf[40] == pytest.approx(0.49)
    assert forecast(_week(_shaped(), None, starts=(1.0, 1.0))).score_cdf is None


def test_the_plan_stands_on_the_shapes_average_and_the_record_keeps_sofixs_number():
    previous = keeper.Outcome(0.2, 0.25, 90, 20, 37.5, 20, 90, sd_decisive=5, sd_plain=5)
    made = forecast(_week(_shaped(previous)))
    assert made.mu == 52
    assert publish.planning_forecast(made, None).mu == pytest.approx(made.cdf_mu, abs=0.01)
    assert made.cdf_mu == pytest.approx((52 + 37.5) / 2, abs=0.6)
    fix = ScoreFix(a=5, b=1, on=True, spread=12)
    planned = publish.planning_forecast(made, fix)
    assert planned.mu == pytest.approx(made.cdf_mu + 5, abs=0.01) and planned.sd == 12
    plain = replace(made, score_cdf=None)
    assert publish.planning_forecast(plain, None).mu == 52


def test_sorares_plan_stays_on_sorares_number_for_a_player_sofix_has_worked_out():
    week = replace(_week(_shaped()), projection=30.0, start_odds=1.0, plays_odds=1.0)
    assert forecast(week).mu == 52
    stripped = publish.stripped_forecasts({"p": week})["p"]
    assert stripped.mu == 30 and stripped.score_cdf is None


def test_only_laliga_games_carry_a_shape_until_the_others_are_tested():
    trees = {"start": [[[[45], [1]]]], "bench": [[[[35], [1]]]]}
    args = ("DEF", True, keeper.GameNumbers(0.2, 1.5, 1), [], None)
    assert sofix_v1.Model(trees).game(*args).mass is not None
    other = sofix_v1.Model(trees, competition="premier-league-gb-eng").game(*args)
    assert other.mass is None and other.sub.mass is None
