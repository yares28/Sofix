"""Arcade's ranked sources and start records (plans/arcade-trust.md §4)."""

import random
from datetime import UTC, datetime, timedelta

from app.sorare import arcade_outlook

NOW = datetime(2026, 11, 20, 12, tzinfo=UTC)


def game(days: int, *, comp="premier-league-gb-eng", status="FINAL", started=True, played=None, score=50.0, said=None):
    played = (status == "FINAL") if played is None else played
    return (
        NOW - timedelta(days=days),
        comp,
        status,
        played,
        started if status == "FINAL" else False,
        score,
        said or {},
    )


def test_a_player_who_has_not_played_for_months_is_near_zero_not_a_sure_start():
    # Jake Bidwell on 20 Nov 2026: 0 minutes in his last ten club games.
    out = arcade_outlook.record([game(7 * i, status="DID_NOT_PLAY", score=0.0) for i in range(1, 11)])
    assert out is not None
    assert out["n"] == 10
    assert out["s"] < 0.1
    assert out["x"] is None  # no score of his own without three starts


def test_a_regular_starter_is_high_and_scored_on_his_last_five_starts():
    out = arcade_outlook.record([game(7 * i, score=float(40 + i)) for i in range(1, 11)])
    assert out == {"n": 10, "s": 0.9, "o": 0.033, "x": 43.0, "l": 45.5, "b": 42.0}


def test_his_long_run_is_his_last_twenty_starts_beyond_the_last_ten_games():
    out = arcade_outlook.record([game(7 * i, score=float(i)) for i in range(1, 31)])
    assert out is not None
    assert out["n"] == 10
    assert out["x"] == 3.0  # last five starts
    assert out["l"] == 10.5  # last twenty starts


def test_coming_off_the_bench_counts_with_its_own_score():
    games = [game(7 * i, started=False, score=30.0) for i in range(1, 6)]
    games += [game(7 * i, status="DID_NOT_PLAY") for i in range(6, 11)]
    out = arcade_outlook.record(games)
    assert out is not None
    assert out["o"] == round(5.4 / 12, 3)
    assert out["b"] == round((150 + 84) / 7, 1)


def test_national_team_and_unread_games_are_left_out_and_a_short_record_is_marked():
    games = [game(1, comp="uefa-nations-league"), game(2, status=None), game(3), game(4)]
    out = arcade_outlook.record(games)
    assert out is not None
    assert out["n"] == 2
    assert out["short"] is True
    assert arcade_outlook.record([game(1, comp="uefa-nations-league")]) is None


def row(player, g):
    when, comp, status, played, started, score, said = g
    return (
        player,
        when,
        comp,
        status,
        played,
        started,
        score,
        said.get("sorare"),
        said.get("ff"),
        said.get("sofix"),
        said.get("sofix_x"),
        said.get("sorare_x"),
    )


def test_sources_are_ranked_best_first_and_a_thin_one_uses_its_figure_over_every_competition():
    rows = []
    for p in range(60):  # 60 players × 12 weeks of LaLiga: Sorare always right, Sofix always half sure
        starts = p % 2 == 0
        for week in range(1, 13):
            said = {"sorare": 1.0 if starts else 0.0, "sofix": 0.5, "sofix_x": 50.0, "sorare_x": 60.0}
            status = "FINAL" if starts else "DID_NOT_PLAY"
            g = game(
                7 * week, comp="laliga-es", started=starts, score=50.0 if starts else 0.0, status=status, said=said
            )
            rows.append(row(f"p{p}", g))
    for p in range(5):  # a few Bundesliga games with Futbol Fantasy's word: under the floor everywhere
        rows.append(row(f"b{p}", game(3, comp="bundesliga-de", said={"ff": 0.9})))
    out = arcade_outlook.build(rows, NOW)
    laliga = [r["source"] for r in out["ranking"]["start"]["laliga-es"]]
    assert laliga[0] == "sorare"
    assert laliga.index("record") < laliga.index("sofix")  # a near-sure record beats a constant 50%
    assert [r["source"] for r in out["ranking"]["score"]["laliga-es"]][:2] == ["sofix", "form"]
    bundesliga = {r["source"]: r for r in out["ranking"]["start"]["bundesliga-de"]}
    assert bundesliga["sorare"]["here"] is False  # ranked by its figure over all competitions
    assert "futbolfantasy" not in bundesliga  # under the floor everywhere: not ranked
    assert out["players"]["p0"]["s"] == 0.9
    assert out["players"]["p1"]["s"] < 0.1


def streaky_rows(players: int) -> list[tuple]:
    """Each player has a level of his own; every start scores that level plus noise, so a hot five says little on its own."""
    rng = random.Random(7)
    rows = []
    for p in range(players):
        level = 35 + (p % 6) * 6.0  # 35 to 65
        for day in range(1, 85, 3):  # 28 starts in the last 84 days, newest first
            rows.append(row(f"p{p}", game(day, comp="laliga-es", score=max(0.0, rng.gauss(level, 18)))))
    return rows


def test_a_hot_five_is_pulled_back_toward_his_long_run_when_that_predicts_better():
    # Owner, 23 Nov 2026: Dituro was scored 72 on his last five starts for a game two weeks away, his longer record says 46.
    out = arcade_outlook.build(streaky_rows(120), NOW)
    fit = out["formFit"]
    assert fit["n"] >= 200 and fit["rmseFitted"] < fit["rmseRaw"]
    assert 0 <= fit["b"] < 0.5 < fit["c"]  # his long run counts more than his last five
    hot = max(out["players"].values(), key=lambda r: r["x5"] - r["l"])
    assert hot["x5"] > hot["x"] > hot["l"] - 5  # pulled back, still above where his long run alone would put him
    assert out["ranking"]["score"]["laliga-es"][0]["source"] == "form"


def test_too_few_starts_keep_the_last_five_as_they_are():
    out = arcade_outlook.build(streaky_rows(3), NOW)
    assert "formFit" not in out
    assert all(r["x"] == r["x5"] for r in out["players"].values() if r["x"] is not None)


def test_future_games_are_not_counted():
    out = arcade_outlook.build([row("a", game(-3, started=True))], NOW)
    assert out["players"] == {}
