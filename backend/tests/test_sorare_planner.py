"""The Sorare rules the planner has to obey, and the plans it builds from them."""

from __future__ import annotations

import numpy as np
import pytest

from app.sorare import rules
from app.sorare.forecast import PlayerWeek, forecast
from app.sorare.model import IN_SEASON, ROOM, Card, Competition, Forecast
from app.sorare.planner import (
    Lineup,
    _can_replace,
    build,
    evaluate,
    fill_bench,
    make_plan,
    plans,
    replay,
    replay_rewards,
    score_at_rank,
    totals,
)

POS = ["GK", "DEF", "MID", "FWD", "DEF", "MID", "FWD"]


def card(
    slug: str,
    position: str,
    *,
    in_season: bool = True,
    average: float = 50.0,
    level: int = 0,
    club: str = "club-a",
    league: str = "laliga-es",
    born: str = "1996-01-01",
) -> Card:
    return Card(
        slug=slug,
        player=slug,
        name=slug.title(),
        positions=(position,),
        rarity="limited",
        in_season=in_season,
        level=level,
        average=average,
        birth_day=born,
        league=league,
        club=club,
    )


def squad(n: int = 12, **kwargs) -> list[Card]:
    return [card(f"p{i}", POS[i % len(POS)], **kwargs) for i in range(n)]


def forecasts_for(cards: list[Card], p: float = 0.9, mu: float = 50.0) -> dict[str, Forecast]:
    return {c.player: Forecast(p_play=p, mu=mu, games=1) for c in cards}


def in_season_comp(**kwargs) -> Competition:
    base = dict(
        key="LALIGA EA SPORTS | Limited",
        slug="gw-laliga-limited",
        name="LaLiga",
        group=IN_SEASON,
        rarity="limited",
        starters=[("GK",), ("DEF",), ("MID",), ("FWD",), ("DEF", "MID", "FWD")],
        subs=[("GK",), ("DEF", "MID", "FWD")],
        rarities=frozenset({"limited", "rare", "super_rare", "unique"}),
        min_in_season=4,
        leagues=frozenset({"laliga-es"}),
        season_bonus=0.05,
        level_bonus=0.01,
        captain_bonus=0.5,
        club_bonus=(2, 0.02),
        average_bonus=(260.0, 0.04),
        teams_cap=4,
        tiers=[rules.Tier(1, 50, cash=10.0), rules.Tier(51, 1500, essence=250)],
        reference={1: 520.0, 50: 460.0, 1500: 310.0},
        entries=4000,
    )
    base.update(kwargs)
    return Competition(**base)  # type: ignore[arg-type]


def room_comp(**kwargs) -> Competition:
    base = dict(
        key="All Star | Cap 260",
        slug="gw-allstar-cap260",
        name="All Star · Cap 260",
        group=ROOM,
        rarity="limited",
        starters=[("GK",), ("DEF",), ("MID",), ("FWD",), ("DEF", "MID", "FWD")],
        subs=[],
        rarities=frozenset({"limited", "rare", "super_rare", "unique"}),
        cap=260.0,
        captain_bonus=0.2,
        fee=300,
        room_size=10,
        teams_cap=4,
        tiers=[rules.Tier(1, 1, essence=1300), rules.Tier(2, 2, essence=800), rules.Tier(3, 3, essence=500)],
        reference_rooms=[300.0, 280.0, 260.0, 240.0, 220.0, 200.0, 180.0, 160.0, 140.0, 120.0],
    )
    base.update(kwargs)
    return Competition(**base)  # type: ignore[arg-type]


# --------------------------------------------------------------------------- Sorare's own rule payloads
def test_rules_read_an_in_season_competition_as_sorare_states_it():
    payload = {
        "league": "LALIGA EA SPORTS",
        "track": "Limited",
        "slug": "football-9-13-oct-2026-laliga-limited",
        "mainRarityType": "limited",
        "so5LineupsCount": 4487,
        "teamsCap": 4,
        "format": {"title": "In Season", "entryItem": None},
        "roomsConfig": None,
        "rules": {
            "lockType": "LEAGUE_CUT_OFF",
            "rarities": ["unique", "super_rare", "rare", "limited"],
            "sumOfAverageScores": None,
            "age": None,
            "competitions": [{"slug": "laliga-es"}],
            "appearances": [
                {"name": "goalkeeper", "sub": False},
                {"name": "defender", "sub": False},
                {"name": "midfielder", "sub": False},
                {"name": "forward", "sub": False},
                {"name": "extra", "sub": False},
                {"name": "sub_goalkeeper", "sub": True},
                {"name": "sub_extra", "sub": True},
            ],
        },
        "engineConfiguration": {
            "season": 0.05,
            "captain": 0.5,
            "grade": 0.01,
            "scarcity": {"limited": 0, "rare": 0},
            "sameActiveClub": {"bonus": 0.02, "number_players_per_club": {"max": 2}},
            "averageScores": {"max": 260, "bonus": 0.04, "average_type": "last_ten_played_so5_average_score"},
        },
        "displayedTypedRules": [{"key": "Scarcity"}, {"key": "CaptainScarcity"}, {"key": "SeasonBonus"}],
        "rewardsConfig": {
            "ranking": [
                {
                    "fromRank": 1,
                    "toRank": 1,
                    "rewardConfigs": [{"__typename": "MonetaryRewardConfig", "amount": {"usdCents": 200000}}],
                },
                {
                    "fromRank": 51,
                    "toRank": 150,
                    "rewardConfigs": [{"__typename": "CardShardRewardConfig", "rarity": "limited", "quantity": 2000}],
                },
                {
                    "fromRank": 1501,
                    "toRank": 2000,
                    "rewardConfigs": [
                        {"__typename": "InGameCurrencyRewardConfig", "amount": 1000, "currency": "LIMITED_XP"}
                    ],
                },
            ]
        },
    }
    comp = rules.competition(payload)
    assert comp.name == "LaLiga" and comp.group == IN_SEASON
    assert len(comp.starters) == 5 and len(comp.subs) == 2
    assert comp.min_in_season == 4 and comp.teams_cap == 4 and comp.fee == 0
    assert comp.leagues == frozenset({"laliga-es"}) and comp.captain_bonus == 0.5
    assert comp.club_bonus == (2, 0.02) and comp.average_bonus == (260.0, 0.04)
    assert [(t.lo, t.hi, t.cash, t.essence) for t in comp.tiers] == [
        (1, 1, 2000.0, 0),
        (51, 150, 0.0, 2000),
        (1501, 2000, 0.0, 0),
    ]
    assert [t.pays for t in comp.tiers] == [True, True, False]  # XP pays nothing


def test_rules_read_a_room_of_ten_with_its_entry_fee():
    payload = {
        "league": "All Star",
        "track": "Cap 260",
        "slug": "gw-allstar-cap260",
        "mainRarityType": "limited",
        "so5LineupsCount": 10,
        "teamsCap": None,
        "format": {
            "title": "Cap 260",
            "entryItem": {"__typename": "So5CardShardsEntryItem", "quantity": 300, "rarity": "limited"},
        },
        "roomsConfig": {"roomsSize": 10},
        "rules": {
            "lockType": "LINEUP_CUT_OFF",
            "rarities": ["limited"],
            "sumOfAverageScores": 260,
            "competitions": [],
            "appearances": [
                {"name": "goalkeeper", "sub": False},
                {"name": "defender", "sub": False},
                {"name": "midfielder", "sub": False},
                {"name": "forward", "sub": False},
                {"name": "extra", "sub": False},
            ],
        },
        "engineConfiguration": {"captain": 0.2, "season": None, "grade": None, "scarcity": None},
        "displayedTypedRules": [{"key": "Scarcity"}, {"key": "SumOfAverageScores"}],
        "rewardsConfig": {
            "ranking": [
                {
                    "fromRank": 1,
                    "toRank": 1,
                    "rewardConfigs": [{"__typename": "CardShardRewardConfig", "rarity": "limited", "quantity": 1300}],
                }
            ]
        },
    }
    comp = rules.competition(payload)
    assert comp.group == ROOM and comp.is_room
    assert comp.subs == [] and comp.cap == 260.0 and comp.fee == 300 and comp.room_size == 10
    assert comp.season_bonus == 0.0 and comp.captain_bonus == 0.2  # rooms only have the captain


# --------------------------------------------------------------------------- lineup rules
def test_a_lineup_keeps_the_four_in_season_cards_and_one_player_each():
    cards = squad(10)
    cards[4] = card("classic1", "DEF", in_season=False)
    cards[5] = card("classic2", "MID", in_season=False)
    fc = forecasts_for(cards)
    comp = in_season_comp()
    picked = build(comp, cards, fc, np.random.default_rng(1), keep=1)[0]
    assert len(picked.starters) == 5
    assert sum(1 for c in picked.starters if c.in_season) >= 4
    assert len({c.player for c in picked.starters}) == 5


def test_a_room_lineup_stays_under_the_cap():
    cards = [card(f"p{i}", POS[i % len(POS)], average=70.0) for i in range(6)]
    cards += [card(f"cheap{i}", POS[i % len(POS)], average=30.0) for i in range(6)]
    fc = forecasts_for(cards)
    picked = build(room_comp(), cards, fc, np.random.default_rng(2), keep=1)
    assert picked, "a lineup under the cap exists"
    assert sum(c.average for c in picked[0].starters) <= 260.0


def test_no_lineup_when_a_position_is_missing():
    cards = [card(f"d{i}", "DEF") for i in range(8)]
    assert build(in_season_comp(), cards, forecasts_for(cards), np.random.default_rng(3)) == []


# --------------------------------------------------------------------------- substitutions
def lineup_with_bench(sub_in_season: bool = True, classic_starters: int = 1) -> tuple[Lineup, dict[str, Forecast]]:
    starters = [
        card("gk", "GK"),
        card("def", "DEF"),
        card("mid", "MID"),
        card("fwd", "FWD"),
        card("extra", "MID", in_season=classic_starters == 0),
    ]
    bench = [card("subgk", "GK"), card("subout", "MID", in_season=sub_in_season)]
    comp = in_season_comp()
    lineup = Lineup(comp=comp, starters=starters, subs=[bench[0], bench[1]], captain=3)
    fc = {c.player: Forecast(p_play=1.0, mu=50.0, games=1) for c in [*starters, *bench]}
    return lineup, fc


def test_a_substitute_only_comes_in_for_a_player_who_did_not_play():
    lineup, fc = lineup_with_bench()
    for player in fc:
        fc[player].actual = 40.0
    fc["mid"].actual = None  # the midfielder did not play
    total = replay(lineup, fc)
    assert lineup.came_in == [("subout", "mid")]
    assert total > 0
    # and when everyone plays, the bench stays out
    fc["mid"].actual = 40.0
    replay(lineup, fc)
    assert lineup.came_in == []


def test_a_classic_substitute_stays_out_when_the_lineup_would_drop_under_four_in_season():
    lineup, fc = lineup_with_bench(sub_in_season=False, classic_starters=1)
    for player in fc:
        fc[player].actual = 40.0
    fc["mid"].actual = None  # an in-season starter missing; the only bench outfielder is Classic
    replay(lineup, fc)
    assert lineup.came_in == [], "four in-season cards must remain"
    assert not _can_replace(lineup, 1, 2)


def test_a_substitute_costs_the_lineup_bonuses_and_never_the_captain_bonus():
    lineup, fc = lineup_with_bench()
    lineup.captain = 4  # the Extra slot, the one any outfield substitute can cover
    for player in fc:
        fc[player].actual = 40.0
    with_everyone = replay(lineup, fc)
    fc["extra"].actual = None  # the captain did not play
    after_sub = replay(lineup, fc)
    assert lineup.came_in == [("subout", "extra")]
    # the captain's 50% is gone, and so are the multi-club and cap bonuses
    assert after_sub < with_everyone
    bare = Lineup(comp=lineup.comp, starters=lineup.starters, subs=[None, None], captain=4)
    assert replay(bare, fc) < after_sub  # the substitute still adds his own score


def test_an_outfield_substitute_must_match_the_position_outside_the_extra_slot():
    lineup, fc = lineup_with_bench()  # the bench outfielder is a midfielder
    assert _can_replace(lineup, 1, 2) is True  # the midfielder slot
    assert _can_replace(lineup, 1, 3) is False  # the forward slot
    assert _can_replace(lineup, 1, 4) is True  # the Extra slot takes any outfield player


def test_the_goalkeeper_substitute_only_covers_the_goalkeeper():
    lineup, fc = lineup_with_bench()
    assert _can_replace(lineup, 0, 0) is True
    assert all(_can_replace(lineup, 0, i) is False for i in range(1, 5))


# --------------------------------------------------------------------------- rewards
def test_score_at_rank_interpolates_between_the_scores_that_paid():
    reference = {1: 500.0, 100: 400.0, 1000: 300.0}
    assert score_at_rank(reference, 1) == 500.0
    middle = score_at_rank(reference, 316)
    assert middle is not None and 340 < middle < 360  # halfway in log rank
    assert score_at_rank({}, 10) is None


def test_reward_chance_and_expected_essence_follow_the_reward_table():
    cards = squad(8)
    fc = forecasts_for(cards, p=1.0, mu=80.0)  # a very strong week
    comp = in_season_comp(reference={1: 600.0, 50: 500.0, 1500: 100.0})
    lineup = build(comp, cards, fc, np.random.default_rng(4), keep=1)[0]
    assert lineup.p_return > 0.9  # way over the 100 that paid at rank 1,500
    assert lineup.e_essence > 0


def test_a_room_counts_the_entry_fee():
    cards = [card(f"p{i}", POS[i % len(POS)], average=30.0) for i in range(8)]
    fc = forecasts_for(cards, p=1.0, mu=20.0)  # a weak lineup: it will lose the fee
    lineup = build(room_comp(), cards, fc, np.random.default_rng(5), keep=1)[0]
    assert lineup.e_essence < 0
    assert lineup.p_return < 0.5


# --------------------------------------------------------------------------- benches are optional
def test_a_bench_is_only_filled_from_cards_no_lineup_wanted():
    cards = squad(7)  # exactly one lineup's worth plus two spares
    fc = forecasts_for(cards)
    rng = np.random.default_rng(6)
    comp = in_season_comp(teams_cap=1)
    plan = make_plan([comp], cards, fc, rng, 1.0, 100.0)
    used = {c.slug for lu in plan.lineups for c in lu.starters}
    benched = {c.slug for lu in plan.lineups for c in lu.bench}
    assert len(used) == 5
    assert benched <= {c.slug for c in cards} - used, "a starter is never also a substitute"


def test_a_second_lineup_beats_a_bench_when_the_cards_are_there():
    cards = squad(14)
    fc = forecasts_for(cards)
    plan = make_plan([in_season_comp()], cards, fc, np.random.default_rng(7), 1.0, 100.0)
    assert len(plan.lineups) >= 2, "ten cards make two lineups rather than one lineup with a bench"
    assert plan.lineups[0].starters[0].slug not in {c.slug for c in plan.lineups[1].cards}


def test_no_card_plays_twice_in_a_plan_and_the_lineup_limit_holds():
    cards = squad(40)
    fc = forecasts_for(cards)
    comp = in_season_comp(teams_cap=2)
    plan = make_plan([comp], cards, fc, np.random.default_rng(8), 1.0, 100.0)
    slugs = [c.slug for lu in plan.lineups for c in lu.cards]
    assert len(slugs) == len(set(slugs))
    assert len(plan.lineups) <= 2


def test_plans_are_five_different_ways_to_use_the_week():
    cards = squad(30)
    fc = forecasts_for(cards)
    found = plans([in_season_comp(), room_comp()], cards, fc, count=5, runs=6, draws=600)
    assert 1 <= len(found) <= 5
    signatures = [frozenset(p.signature()) for p in found]
    assert len(signatures) == len(set(signatures))
    assert all(p.chance_of_any() >= p.lineups[0].p_return for p in found)


# --------------------------------------------------------------------------- the replay of a played gameweek
def test_the_replay_scores_the_lineup_against_the_scores_that_really_paid():
    lineup, fc = lineup_with_bench()
    for player in fc:
        fc[player].actual = 60.0
    comp = lineup.comp
    replay_rewards(lineup, fc, reference={1: 600.0, 50: 400.0, 1500: 200.0})
    assert lineup.actual is not None and lineup.actual > 200
    assert lineup.actual_essence == 250 or lineup.actual_cash == 10.0
    assert comp.paying_tiers


# --------------------------------------------------------------------------- forecasts
def test_sorare_numbers_beat_form_when_they_exist():
    history = [("2026-09-10", 30.0, True), ("2026-09-03", 20.0, True)]
    only_form = forecast(PlayerWeek(games=1, history=history))
    assert only_form.source == "form" and 25 < only_form.mu < 45
    with_sorare = forecast(PlayerWeek(games=1, projection=62.0, plays_odds=0.8, history=history))
    assert with_sorare.source == "sorare" and with_sorare.mu == 62.0 and with_sorare.p_play == 0.8


def test_no_game_means_no_forecast_and_a_double_gameweek_raises_both():
    assert forecast(PlayerWeek(games=0)).p_play == 0.0
    single = forecast(PlayerWeek(games=1, projection=50.0, plays_odds=0.7))
    double = forecast(PlayerWeek(games=2, projection=50.0, plays_odds=0.7))
    assert double.p_play > single.p_play  # he only misses out by missing both
    assert double.mu > single.mu  # the better of the two games counts


@pytest.mark.parametrize("position", ["GK", "DEF", "MID", "FWD"])
def test_every_position_can_be_built_into_a_lineup(position):
    cards = squad(12) + [card("extra-one", position)]
    fc = forecasts_for(cards)
    assert build(in_season_comp(), cards, fc, np.random.default_rng(9), keep=1)


def test_evaluate_gives_a_range_that_contains_the_expected_score():
    cards = squad(8)
    fc = forecasts_for(cards)
    lineup = build(in_season_comp(), cards, fc, np.random.default_rng(10), keep=1)[0]
    assert lineup.low < lineup.expected < lineup.high


def test_totals_add_the_captain_bonus_once():
    starters = [card("gk", "GK"), card("def", "DEF"), card("mid", "MID"), card("fwd", "FWD"), card("extra", "MID")]
    comp = in_season_comp(club_bonus=None, average_bonus=None, season_bonus=0.0, level_bonus=0.0)
    lineup = Lineup(comp=comp, starters=starters, subs=[None, None], captain=0)
    plays = np.ones((1, 5), dtype=bool)
    scores = np.full((1, 5), 40.0)
    assert totals(lineup, plays, scores)[0] == pytest.approx(40 * 5 + 40 * 0.5)


def test_fill_bench_leaves_a_useless_substitute_out():
    starters = [card("gk", "GK"), card("def", "DEF"), card("mid", "MID"), card("fwd", "FWD"), card("extra", "MID")]
    spare = card("spare", "DEF", in_season=False)  # Classic, and the lineup already has its one Classic slot free
    comp = in_season_comp()
    fc = {c.player: Forecast(p_play=1.0, mu=50.0, games=1) for c in [*starters, spare]}
    lineup = evaluate(Lineup(comp=comp, starters=starters, subs=[None, None], captain=0), fc, np.random.default_rng(11))
    left = fill_bench([lineup], [spare], fc, np.random.default_rng(11), draws=800)
    assert lineup.bench == [] and left == [spare], "nobody ever misses a game, so a substitute adds nothing"
