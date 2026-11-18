# ruff: noqa: F811
import json
from copy import deepcopy

import numpy as np
import pytest

from app.models import PlayerGame, ReadModel
from app.services.publish import put
from app.sorare import plan_inputs, planner, strategy_audit
from app.sorare.model import Card, Competition, Forecast, Tier
from tests.test_frozen_scores import NOW, keep
from tests.test_pipeline import db  # noqa: F401
from tests.test_strategy_audit import TIERS, lab

KEY = "LaLiga | Limited"
WEEK = {"slug": "football-17-20-oct-2026", "number": 24, "lock": "2026-10-17T14:00:00Z", "end": "2026-10-20T14:00:00Z"}


def shape(low, high, chance):
    mass = np.zeros(101)
    mass[low], mass[high] = 1 - chance, chance
    return np.cumsum(mass)


def week_inputs():
    comp = Competition(
        key=KEY,
        slug="board",
        name="LaLiga",
        group="Classic",
        rarity="limited",
        starters=[("GK",), ("DEF",)],
        subs=[("GK",), ("DEF", "MID", "FWD")],
        rarities=frozenset({"limited"}),
        leagues=frozenset({"laliga-es"}),
        club_bonus=(2, 0.02),
        tiers=[Tier(1, 100, essence=10)],
        reference={100: 120.0},
        cut_spread=0.04,
    )
    cards = [
        Card(
            slug=f"{p}-1",
            player=p,
            name=p,
            positions=(pos,),
            rarity="limited",
            in_season=True,
            level=1,
            average=50.0,
            league="laliga-es",
            club=p,
        )
        for p, pos in (("keeper", "GK"), ("spare", "GK"), ("back", "DEF"), ("other", "DEF"))
    ]
    forecasts = {
        "keeper": Forecast(
            0.9, 52.0, score_cdf=shape(40, 80, 0.3), cdf_mu=52.0, p_start=0.85, p_on=0.05, start_source="futbolfantasy"
        ),
        "spare": Forecast(0.5, 30.0),
        "back": Forecast(0.95, 58.0, score_cdf=shape(50, 70, 0.4), cdf_mu=58.0),
        "other": Forecast(0.4, 25.0, sd=12.0),
    }
    games = {
        c.player: [{"id": "g1", "venue": "H", "kickoff": "2026-10-17T19:00:00Z", "competition": "laliga-es"}]
        for c in cards
    }
    return comp, cards, forecasts, games


def saved():
    comp, cards, forecasts, games = week_inputs()
    return json.loads(
        json.dumps(plan_inputs.dump(WEEK, [comp], cards, forecasts, games, built_at="2026-10-17T10:00:00Z"))
    )


def test_a_saved_week_comes_back_with_its_rules_cards_and_score_shapes():
    comp, cards, forecasts, _ = week_inputs()
    comps, back_cards, back = plan_inputs.load(saved())
    got = comps[0]
    assert (got.starters, got.subs, got.rarities, got.leagues) == (
        comp.starters,
        comp.subs,
        comp.rarities,
        comp.leagues,
    )
    assert (got.club_bonus, got.tiers, got.reference, got.cut_spread) == (
        comp.club_bonus,
        comp.tiers,
        comp.reference,
        0.04,
    )
    assert [c.slug for c in back_cards] == [c.slug for c in cards] and back_cards[0].plays_in == frozenset(
        {"laliga-es"}
    )
    assert (back["keeper"].p_play, back["keeper"].mu, back["keeper"].links) == (0.9, 52.0, (("g1", "H"),))
    assert (
        back["keeper"].start_source == "futbolfantasy" and back["other"].score_cdf is None and back["other"].sd == 12.0
    )
    assert back["keeper"].score_cdf[59] == pytest.approx(forecasts["keeper"].score_cdf[59], abs=0.001)
    assert back["keeper"].score_cdf[-1] == 1


def test_a_saved_week_plans_the_same_lineups_as_the_week_itself():
    comp, cards, forecasts, games = week_inputs()
    linked = {k: Forecast(**{**vars(f), "links": (("g1", "H"),)}) for k, f in forecasts.items()}
    first = planner.plans([comp], cards, linked, count=1, runs=4, draws=500)[0]
    comps, back_cards, back = plan_inputs.load(saved())
    again = planner.plans(comps, back_cards, back, count=1, runs=4, draws=500)[0]
    assert again.signature() == first.signature()
    assert again.lineups[0].p_return == pytest.approx(first.lineups[0].p_return, abs=0.03)


def test_each_tracked_plan_says_why_it_won_or_missed(db):
    keep(db)
    db.get(PlayerGame, ("b", "g1")).status = "DID_NOT_PLAY"  # the lineup scores 183, one starter out
    value = lab()
    line = deepcopy(value["strategies"][0]["lineups"][0])
    line.update(
        {"key": KEY, "pReturn": 0.4, "tiers": [{**t, "need": {10: 260, 100: 150, 500: 90}[t["hi"]]} for t in TIERS]}
    )
    value["cutoffTests"] = [{"key": "cutoff-range", "label": "Cutoffs as a range", "lineups": [line]}]
    put(db, "strategy_plans:gw", value, NOW)
    put(db, "sorare_references", {"gw": {KEY: {"cuts": {"10": 300, "100": 200, "500": 100}}}}, NOW)
    page = strategy_audit.read(db, NOW)
    assert "cutoffTests" not in page and all(
        "diagnosis" not in week and "cutoffTests" not in week for week in page["weeks"]
    )
    kept = db.get(ReadModel, "plan_tracking").payload
    assert kept["tests"][0]["key"] == "cutoff-range" and kept["tests"][0]["weeks"] == 1
    why = kept["diagnosis"]["cutoff-range"]
    assert (why["label"], why["weeks"], why["lineups"], why["judged"], why["paid"]) == (
        "Cutoffs as a range",
        1,
        1,
        1,
        0,
    )
    assert (why["cutCases"], why["cutError"], why["cutMiss"]) == (1, 50, 50)
    assert (why["lostToCut"], why["wonByCut"], why["nearMiss"], why["nearWin"]) == (1, 0, 0, 0)
    assert why["brier"] == pytest.approx(0.16) and why["said"] == pytest.approx(0.4)
    assert (why["starterOut"], why["covered"]) == (1, 1) and why["starters"] == len(line["starters"])
    assert why["chances"]["40"] == {"lineups": 1, "said": pytest.approx(0.4), "paid": 0}
    assert why["comps"][KEY]["lineups"] == 1 and why["comps"][KEY]["points"] == pytest.approx(183, abs=1)


def test_a_saved_shape_keeps_the_chance_of_scoring_nothing():
    comp, cards, forecasts, games = week_inputs()
    forecasts["keeper"].score_cdf = shape(0, 60, 0.5)
    saved_week = plan_inputs.dump(WEEK, [comp], cards, forecasts, games, built_at="x")
    assert plan_inputs.load(saved_week)[2]["keeper"].score_cdf[0] == pytest.approx(0.5)
