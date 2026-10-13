"""The plan math the owner flagged on 6 Oct 2026: numbers that never change for the same lineup, no Room that loses essence, XP
shown apart, the essence order, and one simulation for a whole plan."""

from __future__ import annotations

from dataclasses import replace

import numpy as np

from app.sorare import rules
from app.sorare.model import ESSENCE_ORDER, Card, Forecast
from app.sorare.planner import Lineup, Plan, best_starters, build, evaluate, plan_outcomes, plans, worth_entering
from tests.test_sorare_planner import card, forecasts_for, in_season_comp, room_comp, squad


def test_the_same_lineup_always_gets_the_same_numbers():
    cards = squad(8)
    fc = forecasts_for(cards)
    lineup = build(in_season_comp(), cards, fc, np.random.default_rng(1), keep=1)[0]
    first = (lineup.expected, lineup.p_return, lineup.e_essence)
    again = evaluate(
        Lineup(comp=lineup.comp, starters=list(lineup.starters), subs=list(lineup.subs), captain=lineup.captain), fc
    )
    assert (again.expected, again.p_return, again.e_essence) == first


def test_a_room_that_loses_essence_on_average_is_never_entered():
    cards = [card(f"p{i}", ("GK", "DEF", "MID", "FWD", "DEF", "MID", "FWD")[i % 7], average=30.0) for i in range(10)]
    fc = forecasts_for(cards, p=1.0, mu=45.0)  # about a third of the time in the top 3, not enough to win back 450
    room = room_comp(fee=450)
    lineup = build(room, cards, fc, np.random.default_rng(2), keep=1)[0]
    assert lineup.p_return > 0.05 and lineup.net_essence <= 0
    assert not worth_entering(lineup)
    found = plans([room], cards, fc, count=1, runs=2, draws=600)
    assert all(not lu.comp.is_room for p in found for lu in p.lineups)


def test_xp_is_read_and_kept_apart_from_being_paid():
    ranking = [
        {
            "fromRank": 1,
            "toRank": 50,
            "rewardConfigs": [{"__typename": "MonetaryRewardConfig", "amount": {"usdCents": 1000}}],
        },
        {
            "fromRank": 51,
            "toRank": 1500,
            "rewardConfigs": [{"__typename": "CardShardRewardConfig", "rarity": "limited", "quantity": 250}],
        },
        {
            "fromRank": 1501,
            "toRank": 3500,
            "rewardConfigs": [{"__typename": "InGameCurrencyRewardConfig", "amount": 500, "currency": "LIMITED_XP"}],
        },
    ]
    tiers = rules.reward_tiers(ranking)
    assert [t.xp for t in tiers] == [0, 0, 500] and not tiers[2].pays and tiers[2].rewards
    comp = in_season_comp(tiers=tiers, reference={1: 520.0, 50: 460.0, 1500: 330.0, 3500: 250.0})
    cards = squad(8)
    lineup = build(comp, cards, forecasts_for(cards, p=1.0, mu=60.0), np.random.default_rng(3), keep=1)[0]
    assert lineup.p_xp > 0
    assert abs(lineup.p_return + lineup.p_xp + (1 - sum(lineup.tier_probs)) - 1) < 1e-9
    assert lineup.p_return == lineup.p_cash + lineup.p_essence  # XP never counts as being paid


def test_a_card_only_level_counts_as_being_paid():
    comp = in_season_comp(tiers=[rules.Tier(1, 1500, card=True)], reference={1500: 250.0})
    cards = squad(8)
    lineup = build(comp, cards, forecasts_for(cards, p=1.0, mu=60.0), np.random.default_rng(4), keep=1)[0]
    assert lineup.p_card > 0.5 and worth_entering(lineup)


def test_expected_essence_comes_before_the_owners_essence_order():
    cards = squad(5)  # one lineup's worth: the plan has to choose
    fc = forecasts_for(cards, p=1.0, mu=50.0)
    laliga = in_season_comp(tiers=[rules.Tier(1, 1500, essence=250)], reference={1500: 255.0})
    champion = in_season_comp(
        key="Champion | Limited", tiers=[rules.Tier(1, 1500, essence=250)], reference={1500: 235.0}, leagues=None
    )
    laliga_one, champ_one = (build(c, cards, fc, np.random.default_rng(5), keep=1)[0] for c in (laliga, champion))
    assert champ_one.p_return > laliga_one.p_return > 0.05
    assert champ_one.e_essence > laliga_one.e_essence
    assert (
        plans([laliga, champion], cards, fc, count=1, runs=2, draws=600)[0].lineups[0].comp.essence_kind == "champion"
    )
    first = plans([laliga, champion], cards, fc, count=1, runs=2, draws=600, order=("champion", "laliga"))[0]
    assert first.lineups[0].comp.essence_kind == "champion"


def test_champion_essence_is_ranked_first_by_default():
    assert ESSENCE_ORDER[0] == "champion"


def test_all_star_and_rooms_with_a_fee_are_never_in_a_plan_however_good_they_look():
    # The owner, 13 Oct 2026: All Star and Cap 260 burn essence; his cards go to Champion, the in-season lineups and Pro.
    cards = squad(5)
    fc = forecasts_for(cards, p=1.0, mu=60.0)
    tiers, ref = [rules.Tier(1, 1500, essence=2500)], {1500: 200.0}
    laliga = in_season_comp(tiers=[rules.Tier(1, 1500, essence=250)], reference={1500: 255.0})
    star = in_season_comp(key="All Star | Limited", tiers=tiers, reference=ref, leagues=None)
    room = room_comp(tiers=[rules.Tier(1, 3, essence=5000)], reference_rooms=[100.0] * 10)
    assert worth_entering(build(laliga, cards, fc, np.random.default_rng(8), keep=1)[0])
    assert not worth_entering(build(star, cards, fc, np.random.default_rng(8), keep=1)[0])
    rich = build(room, cards, fc, np.random.default_rng(8), keep=1)[0]
    assert rich.net_essence > 0 and not worth_entering(rich)  # it would pay, and still is not entered
    found = plans([laliga, star, room], cards, fc, count=2, runs=2, draws=600)
    assert {lu.comp.key for p in found for lu in p.lineups} == {laliga.key}
    assert all(p.fees == 0 for p in found)


def test_one_simulation_for_a_plan_does_not_count_the_same_players_twice():
    # Two cards of each of five players, one lineup in each of two competitions: both lineups are paid or missed together.
    base = squad(5)
    twins = [replace(c, slug=c.slug + "-b") for c in base]
    fc = forecasts_for(base, p=1.0, mu=52.0)
    one = in_season_comp(tiers=[rules.Tier(1, 1500, essence=250)], reference={1500: 270.0})
    two = in_season_comp(
        key="Champion | Limited", tiers=[rules.Tier(1, 1500, essence=250)], reference={1500: 270.0}, leagues=None
    )
    a = build(one, base, fc, np.random.default_rng(6), keep=1)[0]
    b = build(two, twins, fc, np.random.default_rng(6), keep=1)[0]
    plan = Plan([a, b])
    apart = 1 - (1 - a.p_return) * (1 - b.p_return)
    together = plan_outcomes(plan, fc).p_any
    assert together < apart - 0.05
    assert abs(together - max(a.p_return, b.p_return)) < 0.06


def test_the_most_likely_result_never_takes_a_fee_off():
    cards: list[Card] = [card(f"p{i}", ("GK", "DEF", "MID", "FWD", "DEF")[i % 5], average=30.0) for i in range(5)]
    fc = forecasts_for(cards, p=1.0, mu=70.0)
    lineup = build(room_comp(), cards, fc, np.random.default_rng(7), keep=1)[0]
    out = plan_outcomes(Plan([lineup]), fc)
    assert out.likely["essence"] >= 0 and 0 < out.p_likely <= 1


def test_no_starter_is_under_30_percent_to_play_and_his_lineup_is_not_made_without_a_better_one():
    # GW21: three All Star lineups held a keeper at 5 to 20%; all scored 0 and none could reach the 434 they needed.
    cards = squad(5)
    fc = forecasts_for(cards, p=0.9, mu=50.0)
    keeper = next(c for c in cards if c.positions[0] == "GK")
    fc[keeper.player] = Forecast(p_play=0.2, mu=60.0, games=1)
    comp = in_season_comp()
    assert best_starters(comp, cards, fc) == [], (
        "the only keeper will probably not play: no lineup, the cards are freed"
    )
    spare = card("spare-keeper", "GK")
    fc[spare.player] = Forecast(p_play=0.9, mu=40.0, games=1)
    [starters] = best_starters(comp, [*cards, spare], fc, keep=1)
    assert spare in starters and keeper not in starters, "a surer keeper is picked over a better one who will not play"
    fc[keeper.player] = Forecast(p_play=0.3, mu=60.0, games=1)
    assert keeper in best_starters(comp, cards, fc, keep=1)[0], "30% is still allowed"


def test_a_competitions_strongest_lineup_is_made_first_and_the_next_is_built_from_what_is_left():
    # GW21 Champion: the stars were spread over lineups that all fell short. One lineup gets every strong card.
    strong, weak = squad(5), [replace(c, slug=c.slug + "-w", player=c.player + "-w") for c in squad(5)]
    fc = {**forecasts_for(strong, p=0.95, mu=70.0), **forecasts_for(weak, p=0.95, mu=40.0)}
    comp = in_season_comp(tiers=[rules.Tier(1, 1500, essence=250)], reference={1500: 250.0})
    first, second = plans([comp], [*weak, *strong], fc, count=1, runs=3, draws=600)[0].lineups[:2]
    assert {c.slug for c in first.starters} == {c.slug for c in strong}
    assert first.expected > second.expected and first.p_return > second.p_return
