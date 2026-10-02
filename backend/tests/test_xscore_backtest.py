"""The xScore backtest (roadmap 3.1, plans/xscore.md P2): today's model and simple baselines, each scored on games it had not seen.

Every history here is made up, so what each test says about the harness is certain: a player built to start for his country and
come off the bench for his club must show the error today's model makes, a game's prediction must never see that game or a later
one, and a week of two games must not tell the second what the first did."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import Any

import pytest

from app.sorare import backtest

MONDAY = datetime(2026, 1, 5, tzinfo=UTC)  # a Monday


def game(
    day: float,
    *,
    score: float = 50.0,
    played: bool = True,
    started: bool = True,
    competition: str = "laliga-es",
    status: str | None = None,
    gid: str | None = None,
) -> dict[str, Any]:
    when = MONDAY + timedelta(days=day)
    return {
        "date": when.isoformat().replace("+00:00", "Z"),
        "competition": competition,
        "gameId": gid or f"g{day}",
        "score": score if played else 0.0,
        "played": played,
        "started": started and played,
        "mins": 90 if played and started else (20 if played else None),
        "status": status or ("FINAL" if played else "DID_NOT_PLAY"),
    }


def player(games: list[dict[str, Any]], pos: str = "FWD") -> dict[str, Any]:
    return {"pos": pos, "name": "Test Player", "games": games}


def rows(players: dict[str, dict[str, Any]], model: str = "today", **kw: Any) -> list[backtest.Row]:
    return [r for r in backtest.walk_forward(players, **kw) if r.model == model]


# ---------------------------------------------------------------------------------------------------- what is predicted
def test_every_scored_game_is_predicted_by_every_model_and_a_game_still_to_come_is_not() -> None:
    games = [game(7 * i) for i in range(6)] + [game(60, status="PENDING", played=False)]
    found = backtest.walk_forward({"p": player(games)})

    assert {r.model for r in found} == set(backtest.MODELS)
    for name in backtest.MODELS:
        assert len([r for r in found if r.model == name]) == 6, name


def test_a_game_he_did_not_play_is_a_zero_and_each_game_says_what_he_did_in_it() -> None:
    games = [game(0, score=40.0), game(7, played=False), game(14, started=False, score=35.0), game(21, score=60.0)]
    found = rows({"p": player(games)})

    assert [(r.score, r.played, r.started, r.role) for r in found] == [
        (40.0, True, True, "start"),
        (0.0, False, False, "dnp"),
        (35.0, True, False, "sub"),
        (60.0, True, True, "start"),
    ]


def test_the_competition_is_a_club_or_a_national_team_and_the_games_before_it_are_counted() -> None:
    games = [game(0), game(7, competition="uefa-nations-league"), game(14, competition="global-cup")]
    found = rows({"p": player(games)})

    assert [r.klass for r in found] == ["club", "national", "national"]
    assert [r.before for r in found] == [0, 1, 2]
    assert backtest.klass("fifa-world-cup") == "national" and backtest.klass("laliga-es") == "club"


# ---------------------------------------------------------------------------------------------------- no peeking
def test_a_prediction_never_sees_the_game_it_is_for_or_any_later_one() -> None:
    base = [game(7 * i, score=40.0 + i) for i in range(8)]
    changed = [dict(g) for g in base]
    changed[5]["score"] = 99.0  # one game turns out very differently
    changed[6]["score"] = 1.0
    changed[7]["score"] = 1.0

    before = {m: [r.expected for r in rows({"p": player(base)}, m)] for m in backtest.MODELS}
    after = {m: [r.expected for r in rows({"p": player(changed)}, m)] for m in backtest.MODELS}

    for name in backtest.MODELS:
        assert before[name][:5] == after[name][:5], f"{name}: games 0 to 4 were predicted from games 0 to 4 only"


def test_the_second_game_of_a_week_is_predicted_without_the_first() -> None:
    quiet = [game(7 * i, score=40.0) for i in range(6)]  # Mondays of six weeks
    week_two_games_a = quiet + [
        game(35.0 + 1.5, score=40.0),
        game(35.0 + 4.0, score=40.0),
    ]  # Tuesday and Friday of the same week
    week_two_games_b = quiet + [
        game(35.0 + 1.5, score=95.0),
        game(35.0 + 4.0, score=40.0),
    ]  # the Tuesday game went far better

    a = rows({"p": player(week_two_games_a)})
    b = rows({"p": player(week_two_games_b)})

    assert a[-1].expected == b[-1].expected, (
        "the Friday game's prediction was made before the week, so it cannot know the Tuesday score"
    )
    assert a[-1].week == a[-2].week


def test_a_game_on_the_morning_of_the_next_week_does_see_the_week_before() -> None:
    games = [game(7 * i, score=40.0) for i in range(6)]
    other = [dict(g) for g in games]
    other[4]["score"] = 90.0
    # the 6th game is in a later week than the 5th: it knows the 5th, so a different 5th gives a different prediction
    assert rows({"p": player(games)})[5].expected != rows({"p": player(other)})[5].expected


# ---------------------------------------------------------------------------------------------------- what the models say
def test_today_is_the_forecast_a_game_would_have_had_and_the_baselines_are_what_they_say() -> None:
    games = [game(7 * i, score=score) for i, score in enumerate([30.0, 50.0, 40.0, 60.0, 20.0, 45.0])]
    found = {m: rows({"p": player(games)}, m) for m in backtest.MODELS}

    # flat: always 45
    assert {r.expected for r in found["flat45"]} == {45.0}
    # last five: the mean of the scores before him, 45 when there are none
    assert found["last5"][0].expected == 45.0
    assert found["last5"][5].expected == pytest.approx(sum([30.0, 50.0, 40.0, 60.0, 20.0]) / 5)
    # today: the production forecast, with a chance of playing and of starting
    last = found["today"][5]
    assert 0.0 < last.p_play <= 1.0 and last.p_start is not None and last.start is not None
    assert last.expected == pytest.approx(last.p_play * last.mu)


def test_the_last_five_by_competition_looks_only_at_games_of_the_same_kind() -> None:
    games = [
        game(0, score=30.0),
        game(7, score=30.0),
        game(14, score=80.0, competition="uefa-nations-league"),
        game(21, score=80.0, competition="uefa-nations-league"),
        game(28, score=30.0),
        game(35, score=80.0, competition="uefa-nations-league"),
    ]
    found = rows({"p": player(games)}, "last5_class")

    assert found[5].expected == pytest.approx(80.0), "a national game is judged by his national games"
    assert found[4].expected == pytest.approx(30.0), "a club game by his club games"
    assert found[0].expected == 45.0


# ---------------------------------------------------------------------------------------------------- the error that is expected
def starter_for_his_country() -> dict[str, Any]:
    """Comes off the bench or misses the squad for his club (about 30 when he plays), starts every game for his country and
    scores about 60 there. A model that pools the two cannot know which game is which."""
    games = []
    for i in range(24):
        day = 4.0 * i
        if i % 4 == 3:
            games.append(game(day, score=60.0 + (i % 3), competition="uefa-nations-league"))
        elif i % 4 == 1:
            games.append(game(day, played=False, competition="laliga-es"))
        else:
            games.append(game(day, score=30.0 + (i % 2), started=False, competition="laliga-es"))
    return player(games)


def test_a_player_who_starts_for_his_country_and_not_for_his_club_shows_the_error_today_makes() -> None:
    table = backtest.scores(backtest.walk_forward({"p": starter_for_his_country()}), by=["model", "klass"])
    national = {r["model"]: r for r in table if r["klass"] == "national"}

    assert national["today"]["bias"] < -10, "today under-predicts his national games: it averages club and country"
    assert national["last5_class"]["mae"] < national["today"]["mae"], (
        "judged by the same kind of game, the baseline is closer"
    )


# ---------------------------------------------------------------------------------------------------- the numbers
def test_the_scores_are_what_the_arithmetic_says() -> None:
    games = [game(7 * i, score=score, played=score > 0) for i, score in enumerate([50.0, 50.0, 0.0, 50.0])]
    found = backtest.walk_forward({"p": player(games)})
    flat = [r for r in found if r.model == "flat45"]
    table = {r["model"]: r for r in backtest.scores(found, by=["model"])}

    errors = [45.0 - r.score for r in flat]  # -5, -5, 45, -5
    assert table["flat45"]["n"] == 4
    assert table["flat45"]["mae"] == pytest.approx(sum(abs(e) for e in errors) / 4)
    assert table["flat45"]["rmse"] == pytest.approx((sum(e * e for e in errors) / 4) ** 0.5)
    assert table["flat45"]["bias"] == pytest.approx(sum(errors) / 4)
    assert table["flat45"]["brier_play"] is None, "a flat 45 says nothing about whether he plays"
    assert table["today"]["brier_play"] is not None and 0.0 <= table["today"]["brier_play"] <= 1.0


def test_the_slices_by_role_depth_position_and_period() -> None:
    games = [game(7 * i, score=40.0) for i in range(14)]
    found = backtest.walk_forward({"p": player(games, "GK"), "q": player(games, "DEF")})

    by_pos = {r["pos"] for r in backtest.scores(found, by=["pos"])}
    assert by_pos == {"GK", "DEF"}
    by_depth = {r["depth"] for r in backtest.scores(found, by=["depth"])}
    assert by_depth == {"0-4 games", "5-9 games", "10+ games"}
    split = backtest.scores(backtest.with_period(found, MONDAY + timedelta(days=70)), by=["period"])
    assert {r["period"] for r in split} == {"tuning", "held out"}


def test_each_game_says_how_often_he_had_started_before_it() -> None:
    regular = rows({"p": player([game(7 * i) for i in range(6)])})
    bench = rows({"p": player([game(7 * i, started=False, score=20.0) for i in range(6)])})
    mixed = rows(
        {"p": player([game(0), game(7, started=False), game(14), game(21, started=False), game(28), game(35)])}
    )
    missed = rows(
        {
            "p": player(
                [game(0), game(7), game(14, played=False), game(21, played=False), game(28, played=False), game(35)]
            )
        }
    )

    assert regular[0].starter == "unknown", "no game seen yet, so nothing is known of how he is used"
    assert regular[5].starter == "regular", "five starts in his last five"
    assert bench[5].starter == "rare", "five appearances off the bench"
    assert mixed[5].starter == "rotation", "three starts in his last five"
    assert missed[5].starter == "rotation", "a game he did not play counts as one he did not start: two in five"


def test_each_game_says_how_many_games_his_week_holds() -> None:
    found = rows({"p": player([game(0.5), game(6.5), game(7.2), game(14.1)])})

    assert [r.week_games for r in found] == [2, 2, 1, 1]
    assert [r.games_that_week for r in found] == ["2+ games", "2+ games", "1 game", "1 game"]


def test_the_slices_are_ranked_by_the_squared_error_today_loses_to_the_best_simple_baseline() -> None:
    found = backtest.walk_forward({"p": starter_for_his_country()})

    ranked = backtest.rank_slices(found)

    assert ranked, "there is something to rank"
    assert [r["total"] for r in ranked] == sorted((r["total"] for r in ranked), reverse=True)
    national = next(r for r in ranked if r["slice"] == "club or national" and r["value"] == "national")
    table = {r["model"]: r for r in backtest.scores(found, by=["model", "klass"]) if r["klass"] == "national"}
    best = min(backtest.BASELINES, key=lambda name: table[name]["rmse"])
    assert national["best"] == best and national["best_rmse"] == pytest.approx(table[best]["rmse"])
    assert national["today_rmse"] == pytest.approx(table["today"]["rmse"])
    assert national["excess"] == pytest.approx(table["today"]["rmse"] ** 2 - table[best]["rmse"] ** 2)
    assert national["excess"] > 0 and national["bias"] < -10, (
        "today under-predicts his country's games and loses to a baseline"
    )
    assert national["total"] == pytest.approx(national["excess"] * national["n"])
    assert not any(r["slice"] == "what he did" for r in ranked), (
        "what he did is known only afterwards, so it cannot be fixed for"
    )


def test_a_week_is_the_monday_it_starts_and_two_games_of_one_week_share_it() -> None:
    found = rows({"p": player([game(0.5), game(6.5), game(7.2)])})

    assert found[0].week == found[1].week == MONDAY.date().isoformat()
    assert found[2].week == (MONDAY + timedelta(days=7)).date().isoformat()


# ---------------------------------------------------------------------------------------------------- better or not
def test_a_model_that_is_closer_every_week_beats_the_other_with_an_interval_that_excludes_zero() -> None:
    games = [game(7 * i, score=40.0 + (i % 5)) for i in range(40)]
    found = backtest.walk_forward({"p": player(games)})

    result = backtest.compare(found, "last5", "flat45", seed=1)

    assert result["weeks"] >= 30
    assert result["diff"] < 0 and result["hi"] < 0, "last five is closer than a flat 45, week after week"
    assert backtest.compare(found, "flat45", "last5", seed=1)["lo"] > 0


def made_row(model: str, week: int, score: float, expected: float) -> backtest.Row:
    when = MONDAY + timedelta(days=7 * week)
    return backtest.Row(
        model=model,
        player="p",
        pos="FWD",
        date=when,
        week=when.date().isoformat(),
        competition="laliga-es",
        klass="club",
        before=5,
        score=score,
        played=score > 0,
        started=score > 0,
        expected=expected,
    )


def test_the_model_that_says_the_average_is_closer_by_squared_error_and_the_one_that_says_zero_by_absolute_error() -> (
    None
):
    # he scores 60 in three weeks of ten and nothing in the rest. Always saying 0 misses by less on a typical week (absolute
    # error rewards the median); always saying the average, 18, is closer once big misses count for more (squared error),
    # and an expected score is an average, so that is the one that says whether it is right.
    found = []
    for week in range(100):
        score = 60.0 if week % 10 < 3 else 0.0
        found += [made_row("average", week, score, 18.0), made_row("zero", week, score, 0.0)]

    absolute = backtest.compare(found, "average", "zero", seed=1)
    squared = backtest.compare(found, "average", "zero", seed=1, metric="squared")

    assert absolute["metric"] == "absolute" and squared["metric"] == "squared"
    assert absolute["diff"] > 0 and absolute["lo"] > 0, "by absolute error, saying zero is closer"
    assert squared["diff"] < 0 and squared["hi"] < 0, "by squared error, saying the average is"


def test_two_models_that_say_the_same_do_not_beat_each_other() -> None:
    games = [game(7 * i) for i in range(20)]
    found = backtest.walk_forward({"p": player(games)})

    result = backtest.compare(found, "today", "today", seed=3)

    assert result["diff"] == 0 and result["lo"] <= 0 <= result["hi"]


def test_the_comparison_is_the_same_every_time_with_the_same_seed() -> None:
    games = [game(7 * i, score=30.0 + (i * 7) % 25) for i in range(30)]
    found = backtest.walk_forward({"p": player(games)})

    assert backtest.compare(found, "today", "last5", seed=5) == backtest.compare(found, "today", "last5", seed=5)


def test_a_comparison_with_no_weeks_in_common_says_so_instead_of_a_number() -> None:
    assert backtest.compare([], "today", "last5")["weeks"] == 0


# ---------------------------------------------------------------------------------------------------- the order
def test_rank_correlation_is_high_when_a_model_orders_players_as_the_scores_do() -> None:
    # six players with steady, different levels, over many weeks: last five orders them right, a flat 45 orders nobody
    players = {f"p{i}": player([game(7 * w, score=30.0 + 8 * i) for w in range(12)]) for i in range(6)}
    found = backtest.walk_forward(players)

    assert backtest.rank_correlation(found, "last5") > 0.9
    assert backtest.rank_correlation(found, "flat45") == pytest.approx(0.0)


def test_rank_correlation_needs_enough_players_in_a_week_to_mean_anything() -> None:
    found = backtest.walk_forward({"p": player([game(7 * w) for w in range(8)])})

    assert backtest.rank_correlation(found, "today") is None


# ---------------------------------------------------------------------------------------------------- the file and the report
def test_a_history_file_is_read_with_the_exporters_shape_and_nothing_else_is_trusted() -> None:
    raw = {
        "exportedAt": "x",
        "since": "y",
        "players": {"p": player([game(0), game(7)]), "bad": {"games": "none"}, "worse": 3},
    }

    players = backtest.read_history(raw)

    assert list(players) == ["p"] and len(players["p"]["games"]) == 2
    assert backtest.read_history({}) == {} and backtest.read_history({"players": []}) == {}


def test_the_report_names_the_split_and_each_model_with_its_error() -> None:
    games = [game(7 * i, score=40.0 + (i % 4)) for i in range(40)]
    found = backtest.walk_forward({"p": player(games)})

    text = backtest.report(found, holdout_from=MONDAY + timedelta(days=7 * 30))

    assert "tuning" in text and "held out" in text
    for name in backtest.MODELS:
        assert name in text
    assert "MAE" in text and "bias" in text.lower()
    assert "absolute error" in text and "squared error" in text, "each comparison is made both ways"
    assert "loses most" in text, "the slices are ranked"


def test_the_report_has_a_table_for_each_slice_the_plan_asks_to_rank() -> None:
    games = [game(7 * i, score=40.0 + (i % 4)) for i in range(40)]
    text = backtest.report(backtest.walk_forward({"p": player(games)}), holdout_from=MONDAY + timedelta(days=7 * 30))

    for label in (
        "club or national",
        "what he did",
        "how much history",
        "position",
        "how often he had started",
        "games in the week",
    ):
        assert label in text, label


# ---------------------------------------------------------------------------------------------------- the command
def test_the_command_reads_the_exported_file_and_prints_the_report(tmp_path, capsys) -> None:
    import json

    from app.jobs import xscore_backtest

    games = [game(7 * i, score=40.0 + (i % 4)) for i in range(40)]
    path = tmp_path / "history.json"
    path.write_text(json.dumps({"players": {"p": player(games)}}), encoding="utf-8")
    out = tmp_path / "report.md"

    assert xscore_backtest.main(["--history", str(path), "--holdout", "2026-08-03", "--out", str(out)]) == 0

    printed = capsys.readouterr().out
    assert "today" in printed and "held out" in printed
    assert out.read_text("utf-8") == printed


def test_the_command_prints_on_a_console_that_cannot_draw_the_reports_dashes(tmp_path, monkeypatch) -> None:
    """A Windows PowerShell console is cp437 or cp850, which have no en dash: the report must still print there."""
    import io
    import json
    import sys

    from app.jobs import xscore_backtest

    games = [game(7 * i, score=40.0 + (i % 4)) for i in range(40)]
    path = tmp_path / "history.json"
    path.write_text(json.dumps({"players": {"p": player(games)}}), encoding="utf-8")
    raw = io.BytesIO()
    console = io.TextIOWrapper(raw, encoding="cp437", write_through=True)
    monkeypatch.setattr(sys, "stdout", console)

    assert xscore_backtest.main(["--history", str(path), "--holdout", "2026-08-03"]) == 0

    assert b"flat45" in raw.getvalue() and b"held out" in raw.getvalue()


def test_the_command_says_what_to_run_first_when_there_is_no_file(tmp_path, capsys) -> None:
    from app.jobs import xscore_backtest

    assert xscore_backtest.main(["--history", str(tmp_path / "missing.json")]) == 1
    assert "export_history" in capsys.readouterr().err
