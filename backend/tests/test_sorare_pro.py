"""Pro boards become competitions from their steps' own rules, weighed against the Arena with cash counted in essence, and a Pro
lineup's games all start within an hour (the owner, 20 Oct 2026)."""

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
SLOTS = [{"name": n, "sub": False} for n in ("goalkeeper", "defender", "midfielder", "forward", "extra")]


def rules(competitions: list[str], rarities: list[str], season: bool = True, extra: str | None = None) -> list[dict]:
    out = [
        {"key": "Scarcity", "rarities": rarities},
        {"key": "CaptainScarcity"},
        {"key": "Competitions", "competitions": [{"slug": c} for c in competitions]},
        {"key": "Appearances", "appearances": SLOTS},
    ]
    return out + ([{"key": "SeasonBonus"}] if season else []) + ([{"key": extra}] if extra else [])


def step(level: int, target: int, state: str, cash_cents: int = 0, essence: int = 0, **rule_args) -> dict:
    rewards = [{"__typename": "MonetaryRewardConfig", "amount": {"usdCents": cash_cents}}] if cash_cents else []
    if essence:
        rewards.append(
            {"__typename": "CardShardRewardConfig", "quantity": essence, "rarity": rule_args.get("shard", "limited")}
        )
    return {
        "level": level,
        "target": target,
        "state": state,
        "engineConfiguration": {"season": 0.05, "captain": 0.5, "grade": 0.01},
        "displayedTypedRules": rules(
            rule_args.get("comps", ["laliga-es"]),
            rule_args.get("rarities", ["unique", "super_rare", "rare", "limited"]),
            rule_args.get("season", True),
            rule_args.get("extra"),
        ),
        "rewardConfigs": rewards,
        "rewardMultiplierConfiguration": BOOSTS,
    }


# The owner's LaLiga board on 20 Oct 2026 after it was restarted (step 0 again), cut to three steps
LALIGA = {
    "title": "LALIGA EA SPORTS",
    "configSlug": "football-pro-27-spain",
    "steps": [step(0, 320, "PLAYABLE", essence=500), step(1, 360, "LOCKED", 500), step(2, 380, "LOCKED", 1000)],
}
UCL_RARE = {
    "title": "European Champions",
    "configSlug": "football-pro-27-c1r",
    "steps": [
        step(0, 380, "PLAYABLE", 1000, comps=["uefa-champions-league"], rarities=["unique", "super_rare", "rare"])
    ],
}
INFERNO = {
    "title": "Inferno",
    "configSlug": "football-no_periodic-fantasy-inferno",
    "steps": [step(0, 320, "PLAYABLE", 500, season=False, extra="CardEditionsCount")],
}


def test_every_board_is_its_current_steps_own_rules_and_one_with_a_rule_sofix_cannot_check_is_left_out():
    laliga, ucl = pro.competitions([LALIGA, UCL_RARE, INFERNO])
    assert laliga.key == "LALIGA EA SPORTS | Pro" and laliga.name == "LaLiga Pro" and laliga.essence_kind == "laliga"
    assert laliga.reference == {1: 320.0} and [(t.cash, t.essence) for t in laliga.tiers] == [
        (0.0, 500)
    ]  # back at step 0
    assert laliga.pro_steps == ((0, 320, 0.0, 500), (1, 360, 5.0, 0), (2, 380, 10.0, 0))
    assert laliga.leagues == frozenset({"laliga-es"}) and laliga.min_in_season == 4 and laliga.size == 5
    assert laliga.subs == [] and laliga.teams_cap == 1 and laliga.club_bonus is None and laliga.captain_bonus == 0.5
    assert laliga.reward_boosts["rare"] == (0.15, 0.25, 0.05, 0.05)
    assert ucl.name == "European Champions Pro Rare" and ucl.rarity == "rare" and "limited" not in ucl.rarities
    assert ucl.leagues == frozenset({"uefa-champions-league"}) and ucl.tiers[0].cash == 10.0
    arena = in_season_comp()
    assert pro.twins([arena, laliga, ucl]) == {laliga.key: arena, arena.key: laliga}


def test_a_finished_board_and_an_unread_answer_give_nothing():
    done = {**LALIGA, "steps": [step(0, 320, "CLAIMED", essence=500)]}
    assert pro.competitions([done]) == []
    assert pro.competitions(None) == []


def kickoffs(cards, *times: str) -> dict:
    return {
        c.player: [{"kickoff": f"2026-10-24T{t}:00+00:00", "competition": "laliga-es"}]
        for c, t in zip(cards, times, strict=True)
    }


def test_a_pro_lineups_games_all_start_within_an_hour_so_every_teamsheet_is_out_before_it_is_entered():
    comp = pro.competitions([LALIGA])[0]
    cards = squad(10)
    games = kickoffs(cards, *["16:00"] * 5, *["18:30"] * 5)
    rule = pro.rules_for(games)(comp)
    assert rule is not None
    assert rule([cards[0], cards[1], None]) and rule(cards[5:10])
    assert not rule([cards[0], cards[5]])  # 16:00 and 18:30: the second teamsheet is not out at the first kickoff
    assert pro.rules_for(games)(in_season_comp()) is None  # the Arena locks with the gameweek: no window
    near = kickoffs(cards, *["16:00"] * 3, *["16:45"] * 7)
    assert pro.rules_for(near)(comp)([cards[0], cards[4]])  # within the hour
    assert not pro.rules_for({})(comp)([cards[0]])  # no game for this board: he cannot play it
    fc = forecasts_for(cards, p=1.0, mu=70.0)
    lineup = build(comp, cards, fc, np.random.default_rng(1), keep=1, rule=pro.rules_for(games)(comp))[0]
    assert len({games[c.player][0]["kickoff"] for c in lineup.starters}) == 1


def test_waiting_for_the_teamsheets_is_worth_what_the_best_five_who_do_start_can_reach():
    comp = pro.competitions([LALIGA])[0]
    cards = squad(15)
    early, late = cards[:5], cards[5:]  # five at 16:00, ten (two per place) from 18:30
    games = kickoffs(cards, *["16:00"] * 5, *["18:30"] * 8, "18:45", "18:45")
    # the late ten play nine games in ten but start six: a Pro lineup is entered on who starts
    late_fc = {k: replace(f, p_start=0.6) for k, f in forecasts_for(late, p=0.9, mu=80.0).items()}
    fc = {**forecasts_for(early, p=1.0, mu=80.0), **late_fc}
    found = pro.windows(comp, cards, fc, games)
    assert len(found) == 2  # 18:45 is inside the 18:30 group, so it is not a group of its own
    sure, unsure = found  # the best chance of the next step first
    assert sure.start.hour == 16 and sure.all_start == 1.0 and set(sure.lineup.starters) == set(early)
    assert (
        len(sure.if_start) == 3 and abs(sure.wait[0] - sure.if_start[0]) < 0.05
    )  # they start anyway: waiting changes nothing
    assert unsure.start.hour == 18 and round(unsure.all_start, 4) == round(0.6**5, 4)
    assert unsure.if_start[0] > 0.9
    # the bench covers who is left out, so waiting beats entering five who all have to start, and stays below "if they all start"
    assert unsure.all_start * unsure.if_start[0] < unsure.wait[0] < unsure.if_start[0]
    assert sure.if_start[0] >= sure.if_start[1] >= sure.if_start[2]  # each step's score is higher
    assert pro.windows(comp, cards[:3], fc, games) == []  # three cards make no lineup


def test_the_cards_go_where_they_are_worth_more_cash_counted_in_essence():
    cards = squad(5)  # one lineup's worth: Pro or the Arena
    fc = forecasts_for(cards, p=1.0, mu=60.0)
    arena = in_season_comp(tiers=[in_season_comp().tiers[1]], reference={1500: 290.0})  # 250 essence, likely
    reachable = pro.competitions([{**LALIGA, "steps": [step(1, 290, "PLAYABLE", 500)]}])[0]
    found = plans([arena, reachable], cards, fc, count=1, runs=2, draws=600)
    assert found[0].lineups[0].comp.key == reachable.key  # $5 (1,500 essence at the owner's rate) beats 250 essence
    out_of_reach = replace(reachable, reference={1: 600.0})
    found = plans([arena, out_of_reach], cards, fc, count=1, runs=2, draws=600)
    assert found[0].lineups[0].comp.key == arena.key


def test_a_rare_captain_raises_the_pro_prize_and_worth_counts_cash_at_the_owners_rate():
    comp = pro.competitions([{**LALIGA, "steps": [step(1, 100, "PLAYABLE", 500)]}])[0]
    cards = squad(5)
    fc = forecasts_for(cards, p=1.0, mu=60.0)
    plain = build(comp, cards, fc, np.random.default_rng(1), keep=1)[0]
    rare = build(comp, [replace(c, rarity="rare") for c in cards], fc, np.random.default_rng(1), keep=1)[0]
    assert plain.p_return > 0.99 and round(plain.e_cash, 2) == 5.0
    assert round(rare.e_cash, 2) == round(5.0 * (1 + 4 * 0.15 + 0.25), 2)  # four in-season Rares and a Rare captain
    assert worth(plain) == plain.e_essence + CASH_IN_ESSENCE * plain.e_cash
