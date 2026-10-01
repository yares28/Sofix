"""The early plan for the round Futbol Fantasy covers stands on its numbers; the rounds after it do not (R1, plans/review-fixes.md)."""

from __future__ import annotations

from datetime import timedelta
from typing import Any

import pytest

from app.sorare import early, publish
from app.sorare.forecast import GameStart
from tests.test_pipeline import db  # noqa: F401  (fixture)
from tests.test_sorare_early import NOW, keep
from tests.test_sorare_early import rounds as spaced
from tests.test_sorare_projection import early_snapshot, rounds

READ = "2026-10-30T09:00:00+00:00"
NEXT_GAMES = {"2026-10-31", "2026-11-01"}  # round 11: the only games the site has, as it has each club's next one only


def told(slug: str, games: list[dict[str, Any]]) -> list[GameStart]:
    """What the site says about the games of round 11, and nothing about any other round."""
    out: list[GameStart] = []
    for game in games:
        if game["kickoff"][:10] not in NEXT_GAMES:
            continue
        if slug == "front-one":  # out for weeks
            out.append(GameStart(game["id"], 0.0, out=True, info={"startAt": READ, "ffStatus": {"kind": "out"}}))
        elif slug == "mid-one":  # on the bench, most likely
            out.append(GameStart(game["id"], 0.25, info={"startAt": READ, "ffMatch": {"id": 1, "url": "https://x/1"}}))
    return out


def weeks(ff: Any = None) -> list[dict[str, Any]]:
    return publish.projected_weeks(early_snapshot(), rounds()[1:], runs=2, draws=100, ff=ff)


def players(week: dict[str, Any]) -> dict[str, dict[str, Any]]:
    return {p["player"]: p for p in week["playing"]["players"]}


def in_plans(week: dict[str, Any]) -> set[str]:
    return {c["player"] for plan in week["plans"] for lineup in plan["lineups"] for c in lineup["starters"]}


def test_the_early_plan_of_the_round_the_site_covers_takes_its_chance_and_says_when_it_was_read() -> None:
    round_11 = weeks(told)[0]
    assert round_11["projected"]["round"] == 11

    game = players(round_11)["mid-one"]["games"][0]

    assert (game["pStart"], game["startSource"], game["startAt"]) == (0.25, "futbolfantasy", READ)
    assert game["ffMatch"] == {"id": 1, "url": "https://x/1"}
    cards = [c for plan in round_11["plans"] for lu in plan["lineups"] for c in (*lu["starters"], *lu["subs"])]
    mine = [c for c in cards if c["player"] == "mid-one"]
    assert all(c["startSource"] == "futbolfantasy" and c["pStart"] == 0.25 for c in mine)


def test_a_player_the_site_has_out_is_in_no_lineup_of_that_early_plan() -> None:
    assert "front-one" in in_plans(weeks()[0]), "without the site he is a starter"
    round_11 = weeks(told)[0]
    assert "front-one" not in in_plans(round_11)
    assert players(round_11)["front-one"]["games"][0]["startSource"] == "futbolfantasy"


def test_the_rounds_after_it_have_no_futbol_fantasy_and_are_what_they_were() -> None:
    before, after = weeks()[1], weeks(told)[1]

    assert after["projected"]["round"] == 36
    assert all(g.get("startSource") != "futbolfantasy" for p in after["playing"]["players"] for g in p["games"])
    assert after == before


# ------------------------------------------------------------------------------- the round it covers is kept current
@pytest.mark.parametrize("covered", [{10}, set()])
def test_a_round_the_site_covers_is_planned_again_every_run_however_fresh_its_plan(db, covered) -> None:  # noqa: F811
    keep(db, 10, timedelta(minutes=5))
    keep(db, 11, timedelta(minutes=5))

    plan, kept = early.choose(db, spaced(3), NOW, live=covered)  # rounds 10, 11 and 12

    assert [r.number for r in plan] == ([10, 12] if covered else [12]), "round 12 has no plan at all"
    assert set(kept) == ({11} if covered else {10, 11})
