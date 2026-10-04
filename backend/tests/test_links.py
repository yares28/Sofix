"""Scores that move together: a keeper and his defenders, a keeper and the other side's forwards (plans/xscore.md P9 X6; roadmap 10.6)."""

from __future__ import annotations

import numpy as np
import pytest

from app.sorare import links
from app.sorare.model import Forecast
from app.sorare.planner import Lineup, build, evaluate, simulate
from tests.test_sorare_planner import card, forecasts_for, in_season_comp


def test_a_keeper_and_his_own_defenders_move_together_and_against_the_other_sides_forwards() -> None:
    games = [(("g1", "H"),), (("g1", "H"),), (("g1", "A"),)]
    matrix = links.matrix(["GK", "DEF", "FWD"], games)
    assert matrix[0, 1] == pytest.approx(0.29, abs=0.05)  # keeper and his defender
    assert matrix[0, 2] == pytest.approx(-0.26, abs=0.05)  # keeper and the other side's forward
    assert np.allclose(matrix, matrix.T) and np.allclose(np.diag(matrix), 1.0)


def test_players_in_different_games_are_unrelated() -> None:
    matrix = links.matrix(["GK", "DEF"], [(("g1", "H"),), (("g2", "H"),)])
    assert matrix[0, 1] == 0.0
    assert np.allclose(links.matrix(["GK", "DEF"], [(), ()]), np.eye(2))


def test_a_lineup_of_one_game_is_a_valid_correlation_matrix_even_when_the_pairs_ask_for_too_much() -> None:
    games = [(("g1", "H"),)] * 5 + [(("g1", "A"),)] * 5
    matrix = links.matrix(["GK", "DEF", "DEF", "DEF", "DEF", "FWD", "FWD", "FWD", "MID", "MID"], games)
    assert np.linalg.eigvalsh(matrix).min() > 0
    assert np.allclose(np.diag(matrix), 1.0)


def keeper_and_defender() -> tuple[Lineup, dict[str, Forecast]]:
    comp = in_season_comp(starters=[("GK",), ("DEF",)], subs=[], min_in_season=0, club_bonus=None, average_bonus=None)
    cards = [card("gk", "GK"), card("def", "DEF")]
    lineup = Lineup(comp=comp, starters=cards, subs=[])
    return lineup, forecasts_for(cards, p=1.0, mu=50.0)


def test_linked_scores_make_a_lineups_total_more_spread_than_independent_ones() -> None:
    lineup, forecasts = keeper_and_defender()
    independent = simulate(lineup, forecasts, np.random.default_rng(1), 20000)
    for slug in ("gk", "def"):
        forecasts[slug].links = (("g1", "H"),)
    linked = simulate(lineup, forecasts, np.random.default_rng(1), 20000)
    assert linked.std() > independent.std() * 1.05
    assert linked.mean() == pytest.approx(independent.mean(), abs=1.5)


def test_without_links_the_simulation_is_what_it_was() -> None:
    lineup, forecasts = keeper_and_defender()
    a = simulate(lineup, forecasts, np.random.default_rng(3), 500)
    b = simulate(lineup, forecasts, np.random.default_rng(3), 500)
    assert np.array_equal(a, b)


def test_the_captain_is_the_player_with_the_best_chance_of_the_reward_not_only_the_best_average() -> None:
    # One reward, far above what the lineup usually scores: only a big score from the captain reaches it.
    comp = in_season_comp(
        starters=[("GK",), ("DEF",)],
        subs=[],
        min_in_season=0,
        club_bonus=None,
        average_bonus=None,
        captain_bonus=0.5,
        tiers=[],
        reference={},
    )
    cards = [card("steady", "GK", club="a"), card("swing", "DEF", club="b")]
    forecasts = {
        "steady": Forecast(p_play=1.0, mu=52.0, games=1, sd=3.0),
        "swing": Forecast(p_play=1.0, mu=50.0, games=1, sd=30.0),
    }
    from app.sorare import rules

    comp = in_season_comp(
        starters=[("GK",), ("DEF",)],
        subs=[],
        min_in_season=0,
        club_bonus=None,
        average_bonus=None,
        captain_bonus=0.5,
        tiers=[rules.Tier(1, 50, cash=10.0)],
        reference={1: 150.0, 50: 140.0},
    )
    built = build(comp, cards, forecasts, np.random.default_rng(5), keep=1, draws=3000)
    assert built and built[0].starters[built[0].captain].slug == "swing"
    best_average = max(range(2), key=lambda i: forecasts[cards[i].player].p_play * forecasts[cards[i].player].mu)
    assert best_average == 0  # the old rule would have chosen the steady keeper
    assert evaluate(built[0], forecasts, np.random.default_rng(5), 3000).p_return > 0
