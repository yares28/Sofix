"""Futbol Fantasy's start chance in the forecast, game by game (plans/futbolfantasy.md, S3).

The rule: FF's number for a game, else Sorare's, else the app's own from his form. It changes the chance he plays, so the
expected score, the plans and the captain move with it; it never changes his score if he plays or if he starts.
"""

from __future__ import annotations

import pytest

from app.sorare.forecast import GameStart, PlayerWeek, forecast

HISTORY = [
    ("2026-09-20", 60.0, True),
    ("2026-09-16", 58.0, True),
    ("2026-09-13", 62.0, True),
    ("2026-09-09", 61.0, True),
    ("2026-09-02", 59.0, True),
]
STARTS = {date: True for date, _, _ in HISTORY}  # five starts in five


def week(games: int = 1, **extra: object) -> PlayerWeek:
    ids = [f"g{i + 1}" for i in range(games)]
    return PlayerWeek(games=games, history=HISTORY, starts=STARTS, pos="MID", game_ids=ids, **extra)  # type: ignore[arg-type]


def ff(game: str, chance: float, out: bool = False, **info: object) -> GameStart:
    return GameStart(game=game, p_start=chance, out=out, info=dict(info))


# ---------------------------------------------------------------------------------------------------- the order
def test_futbol_fantasy_beats_sorare_which_beats_his_form() -> None:
    sorare = dict(projection=62.0, plays_odds=0.9, start_odds=0.8)

    alone = forecast(week(**sorare))
    with_ff = forecast(week(game_starts=[ff("g1", 0.3)], **sorare))
    form_only = forecast(week())

    assert alone.per_game == (), "no Futbol Fantasy: the old path, nothing added"
    assert alone.p_start == 0.8 and with_ff.p_start == 0.3
    assert [c.source for c in with_ff.per_game] == ["futbolfantasy"]
    assert form_only.p_start == pytest.approx(5.8 / 7, abs=1e-3)  # his form, as before
    assert forecast(week(game_starts=[ff("g1", 0.3)])).p_start == 0.3, "it beats his form too"


def test_with_no_futbol_fantasy_number_the_forecast_is_exactly_what_it_was() -> None:
    for extra in ({}, {"projection": 55.0, "plays_odds": 0.7, "start_odds": 0.5}):
        plain = forecast(PlayerWeek(games=2, history=HISTORY, starts=STARTS, pos="MID", **extra))
        listed = forecast(week(games=2, game_starts=[], **extra))
        assert listed == plain


def test_his_score_if_he_plays_and_if_he_starts_do_not_move_with_the_chance() -> None:
    sorare = dict(projection=62.0, plays_odds=0.9, start_odds=0.8)
    before = forecast(week(**sorare))
    after = forecast(week(game_starts=[ff("g1", 0.05)], **sorare))

    assert (after.mu, after.start, after.bench) == (before.mu, before.start, before.bench)
    assert after.p_play < before.p_play and after.p_start == 0.05


# ------------------------------------------------------------------------------------ coming on from the bench
def test_a_benched_player_comes_on_as_often_as_sorares_substitute_odds_say() -> None:
    # Sorare: starts 60%, comes on 20%, so of the 40% benched half come on. Futbol Fantasy says he starts 10%.
    made = forecast(week(projection=50.0, plays_odds=0.8, start_odds=0.6, game_starts=[ff("g1", 0.10)]))

    assert made.p_start == 0.1
    assert made.p_on == pytest.approx(0.9 * 0.5)
    assert made.p_play == pytest.approx(0.1 + 0.9 * 0.5, abs=1e-4)


def test_without_sorares_odds_the_chance_of_coming_on_is_from_his_form() -> None:
    made = forecast(week(game_starts=[ff("g1", 0.0)]))  # five starts in five: he has never come on
    # (0 substitute appearances + 2 x the outfield prior 0.30) / (0 games not started + 2)
    assert made.p_on == pytest.approx(1.0 * 0.30)
    assert made.p_start == 0.0 and made.p_play == pytest.approx(0.30, abs=1e-4), (
        "0% is a chance of the bench, not of nothing"
    )


def test_a_goalkeeper_at_zero_almost_never_comes_on() -> None:
    made = forecast(
        PlayerWeek(games=1, history=HISTORY, starts=STARTS, pos="GK", game_ids=["g1"], game_starts=[ff("g1", 0.0)])
    )

    assert made.p_on == pytest.approx(0.02)


def test_when_sorare_says_he_always_starts_his_form_says_how_often_he_comes_on_otherwise() -> None:
    # Sorare's own odds leave no bench (100% starter), so there is nothing to read the substitute chance from.
    made = forecast(week(projection=50.0, plays_odds=1.0, start_odds=1.0, game_starts=[ff("g1", 0.5)]))

    assert made.p_on == pytest.approx(0.5 * 0.30)


def test_out_means_no_chance_at_all_not_even_from_the_bench() -> None:
    made = forecast(week(projection=50.0, plays_odds=0.9, start_odds=0.8, game_starts=[ff("g1", 0.0, out=True)]))

    assert (made.p_start, made.p_on, made.p_play) == (0.0, 0.0, 0.0)
    assert made.per_game[0].source == "futbolfantasy"


# --------------------------------------------------------------------------------------- more than one game
def test_two_games_each_take_the_source_that_has_them_and_combine_as_one_minus_the_misses() -> None:
    sorare = dict(projection=50.0, plays_odds=0.7, start_odds=0.6)
    made = forecast(week(games=2, game_starts=[ff("g1", 0.9)], **sorare))  # FF has the first game only

    first, second = made.per_game
    assert (first.game, first.source, first.p_start) == ("g1", "futbolfantasy", 0.9)
    assert (second.game, second.source, second.p_start) == ("g2", "sorare", 0.6)
    plays_first = 0.9 + 0.1 * (0.1 / 0.4)  # FF's start chance, then Sorare's 10% substitute of the 40% it leaves
    assert made.p_play == pytest.approx(1 - (1 - plays_first) * (1 - 0.7), abs=1e-4)


def test_a_game_with_nothing_but_his_form_says_so() -> None:
    made = forecast(week(games=2, game_starts=[ff("g2", 0.8)]))  # no Sorare numbers, FF has the second game only

    assert [c.source for c in made.per_game] == ["sofix", "futbolfantasy"]


def test_the_lift_for_the_better_of_two_games_uses_the_chance_of_playing_both() -> None:
    sorare = dict(projection=50.0, plays_odds=0.7, start_odds=0.6)
    same = forecast(week(games=2, game_starts=[ff("g1", 0.6), ff("g2", 0.6)], **sorare))
    plain = forecast(week(games=2, **sorare))
    assert same.mu == plain.mu, "FF's 60% is Sorare's 60%: nothing moves"

    apart = forecast(week(games=2, game_starts=[ff("g1", 0.95), ff("g2", 0.05)], **sorare))
    p1 = 0.95 + 0.05 * 0.25
    p2 = 0.05 + 0.95 * 0.25
    p_any = 1 - (1 - p1) * (1 - p2)
    assert apart.p_play == pytest.approx(p_any, abs=1e-4)
    # the two of them at once, which is what lifts the better score above the average of the two
    from app.sorare.planner import SCORE_SD

    assert apart.mu == pytest.approx(50.0 + 0.56 * SCORE_SD * (p1 * p2) / p_any, abs=0.01)


def test_the_week_level_chance_is_the_first_games() -> None:
    made = forecast(week(games=2, game_starts=[ff("g1", 0.2), ff("g2", 0.9)]))

    assert made.p_start == 0.2 and made.per_game[0].p_start == 0.2 and made.per_game[1].p_start == 0.9


def test_what_the_page_needs_to_show_travels_with_the_game_untouched() -> None:
    info = {"startAt": "2026-10-08T12:00:00+00:00", "ffStatus": {"kind": "doubt"}, "ffMatch": {"id": 22502}}
    made = forecast(week(game_starts=[ff("g1", 0.4, **info)]))

    assert made.per_game[0].info == info


def test_a_game_with_no_fixture_has_no_forecast_however_many_numbers_there_are() -> None:
    made = forecast(PlayerWeek(games=0, game_ids=[], game_starts=[ff("g1", 0.9)]))

    assert (made.p_play, made.per_game) == (0.0, ())


def test_a_week_whose_game_ids_are_unknown_keeps_the_old_path() -> None:
    made = forecast(PlayerWeek(games=1, history=HISTORY, starts=STARTS, pos="MID", game_starts=[ff("g1", 0.1)]))

    assert made.per_game == () and made.p_start != 0.1


# ---------------------------------------------------------------------------------------------------- Sofix's own chance
def test_sofixs_own_chance_counts_laliga_games_only() -> None:
    # Two cup games on the bench since his five LaLiga starts: rotation, not a lost place (owner, 7 Oct 2026).
    cups = [("2026-09-24", 0.0, False), ("2026-09-27", 0.0, False)]
    rotated = PlayerWeek(games=1, history=cups + HISTORY, starts=STARTS, pos="MID")
    marked = PlayerWeek(
        games=1, history=cups + HISTORY, starts=STARTS, pos="MID", cups=frozenset(d for d, _, _ in cups)
    )

    assert forecast(rotated).by_source["sofix"] < 0.7, "counted, the cup games pull him down"
    assert (
        forecast(marked).by_source["sofix"] == forecast(week()).by_source["sofix"] == pytest.approx(5.8 / 7, abs=1e-3)
    )


def test_no_laliga_game_read_gives_no_sofix_number() -> None:
    unread = forecast(PlayerWeek(games=1, pos="DEF"))
    only_cups = forecast(PlayerWeek(games=1, history=HISTORY, starts=STARTS, cups=frozenset(d for d, _, _ in HISTORY)))

    assert "sofix" not in unread.by_source, "the bare prior (40%) is no reading of him"
    assert "sofix" not in only_cups.by_source
