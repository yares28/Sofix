"""Futbol Fantasy's chance in the finished page: per game, in the numbers, and in who the plans use (S3)."""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Any

import pytest

from app.sorare import ff_news, publish
from app.sorare.forecast import GameStart
from tests.test_sorare_publish import snapshot

READ = "2026-10-07T09:00:00+00:00"


def told(slug: str, games: list[dict[str, Any]]) -> list[GameStart]:
    if slug == "front-one":  # the page has him out
        return [GameStart(games[0]["id"], 0.0, out=True, info={"startAt": READ, "ffStatus": {"kind": "out"}})]
    if slug == "mid-one":  # the page has him on the bench, most likely
        return [GameStart(games[0]["id"], 0.25, info={"startAt": READ, "ffMatch": {"id": 1, "url": "https://x/1"}})]
    return []


def page(ff: Any = None) -> dict[str, Any]:
    week = publish.week_of(publish.build_payload(snapshot(), runs=3, ff=ff))
    assert week is not None
    return week


def players(week: dict[str, Any]) -> dict[str, dict[str, Any]]:
    return {p["player"]: p for p in week["playing"]["players"]}


def in_plans(week: dict[str, Any]) -> set[str]:
    return {c["slug"] for plan in week["plans"] for lineup in plan["lineups"] for c in lineup["starters"]}


def test_a_player_futbol_fantasy_speaks_about_carries_the_chance_game_by_game() -> None:
    mid = players(page(told))["mid-one"]
    game = mid["games"][0]

    assert (game["pStart"], game["startSource"], game["startAt"]) == (0.25, "futbolfantasy", READ)
    assert game["ffMatch"] == {"id": 1, "url": "https://x/1"}
    assert (mid["pStart"], mid["pOn"]) == (0.25, 0.375), "the week's own numbers are the first game's"
    assert game["pOn"] == 0.375


def test_a_player_it_says_nothing_about_is_exactly_as_he_was() -> None:
    before, after = players(page())["back-one"], players(page(told))["back-one"]

    assert before == after
    assert "pStart" not in after["games"][0] and "startSource" not in after["games"][0]


def test_the_page_without_futbol_fantasy_is_the_page_it_was() -> None:
    assert page(lambda slug, games: []) == page()


def test_the_chance_he_plays_and_what_he_is_expected_to_score_follow_the_number() -> None:
    before, after = players(page())["mid-one"], players(page(told))["mid-one"]

    assert after["p"] == pytest.approx(0.625) and before["p"] == pytest.approx(0.95)
    assert after["x"] < before["x"]
    assert (after["start"], after["bench"]) == (before["start"], before["bench"]), (
        "his score if he starts does not move"
    )


def test_a_player_the_page_has_out_is_not_in_a_plan_and_one_it_does_not_is() -> None:
    assert "front-one" in in_plans(page())
    assert "front-one" not in in_plans(page(told))


def test_a_plan_changes_when_futbol_fantasy_changes() -> None:
    def moved(slug: str, games: list[dict[str, Any]]) -> list[GameStart]:
        return [GameStart(games[0]["id"], 0.05)] if slug == "back-one" else []

    assert page() != page(moved)
    assert players(page(moved))["back-one"]["p"] < players(page())["back-one"]["p"]


def test_a_starter_carries_his_player_so_the_news_can_find_him() -> None:
    starters = [c for plan in page()["plans"] for lineup in plan["lineups"] for c in lineup["starters"]]

    assert starters and all(c["player"] and c["slug"].startswith(c["player"]) for c in starters)


def test_the_home_news_is_built_from_the_finished_page() -> None:
    week = page(told)
    now = datetime(2026, 10, 7, 9, 30, tzinfo=UTC)

    news = ff_news.team_news(week, now)

    assert news is not None
    assert news["players"] == 2 and news["split"] == {"likely": 0, "doubtful": 0, "unlikely": 1, "out": 1}
    assert news["without"] == len(week["playing"]["players"]) - 2
    assert news["readAt"] == READ
    assert ff_news.chances(week) == {
        "front-one": {"g": players(week)["front-one"]["games"][0]["id"], "p": 0},
        "mid-one": {"g": players(week)["mid-one"]["games"][0]["id"], "p": 25},
    }
