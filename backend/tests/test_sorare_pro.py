"""Pro boards become competitions the planner weighs against the Arena, cash counted in essence (the owner, 20 Oct 2026)."""

from __future__ import annotations

from dataclasses import replace

import numpy as np

from app.sorare import pro
from app.sorare.model import CASH_IN_ESSENCE
from app.sorare.planner import build, plans, worth
from tests.test_sorare_planner import forecasts_for, in_season_comp, squad

BOOSTS = {
    "cardBoosts": [
        {
            "rarity": "rare",
            "inSeasonBasisPoints": 1500,
            "captainInSeasonBasisPoints": 2500,
            "allSeasonsBasisPoints": 500,
            "captainAllSeasonsBasisPoints": 500,
        }
    ]
}


def step(level: int, target: int, state: str, cash_cents: int = 0, essence: int = 0) -> dict:
    rewards = [{"__typename": "MonetaryRewardConfig", "amount": {"usdCents": cash_cents}}] if cash_cents else []
    if essence:
        rewards.append({"__typename": "CardShardRewardConfig", "quantity": essence, "rarity": "limited"})
    return {
        "level": level,
        "target": target,
        "state": state,
        "rewardConfigs": rewards,
        "rewardMultiplierConfiguration": BOOSTS,
    }


# Sorare's answer for the owner's LaLiga board on 20 Oct 2026, cut to three steps, and two boards that cannot be planned
LALIGA = {
    "title": "LALIGA EA SPORTS",
    "configSlug": "football-pro-27-spain",
    "rarities": ["limited", "rare"],
    "so5Competition": {"slug": "seasonal-spain"},
    "steps": [step(0, 320, "CLAIMED", essence=500), step(1, 360, "FAILED", 500), step(2, 380, "LOCKED", 1000)],
}
EUROPE = {**LALIGA, "title": "European Champions", "so5Competition": None}
NO_ARENA = {**LALIGA, "title": "Bundesliga", "so5Competition": {"slug": "seasonal-germany"}}


def test_a_board_becomes_the_step_it_stands_on_with_the_arenas_rules_and_without_what_pro_leaves_out():
    arena = in_season_comp()
    [comp] = pro.competitions([LALIGA, EUROPE, NO_ARENA], [arena])
    assert comp.key == "LALIGA EA SPORTS | Pro" and comp.name == "LaLiga Pro" and comp.essence_kind == "laliga"
    assert comp.reference == {1: 360.0} and [(t.cash, t.essence) for t in comp.tiers] == [(5.0, 0)]
    assert comp.pro_steps == ((1, 360, 5.0, 0), (2, 380, 10.0, 0))
    assert comp.subs == [] and comp.teams_cap == 1 and comp.club_bonus is None and comp.average_bonus is None
    assert comp.min_in_season == 4 and comp.captain_bonus == arena.captain_bonus and comp.board_id == ""
    assert comp.reward_boosts["rare"] == (0.15, 0.25, 0.05, 0.05)
    assert pro.twins([arena, comp]) == {comp.key: arena, arena.key: comp}


def test_a_finished_board_and_an_unread_answer_give_nothing():
    done = {**LALIGA, "steps": [step(0, 320, "CLAIMED", essence=500)]}
    assert pro.competitions([done], [in_season_comp()]) == []
    assert pro.competitions(None, [in_season_comp()]) == []


def test_the_cards_go_where_they_are_worth_more_cash_counted_in_essence():
    cards = squad(5)  # one lineup's worth: Pro or the Arena
    fc = forecasts_for(cards, p=1.0, mu=60.0)
    arena = in_season_comp(tiers=[in_season_comp().tiers[1]], reference={1500: 290.0})  # 250 essence, likely
    reachable = pro.competitions([{**LALIGA, "steps": [step(1, 290, "PLAYABLE", 500)]}], [arena])[0]
    found = plans([arena, reachable], cards, fc, count=1, runs=2, draws=600)
    assert found[0].lineups[0].comp.key == reachable.key  # $5 (1,500 essence at the owner's rate) beats 250 essence
    out_of_reach = replace(reachable, reference={1: 600.0})
    found = plans([arena, out_of_reach], cards, fc, count=1, runs=2, draws=600)
    assert found[0].lineups[0].comp.key == arena.key


def test_a_rare_captain_raises_the_pro_prize_and_worth_counts_cash_at_the_owners_rate():
    arena = in_season_comp()
    comp = pro.competitions([{**LALIGA, "steps": [step(1, 100, "PLAYABLE", 500)]}], [arena])[0]
    cards = squad(5)
    fc = forecasts_for(cards, p=1.0, mu=60.0)
    plain = build(comp, cards, fc, np.random.default_rng(1), keep=1)[0]
    rare = build(comp, [replace(c, rarity="rare") for c in cards], fc, np.random.default_rng(1), keep=1)[0]
    assert plain.p_return > 0.99 and round(plain.e_cash, 2) == 5.0
    assert round(rare.e_cash, 2) == round(5.0 * (1 + 4 * 0.15 + 0.25), 2)  # four in-season Rares and a Rare captain
    assert worth(plain) == plain.e_essence + CASH_IN_ESSENCE * plain.e_cash
