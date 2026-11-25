"""The Pro page's week plan (plans/pro-page.md): lineups start on a batch of games, mix in later games only when that is clearly
better, use every card once, and count a player entered before his own teamsheet as 0 when he does not start."""

from __future__ import annotations

from dataclasses import replace

from app.sorare import pro
from tests.test_sorare_planner import card, forecasts_for
from tests.test_sorare_pro import LALIGA


def games_at(cards, when: dict[str, str]) -> dict:
    """Each card's LaLiga game at a Madrid-day kickoff written as 'DD HH:MM' (November 2026, UTC)."""
    return {
        c.player: [
            {"kickoff": f"2026-11-{when[c.player][:2]}T{when[c.player][3:]}:00+00:00", "competition": "laliga-es"}
        ]
        for c in cards
    }


def five(prefix: str, positions=("GK", "DEF", "MID", "FWD", "DEF")):
    return [card(f"{prefix}{i}", pos) for i, pos in enumerate(positions)]


def test_a_full_batch_plays_on_its_own_games():
    comp = pro.competitions([LALIGA])[0]
    cards = five("a")
    games = games_at(cards, {c.player: "28 15:00" for c in cards})
    plan = pro.week_plan(comp, cards, forecasts_for(cards, p=1.0, mu=80.0), games)
    assert len(plan) == 1
    only = plan[0]
    assert only.span == "batch" and not only.late
    assert only.reach[0] > 0.9  # five sure starters on 80 each clear 320 nearly always


def test_a_batch_short_of_a_forward_borrows_one_from_a_later_game():
    comp = pro.competitions([LALIGA])[0]
    early = five("a", ("GK", "DEF", "MID", "DEF", "MID"))  # no forward at 15:00
    late = [card("b0", "FWD")]
    cards = early + late
    games = games_at(cards, {**{c.player: "28 15:00" for c in early}, "b0": "28 17:30"})
    fc = {**forecasts_for(early, p=1.0, mu=80.0), **forecasts_for(late, p=1.0, mu=80.0)}
    plan = pro.week_plan(comp, cards, fc, games)
    assert len(plan) == 1
    mixed = plan[0]
    assert mixed.span == "3h" and set(mixed.late) == {"b0"}  # the forward goes in blind: his teamsheet is not out yet
    assert mixed.reach[0] > 0.9


def test_a_later_player_who_may_not_start_is_worth_his_chance():
    comp = pro.competitions([LALIGA])[0]
    early = five("a", ("GK", "DEF", "MID", "DEF", "MID"))
    late = [card("b0", "FWD")]
    cards = early + late
    games = games_at(cards, {**{c.player: "28 15:00" for c in early}, "b0": "28 17:30"})
    # he plays one game in two: entered blind, half the time he scores nothing and the five fall short
    fc = {**forecasts_for(early, p=1.0, mu=65.0), "b0": replace(forecasts_for(late, p=0.5, mu=65.0)["b0"], p_start=0.5)}
    sure = {**fc, "b0": forecasts_for(late, p=1.0, mu=65.0)["b0"]}
    blind = pro.week_plan(comp, cards, fc, games)
    certain = pro.week_plan(comp, cards, sure, games)
    assert len(blind) == len(certain) == 1
    # half the time he scores nothing, and the four alone (305 expected) clear 320 far less often than the five
    assert certain[0].reach[0] - blind[0].reach[0] > 0.15


def test_every_card_plays_once_and_the_best_lineup_comes_first():
    comp = pro.competitions([LALIGA])[0]
    sat, sun = five("a"), five("b")
    cards = sat + sun
    games = games_at(cards, {**{c.player: "28 15:00" for c in sat}, **{c.player: "29 15:00" for c in sun}})
    fc = {**forecasts_for(sat, p=1.0, mu=60.0), **forecasts_for(sun, p=1.0, mu=80.0)}
    plan = pro.week_plan(comp, cards, fc, games)
    assert len(plan) == 2
    used = [c.player for lineup in plan for c in lineup.lineup.starters]
    assert len(used) == len(set(used)) == 10
    assert [lineup.start.day for lineup in plan] == [28, 29]  # shown in kick-off order


def test_best_five_ignores_kickoff_times():
    comp = pro.competitions([LALIGA])[0]
    sat = five("a", ("GK", "DEF", "MID", "DEF", "MID"))
    sun = [card("b0", "FWD")]
    cards = sat + sun
    games = games_at(cards, {**{c.player: "28 15:00" for c in sat}, "b0": "30 20:00"})  # two days later
    fc = forecasts_for(cards, p=1.0, mu=80.0)
    assert pro.week_plan(comp, cards, fc, games) == []  # by batch, a lineup waits at most 26 hours for its last game
    anytime = pro.week_plan(comp, cards, fc, games, any_time=True)
    assert len(anytime) == 1 and anytime[0].span == "any" and set(anytime[0].late) == {"b0"}


def test_a_lineup_breaking_the_in_season_rule_is_never_planned():
    comp = pro.competitions([LALIGA])[0]
    cards = [card(f"c{i}", pos, in_season=i < 3) for i, pos in enumerate(("GK", "DEF", "MID", "FWD", "DEF"))]
    games = games_at(cards, {c.player: "28 15:00" for c in cards})
    assert pro.week_plan(comp, cards, forecasts_for(cards, p=1.0, mu=90.0), games) == []  # three in-season, four needed


def test_the_page_block_has_each_batch_both_plans_and_legal_subs():
    from app.sorare.publish import pro_plan_payload

    comp = pro.competitions([LALIGA])[0]
    early = five("a") + [card("a5", "DEF"), card("a6", "DEF", in_season=False)]
    late = [card("b0", "FWD")]
    cards = early + late
    games = games_at(cards, {**{c.player: "28 15:00" for c in early}, "b0": "29 15:00"})
    fc = forecasts_for(cards, p=0.9, mu=70.0)
    history = {
        "a0": [
            {"date": f"2026-11-{d:02d}T15:00:00+00:00", "status": "FINAL", "score": 40 + d, "mins": 90}
            for d in range(1, 8)
        ]
    }
    block = pro_plan_payload(comp, cards, fc, games, history)
    assert block is not None
    assert [len(b["cards"]) for b in block["batches"]] == [7, 1]  # Saturday's seven and Sunday's forward
    assert block["steps"][0]["target"] == 320 and block["byBatch"] and block["bestFive"]
    starters = block["byBatch"][0]["starters"]
    keeper = next(s for s in starters if s["player"] == "a0")
    assert keeper["l5"] == [[43, 90], [44, 90], [45, 90], [46, 90], [47, 90]]  # his last five, oldest first
    seasons = sum(s["inSeason"] for s in starters)
    for s in starters:  # every sub keeps four in-season cards and plays the slot
        assert len(s["subs"]) <= 2
        assert all(seasons - s["inSeason"] + sub["inSeason"] >= 4 for sub in s["subs"])
    defender = next(s for s in starters if s["slot"] == "DEF")
    assert defender["subs"] and all(sub["pos"] == "DEF" for sub in defender["subs"])
    assert all(s["late"] is None or s["subs"] == [] for s in starters)  # a player entered blind has no sub


def test_leftovers_are_cards_free_after_the_laliga_in_season_lineups_and_not_placed_after_every_lineup():
    from app.sorare.publish import pro_spare

    week = {
        "playing": {
            "players": [
                {"player": "a", "name": "A", "pos": "GK", "cards": 2, "inSeason": True, "x": 50, "pStart": 0.9},
                {"player": "b", "name": "B", "pos": "DEF", "cards": 1, "inSeason": True, "x": 60, "p": 0.8},
                {"player": "c", "name": "C", "pos": "MID", "cards": 1, "inSeason": False, "x": 40, "p": 0.5},
            ]
        },
        "plans": [
            {
                "lineups": [
                    {
                        "key": "LALIGA EA SPORTS | Limited",
                        "group": "In-season",
                        "starters": [{"player": "a"}],
                        "subs": [],
                    },
                    {"key": "Champion | Limited", "group": "Classic", "starters": [{"player": "b"}], "subs": []},
                ]
            }
        ],
    }
    spare = pro_spare(week)
    # a has a second card; b only plays in the Champion lineup, so he is free after the LaLiga ones
    assert [(r["player"], r["free"]) for r in spare["leftovers"]] == [("b", 1), ("a", 1), ("c", 1)]
    assert [(r["player"], r["free"]) for r in spare["notPlaced"]] == [("a", 1), ("c", 1)]
    assert spare["leftovers"][1]["start"] == 0.9 and spare["leftovers"][0]["start"] == 0.8
    assert pro_spare({}) == {"leftovers": [], "notPlaced": []}
