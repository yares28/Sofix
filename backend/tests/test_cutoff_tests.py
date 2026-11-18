# ruff: noqa: F811
from copy import deepcopy
from types import SimpleNamespace

import numpy as np
import pytest

from app.services.publish import put
from app.sorare import planner, publish, strategy_audit
from app.sorare.model import Card, Competition, Forecast, Tier
from tests.test_frozen_scores import NOW, keep
from tests.test_pipeline import db  # noqa: F401
from tests.test_strategy_audit import lab

KEY = "LaLiga | Limited"


def comp(**extra):
    return Competition(
        key=KEY,
        slug="board",
        name="LaLiga",
        group="Classic",
        rarity="limited",
        starters=[("GK",), ("DEF",)],
        subs=[],
        tiers=[Tier(1, 100, essence=10)],
        reference={100: 300.0},
        **extra,
    )


def references():
    week = lambda score: {KEY: {"cuts": {"100": score}, "entries": 1000}}  # noqa: E731
    return {
        "football-1-4-oct-2026": week(280),
        "football-5-8-oct-2026": week(300),
        "football-9-12-oct-2026": week(320),
        "football-13-16-oct-2026": week(340),
        "football-30-oct-3-nov-2026": week(900),  # after the planned week: it must not count
        "league_games": {KEY: {"cuts": {"100": 1}}},
    }


def test_a_fixed_cutoff_is_all_or_nothing_and_a_range_gives_a_chance_either_side():
    fixed = SimpleNamespace(comp=comp())
    unsure = SimpleNamespace(comp=comp(cut_spread=0.05))
    at, above = np.full(40000, 300.0), np.full(40000, 315.0)
    rng = np.random.default_rng(1)
    assert (planner.landed(fixed, at, rng) == 0).all()
    assert (planner.landed(unsure, at, rng) == 0).mean() == pytest.approx(0.5, abs=0.01)
    assert (planner.landed(unsure, above, rng) == 0).mean() == pytest.approx(0.841, abs=0.01)


def test_the_versions_use_only_finished_weeks_and_the_recent_one_their_last_three():
    today, ranged, recent = (
        publish.cutoff_versions([comp()], references(), "football-17-20-oct-2026")[k][0]
        for k, *_ in publish.CUTOFF_TESTS
    )
    scores = [280.0, 300.0, 320.0, 340.0]
    spread = float(np.std(scores, ddof=1) / np.mean(scores))
    assert (today.reference, today.cut_spread) == ({100: 300.0}, 0.0)
    assert ranged.reference == {100: 300.0} and ranged.cut_spread == pytest.approx(spread)
    assert recent.reference == {100: 320.0} and recent.cut_spread == pytest.approx(spread)


def test_a_competition_with_little_history_keeps_its_cutoff_and_the_usual_range():
    few = {"football-1-4-oct-2026": {KEY: {"cuts": {"100": 280}}}}
    _, ranged, recent = (
        publish.cutoff_versions([comp()], few, "football-17-20-oct-2026")[k][0] for k, *_ in publish.CUTOFF_TESTS
    )
    assert ranged.cut_spread == publish.CUTOFF_SPREAD
    assert recent.reference == {100: 280.0}


def test_each_version_saves_a_whole_plan_that_can_be_scored_later():
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
        for p, pos in (("keeper", "GK"), ("back", "DEF"))
    ]
    forecasts = {c.player: Forecast(1.0, 200.0) for c in cards}
    games = {
        c.player: [{"id": "g1", "venue": "H", "kickoff": "2026-10-17T19:00:00Z", "competition": "laliga-es"}]
        for c in cards
    }
    week = {"slug": "football-17-20-oct-2026", "number": 24, "lock": "2026-10-17T14:00:00Z"}
    got = publish.cutoff_tests(
        week, [comp()], cards, forecasts, games, references(), order=("laliga",), runs=4, draws=200
    )
    assert [t["key"] for t in got["tests"]] == [k for k, *_ in publish.CUTOFF_TESTS]
    assert all(t["lineups"] and {"pReturn", "tiers", "starters", "subs"} <= set(t["lineups"][0]) for t in got["tests"])
    assert got["games"] == {"back": ["g1"], "keeper": ["g1"]}


def test_the_tracked_versions_are_scored_apart_and_stay_off_the_boards(db):
    keep(db)
    value = lab()
    line = deepcopy(value["strategies"][0]["lineups"][0])
    value["cutoffTests"] = [
        {"key": "cutoff-today", "label": "Cutoffs as today", "lineups": [line]},
        {"key": "cutoff-range", "label": "Cutoffs as a range", "lineups": [deepcopy(line)]},
    ]
    put(db, "strategy_plans:gw", value, NOW)
    put(db, "sorare_references", {"gw": {KEY: {"cuts": {"10": 300, "100": 200, "500": 100}}}}, NOW)
    page = strategy_audit.read(db, NOW)
    tests = {t["key"]: t for t in page["cutoffTests"]}
    assert set(tests) == {"cutoff-today", "cutoff-range"}
    assert tests["cutoff-range"]["label"] == "Cutoffs as a range"
    assert (tests["cutoff-range"]["weeks"], tests["cutoff-range"]["scored"]) == (1, 1)
    assert tests["cutoff-range"]["judged"] == 1
    rows = [r["who"] for week in page["weeks"] for board in week["boards"] for r in board["rows"]]
    assert rows and not {"cutoff-today", "cutoff-range"} & set(rows)
    assert all(s["key"] not in tests for s in page["strategies"])
