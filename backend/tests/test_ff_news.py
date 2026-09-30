"""The Home page's team news: how the owner's players look for the gameweek, who in his plan might not start, what moved
(plans/futbolfantasy.md, S5). Built from the planned gameweek's payload, which already says each game's chance and source."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import Any

from sqlalchemy.orm import Session

from app.models import ReadModel
from app.sorare import ff_news
from tests.test_pipeline import db  # noqa: F401  (fixture)

NOW = datetime(2026, 10, 10, 16, 56, tzinfo=UTC)
READ = NOW - timedelta(minutes=30)


def told(
    game_id: str, p: float, kind: str | None = None, at: datetime = READ, source: str = "futbolfantasy"
) -> dict[str, Any]:
    game: dict[str, Any] = {
        "id": game_id,
        "kickoff": "2026-10-11T14:15:00Z",
        "competition": "laliga-es",
        "team": "Real Sociedad",
        "opponent": "Deportivo",
        "venue": "H",
        "pStart": p,
        "pOn": 0.1,
        "startSource": source,
        "startAt": at.isoformat(),
    }
    if kind:
        game["ffStatus"] = {"kind": kind}
    return game


def person(slug: str, *games: dict[str, Any], name: str | None = None) -> dict[str, Any]:
    return {
        "player": slug,
        "name": name or slug.title(),
        "pos": "MID",
        "rarity": "limited",
        "pic": f"https://x/{slug}.png",
        "games": list(games),
    }


def starter(slug: str, captain: bool = False) -> dict[str, Any]:
    return {"player": slug, "slug": f"{slug}-card", "name": slug.title(), "captain": captain}


def week(players: list[dict[str, Any]], *lineups: tuple[str, list[str]]) -> dict[str, Any]:
    return {
        "playing": {"players": players},
        "plans": [{"lineups": [{"comp": name, "starters": [starter(s) for s in slugs]} for name, slugs in lineups]}]
        if lineups
        else [],
    }


# -------------------------------------------------------------------------------------- how they look
def test_the_players_are_split_by_how_likely_they_are_to_start() -> None:
    players = [
        person("a", told("g1", 0.9)),
        person("b", told("g2", 0.7)),
        person("c", told("g3", 0.6)),
        person("d", told("g4", 0.4)),
        person("e", told("g5", 0.2)),
        person("f", told("g6", 0.0)),
        person("g", told("g7", 0.0, "out")),
        person("h", told("g8", 0.0, "suspended")),
    ]

    news = ff_news.team_news(week(players), NOW)

    assert news is not None
    assert news["players"] == 8
    assert news["split"] == {"likely": 2, "doubtful": 2, "unlikely": 2, "out": 2}


def test_a_player_the_site_says_nothing_about_is_counted_apart() -> None:
    elsewhere = person("z", {"id": "g9", "kickoff": "2026-10-11T14:15:00Z", "pStart": 0.6})

    news = ff_news.team_news(week([person("a", told("g1", 0.9)), elsewhere]), NOW)

    assert news is not None and news["players"] == 1 and news["without"] == 1


def test_a_sorare_or_sofix_number_is_no_team_news() -> None:
    sorare = person("s", told("g1", 0.3, source="sorare"))

    assert ff_news.team_news(week([sorare]), NOW) is None


def test_a_player_with_two_games_is_looked_at_by_the_first_one_the_site_told() -> None:
    europe = {"id": "g2", "kickoff": "2026-10-15T19:00:00Z", "pStart": 0.3, "startSource": "sorare"}
    double = person("d", europe, told("g1", 0.9))

    news = ff_news.team_news(week([double]), NOW)

    assert news is not None and news["split"]["likely"] == 1


def test_when_the_site_was_last_read_is_the_newest_reading_of_any_game() -> None:
    older = READ - timedelta(hours=3)
    players = [person("a", told("g1", 0.9, at=older)), person("b", told("g2", 0.9, at=READ))]

    news = ff_news.team_news(week(players), NOW)

    assert news is not None and news["readAt"] == READ.isoformat()


# -------------------------------------------------------------------------------- who in the plan might not start
def test_the_plans_starters_under_seventy_percent_are_named_with_their_game_and_lineup() -> None:
    players = [
        person("zubeldia", told("g1", 0.5, "doubt"), name="Igor Zubeldia"),
        person("oyarzabal", told("g2", 0.9)),
        person("pepelu", told("g3", 0.5)),
        person("bench", told("g4", 0.2)),
    ]

    news = ff_news.team_news(week(players, ("All Star", ["zubeldia", "oyarzabal"]), ("LaLiga Ltd", ["pepelu"])), NOW)

    assert news is not None
    risk = news["atRisk"]
    assert risk["total"] == 2
    assert [r["player"] for r in risk["players"]] == ["zubeldia", "pepelu"], "the same chance: by name"
    assert [r["comp"] for r in risk["players"]] == ["All Star", "LaLiga Ltd"]
    assert [r["p"] for r in risk["players"]] == [0.5, 0.5] and risk["players"][1]["kind"] is None
    by_player = {r["player"]: r for r in risk["players"]}
    zubeldia = by_player["zubeldia"]
    assert zubeldia["kind"] == "doubt" and zubeldia["comp"] == "All Star"
    assert zubeldia["game"] == {
        "id": "g1",
        "kickoff": "2026-10-11T14:15:00Z",
        "team": "Real Sociedad",
        "opponent": "Deportivo",
        "venue": "H",
    }
    assert zubeldia["pic"] == "https://x/zubeldia.png" and zubeldia["rarity"] == "limited"
    assert "bench" not in by_player and "oyarzabal" not in by_player, "not in the plan, or likely to start"


def test_a_player_in_two_lineups_is_named_once_with_the_first() -> None:
    players = [person("a", told("g1", 0.5))]

    news = ff_news.team_news(week(players, ("All Star", ["a"]), ("LaLiga Ltd", ["a"])), NOW)

    assert news is not None and news["atRisk"]["total"] == 1
    assert news["atRisk"]["players"][0]["comp"] == "All Star"


def test_the_most_doubtful_come_first_and_the_list_is_short() -> None:
    players = [person(f"p{i}", told(f"g{i}", 0.05 * i + 0.05)) for i in range(12)]

    news = ff_news.team_news(week(players, ("All Star", [f"p{i}" for i in range(12)])), NOW)

    assert news is not None
    shown = news["atRisk"]["players"]
    assert news["atRisk"]["total"] == 12 and len(shown) == ff_news.AT_RISK_SHOWN
    assert [r["p"] for r in shown] == sorted(r["p"] for r in shown)


def test_with_no_plan_nobody_is_at_risk_but_the_players_are_still_split() -> None:
    news = ff_news.team_news(week([person("a", told("g1", 0.5))]), NOW)

    assert news is not None and news["atRisk"] == {"total": 0, "players": []}


# ---------------------------------------------------------------------------------------- what moved
def reading(hours_ago: float, **chances: tuple[str, int]) -> ff_news.Reading:
    return ff_news.Reading(
        NOW - timedelta(hours=hours_ago), {slug: {"g": g, "p": p} for slug, (g, p) in chances.items()}
    )


def test_what_moved_by_ten_points_or_more_since_the_reading_a_day_ago_is_listed_biggest_first() -> None:
    before = reading(20, aspas=("g1", 70), zubeldia=("g2", 80), kubo=("g3", 20), steady=("g4", 60), small=("g5", 50))
    players = [
        person("aspas", told("g1", 0.0, "doubt")),
        person("zubeldia", told("g2", 0.5, "doubt")),
        person("kubo", told("g3", 0.4)),
        person("steady", told("g4", 0.6)),
        person("small", told("g5", 0.55)),
    ]

    news = ff_news.team_news(week(players), NOW, [before])

    assert news is not None and news["moved"] is not None
    moved = news["moved"]
    assert moved["since"] == before.at.isoformat() and moved["total"] == 3
    assert [(m["player"], m["from"], m["to"]) for m in moved["players"]] == [
        ("aspas", 70, 0),
        ("zubeldia", 80, 50),
        ("kubo", 20, 40),
    ]
    assert moved["players"][1]["kind"] == "doubt" and moved["players"][2]["kind"] is None


def test_a_player_whose_game_changed_since_then_has_not_moved() -> None:
    before = reading(20, a=("g1", 90))

    news = ff_news.team_news(week([person("a", told("g2", 0.2))]), NOW, [before])

    assert news is not None and news["moved"] == {"since": before.at.isoformat(), "total": 0, "players": []}


def test_with_nothing_old_enough_to_compare_there_is_no_moved_list() -> None:
    recent = reading(2, a=("g1", 90))

    news = ff_news.team_news(week([person("a", told("g1", 0.2))]), NOW, [recent])

    assert news is not None and news["moved"] is None


def test_the_reading_to_compare_with_is_the_newest_one_at_least_sixteen_hours_old() -> None:
    readings = [reading(40), reading(30), reading(18), reading(9), reading(1)]

    assert ff_news.baseline(readings, NOW) is readings[2]
    assert ff_news.baseline(readings[3:], NOW) is None
    assert ff_news.baseline([], NOW) is None


# ------------------------------------------------------------------------------------- keeping the readings
def test_the_chances_of_now_are_what_the_next_comparison_starts_from() -> None:
    players = [
        person("a", told("g1", 0.7)),
        person("o", told("g2", 0.0, "out")),
        person("s", told("g3", 0.3, source="sorare")),
    ]

    assert ff_news.chances(week(players)) == {"a": {"g": "g1", "p": 70}, "o": {"g": "g2", "p": 0}}


def test_a_reading_is_added_every_six_hours_and_old_ones_go_after_two_days() -> None:
    first = ff_news.record([], {"a": {"g": "g1", "p": 70}}, NOW - timedelta(hours=50))
    assert len(first) == 1

    same_morning = ff_news.record(first, {"a": {"g": "g1", "p": 60}}, NOW - timedelta(hours=47))
    assert same_morning == first, "a run an hour later adds nothing"

    later = ff_news.record(first, {"a": {"g": "g1", "p": 60}}, NOW - timedelta(hours=40))
    assert [r.chances["a"]["p"] for r in later] == [70, 60]

    pruned = ff_news.record(later, {"a": {"g": "g1", "p": 50}}, NOW)
    assert [r.chances["a"]["p"] for r in pruned] == [60, 50], "the 50-hour-old one is gone"


def test_nothing_told_records_nothing() -> None:
    assert ff_news.record([], {}, NOW) == []


def test_the_readings_are_kept_between_runs(db: Session) -> None:  # noqa: F811
    assert ff_news.load(db) == []
    kept = [ff_news.Reading(NOW, {"a": {"g": "g1", "p": 70}})]

    assert ff_news.save(db, kept, NOW) is True
    assert ff_news.load(db) == kept
    assert ff_news.save(db, kept, NOW) is False


def test_readings_that_do_not_read_are_left_out(db: Session) -> None:  # noqa: F811
    db.add(
        ReadModel(
            key=ff_news.KEY,
            payload={
                "readings": [
                    {"at": "not a date", "chances": {}},
                    5,
                    {"at": NOW.isoformat(), "chances": {"a": {"g": "g", "p": 1}}},
                ]
            },
            updated_at=NOW,
        )
    )
    db.commit()

    assert [r.at for r in ff_news.load(db)] == [NOW]
