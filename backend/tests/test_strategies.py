"""The strategy lab: each strategy builds its own lineup from the same cards (plans/lineups-and-xscore.md Phase 2)."""

from __future__ import annotations

from dataclasses import replace

from app.sorare import strategies
from app.sorare.keeper import Outcome
from app.sorare.model import Forecast
from tests.test_sorare_planner import card, forecasts_for, in_season_comp, squad


def _comp():
    return in_season_comp(club_bonus=None, average_bonus=None, min_in_season=0)


def _pool():
    """A keeper of club-a, a better defender of club-b and a lesser one of club-a, and one of everyone else."""
    return [
        card("gk-a", "GK", club="club-a"),
        card("gk-b", "GK", club="club-b"),
        card("def-a", "DEF", club="club-a"),
        card("def-b", "DEF", club="club-b"),
        card("mid-c", "MID", club="club-c"),
        card("mid-d", "MID", club="club-d"),
        card("fwd-c", "FWD", club="club-c"),
        card("fwd-d", "FWD", club="club-d"),
    ]


def _names(lineup):
    return {c.slug for c in lineup.starters}


def test_the_xscore_strategy_takes_the_best_number_in_every_slot_and_captains_the_best_one():
    cards = _pool()
    fc = forecasts_for(cards, p=1.0, mu=50.0)
    fc["gk-a"] = Forecast(p_play=1.0, mu=70.0)
    fc["fwd-d"] = Forecast(p_play=1.0, mu=90.0)
    lineup = strategies.pick(strategies.BY_KEY["xscore"], _comp(), cards, fc, {})
    assert "gk-a" in _names(lineup) and lineup.starters[lineup.captain].slug == "fwd-d"


def test_keeper_with_his_defender_pairs_them_even_when_another_defender_is_better():
    cards = _pool()
    fc = forecasts_for(cards, p=1.0, mu=50.0)
    fc["gk-a"] = Forecast(p_play=1.0, mu=70.0)
    fc["def-b"] = Forecast(p_play=1.0, mu=80.0)  # the better defender is of another club
    fc["def-a"] = Forecast(p_play=1.0, mu=30.0)
    plain = strategies.pick(strategies.BY_KEY["xscore"], _comp(), cards, fc, {})
    paired = strategies.pick(strategies.BY_KEY["keeper-defender"], _comp(), cards, fc, {})
    assert {"gk-a", "def-b"} <= _names(plain) and "def-a" not in _names(plain)
    assert {"gk-a", "def-a"} <= _names(paired)


def test_no_attacker_plays_against_his_own_keeper():
    cards = _pool()
    fc = forecasts_for(cards, p=1.0, mu=50.0)
    fc["gk-a"] = Forecast(p_play=1.0, mu=70.0, links=(("g1", "H"),))
    fc["fwd-c"] = Forecast(p_play=1.0, mu=90.0, links=(("g1", "A"),))  # plays against gk-a
    fc["fwd-d"] = Forecast(p_play=1.0, mu=60.0, links=(("g2", "H"),))
    plain = strategies.pick(strategies.BY_KEY["xscore"], _comp(), cards, fc, {})
    apart = strategies.pick(strategies.BY_KEY["no-clash"], _comp(), cards, fc, {})
    assert {"gk-a", "fwd-c"} <= _names(plain)
    assert not {"gk-a", "fwd-c"} <= _names(apart)  # one of the two goes: here the keeper, whose forward is worth more


def test_a_club_stack_has_three_from_one_club_or_no_lineup():
    cards = _pool()
    fc = forecasts_for(cards, p=1.0, mu=50.0)
    assert strategies.pick(strategies.BY_KEY["club-stack"], _comp(), cards, fc, {}) is None  # no club has three here
    more = [*cards, card("def-c", "DEF", club="club-c")]
    stack = strategies.pick(strategies.BY_KEY["club-stack"], _comp(), more, forecasts_for(more, p=1.0, mu=50.0), {})
    clubs = [c.club for c in stack.starters]
    assert max(clubs.count(club) for club in set(clubs)) >= 3


def test_only_the_surest_starters_and_only_favourites_are_picked():
    cards = squad(12)
    fc = forecasts_for(cards, p=0.95, mu=50.0)
    fc["p0"] = replace(fc["p0"], p_play=0.85, mu=99.0)  # the best score, but not sure to play
    assert "p0" in _names(strategies.pick(strategies.BY_KEY["xscore"], in_season_comp(), cards, fc, {}))
    assert "p0" not in _names(strategies.pick(strategies.BY_KEY["surest"], in_season_comp(), cards, fc, {}))
    odds = {"win": 0.55, "draw": 0.25, "loss": 0.20}
    games = {c.player: [{"odds": odds}] for c in cards}
    games["p1"] = [{"odds": {"win": 0.2, "draw": 0.25, "loss": 0.55}}]
    games["p2"] = [{}]  # no odds yet
    assert (
        strategies.favourite(games["p3"])
        and not strategies.favourite(games["p1"])
        and not strategies.favourite(games["p2"])
    )
    chosen = _names(strategies.pick(strategies.BY_KEY["favourites"], in_season_comp(), cards, fc, games))
    assert not {"p1", "p2"} & chosen


def test_the_ceiling_the_usual_score_and_the_likely_scorers_move_the_number_and_a_week_prices_every_lineup_with_the_same_numbers():
    shape = Outcome(0.3, 0.4, 70.0, 30.0, 46.0, 25.0, 80.0)
    fc = {"x": Forecast(p_play=1.0, mu=46.0, shape=shape)}
    assert strategies.BY_KEY["ceiling"].numbers(fc, {})["x"].mu == 80.0
    assert strategies.BY_KEY["usual"].numbers(fc, {})["x"].mu == 30.0
    assert 46.0 < strategies.BY_KEY["scorers"].numbers(fc, {})["x"].mu < 70.0
    cards = squad(10)
    chances = forecasts_for(cards, p=1.0, mu=50.0)
    made = strategies.week([in_season_comp()], cards, chances, {}, sorare=None)
    assert "sorare" not in {s.key for s, _ in made}  # no Sorare numbers yet: that strategy waits
    lineups = [lu for _, lus in made for lu in lus]
    assert lineups and all(lu.expected > 0 and lu.high >= lu.low for lu in lineups)


def test_a_whole_plan_can_be_picked_a_strategys_way_and_still_be_priced_on_the_real_numbers():
    from app.sorare.planner import plans

    cards = [*_pool(), card("def-c", "DEF", club="club-c")]
    real = forecasts_for(cards, p=1.0, mu=50.0)
    comp = in_season_comp(club_bonus=None, average_bonus=None, min_in_season=0, teams_cap=1)
    stack = strategies.BY_KEY["club-stack"]
    found = plans([comp], cards, real, count=1, runs=2, draws=400, rule_for=stack.rule_for(real))
    clubs = [c.club for c in found[0].lineups[0].starters]
    assert max(clubs.count(club) for club in set(clubs)) >= 3
    # picked on the ceiling, priced on the real numbers: the lineup's expected score does not take the ceiling's higher ones
    high = {p: replace(f, mu=95.0) for p, f in real.items()}
    lifted = plans([comp], cards, real, count=1, runs=2, draws=400, view=high)[0].lineups[0]
    assert lifted.expected < 400  # five cards at 50 with bonuses, not at 95
