"""Futbol Fantasy's chance for each of the owner's players in each of his games (plans/futbolfantasy.md, S3)."""

from __future__ import annotations

import dataclasses
import json
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any

import pytest

from app.sorare import ff_use
from app.sorare.ff_feed import Feed, Stored
from app.sorare.ff_link import Person
from app.sources import futbolfantasy_matches as ffm
from tests.test_ff_link import absence, match, player, side

FIXTURES = Path(__file__).parent / "fixtures" / "futbolfantasy"
READ = datetime(2026, 10, 10, 8, tzinfo=UTC)  # the morning of the round, four hours before the first game of the day
NOW = READ + timedelta(minutes=10)


@pytest.fixture(scope="module")
def real() -> list[ffm.Match]:
    return [ffm.match_from_dict(item) for item in json.loads((FIXTURES / "matches_round_8.json").read_text("utf-8"))]


def feed_of(matches: list[ffm.Match], read_at: datetime = READ, changed: dict[str, datetime] | None = None) -> Feed:
    return Feed(matches={one.match_id: Stored(one, read_at, dict(changed or {})) for one in matches}, read_at=read_at)


def row(slug: str, display: str, club: str, position: str = "Midfielder", born: str | None = None) -> dict[str, Any]:
    return {
        "player": {
            "slug": slug,
            "displayName": display,
            "position": position,
            "birthDay": born,
            "activeClub": {"name": club, "shortName": club},
        }
    }


def game(game_id: str, kickoff: str, team: str, opponent: str, competition: str = "laliga-es") -> dict[str, Any]:
    return {
        "id": game_id,
        "kickoff": kickoff,
        "team": team,
        "opponent": opponent,
        "venue": "H",
        "competition": competition,
    }


OYARZABAL = row("mikel-oyarzabal-ugarte", "Oyarzabal", "Real Sociedad", "Forward")
SOCIEDAD = game("g1", "2026-10-11T14:15:00Z", "Real Sociedad", "Deportivo")


# -------------------------------------------------------------------------------------------- the real round 8
def test_a_players_game_gets_the_chance_the_page_gave_him_with_where_and_when_it_was_read(
    real: list[ffm.Match],
) -> None:
    lineups = ff_use.Lineups(feed_of(real), [OYARZABAL], NOW)

    told = lineups.starts("mikel-oyarzabal-ugarte", [SOCIEDAD])

    assert len(told) == 1
    start = told[0]
    assert (start.game, start.p_start, start.out) == ("g1", 0.9, False)
    assert start.info["startAt"] == READ.isoformat()
    assert start.info["ffMatch"] == {
        "id": 22502,
        "url": "https://www.futbolfantasy.com/partidos/22502-real-sociedad-deportivo",
    }
    assert start.info["ffPlayer"] == "2675" and "ffStatus" not in start.info, "nothing is wrong with him"


def test_a_doubt_is_a_chance_with_the_reason_beside_it(real: list[ffm.Match]) -> None:
    grimaldo = row("alejandro-grimaldo-garcia", "Alejandro Grimaldo", "Atlético Madrid", "Defender")
    told = ff_use.Lineups(feed_of(real), [grimaldo], NOW).starts(
        "alejandro-grimaldo-garcia", [game("g9", "2026-10-10T14:15:00Z", "Atlético Madrid", "Deportivo Alavés")]
    )

    assert told[0].p_start == 0.5 and not told[0].out
    assert told[0].info["ffStatus"]["kind"] == "doubt"


def test_the_sorare_kickoff_may_differ_by_a_few_hours_from_the_sites(real: list[ffm.Match]) -> None:
    lineups = ff_use.Lineups(feed_of(real), [OYARZABAL], NOW)

    assert lineups.starts("mikel-oyarzabal-ugarte", [game("g1", "2026-10-11T12:15:00Z", "Real Sociedad", "Deportivo")])
    assert not lineups.starts(
        "mikel-oyarzabal-ugarte", [game("g1", "2026-10-18T14:15:00Z", "Real Sociedad", "Deportivo")]
    )


def test_the_report_names_who_was_not_linked_and_why(real: list[ffm.Match]) -> None:
    unknown = row("mystery-man", "Mystery Man", "Real Sociedad")
    lineups = ff_use.Lineups(feed_of(real), [OYARZABAL, unknown], NOW)

    report = lineups.report(["mikel-oyarzabal-ugarte", "mystery-man", "someone-abroad"])

    assert report == {"linked": 1, "unlinked": {"mystery-man": {"why": "nobody of that name", "could": []}}}


# --------------------------------------------------------------------------------------- when it is not used
def test_a_reading_over_a_day_old_is_not_used(real: list[ffm.Match]) -> None:
    lineups = ff_use.Lineups(feed_of(real, read_at=READ - timedelta(hours=25)), [OYARZABAL], NOW)

    assert lineups.starts("mikel-oyarzabal-ugarte", [SOCIEDAD]) == []


def test_a_game_that_has_kicked_off_is_not_used(real: list[ffm.Match]) -> None:
    lineups = ff_use.Lineups(feed_of(real), [OYARZABAL], datetime(2026, 10, 11, 14, 30, tzinfo=UTC))

    assert lineups.starts("mikel-oyarzabal-ugarte", [SOCIEDAD]) == []


def test_a_game_with_no_match_behind_it_is_not_guessed(real: list[ffm.Match]) -> None:
    lineups = ff_use.Lineups(feed_of(real), [OYARZABAL], NOW)

    national = game("g2", "2026-10-11T18:00:00Z", "Spain", "Georgia", "uefa-nations-league")
    friendly = game("g3", "2026-10-11T14:15:00Z", "Real Sociedad", "Some Friendly XI", "club-friendlies")
    assert lineups.starts("mikel-oyarzabal-ugarte", [national, friendly]) == []


def test_a_player_who_is_not_linked_has_nothing(real: list[ffm.Match]) -> None:
    lineups = ff_use.Lineups(feed_of(real), [OYARZABAL], NOW)

    assert lineups.starts("nobody-i-know", [SOCIEDAD]) == []


def test_a_team_whose_lineup_is_not_published_has_nothing_for_its_players() -> None:
    empty = dataclasses.replace(
        side("Real Sociedad", "16", alternatives=(player("2675", "Mikel Oyarzabal", age=29),)), xi=()
    )
    match_ = match(
        empty, side("Deportivo", "6", xi=(player("1", "Some Keeper"),)), datetime(2026, 10, 11, 14, 15, tzinfo=UTC), 7
    )

    lineups = ff_use.Lineups(feed_of([match_]), [OYARZABAL], NOW)

    assert lineups.starts("mikel-oyarzabal-ugarte", [SOCIEDAD]) == []


def test_a_player_the_page_does_not_list_has_nothing() -> None:
    other = side("Real Sociedad", "16", xi=(player("1", "Álex Remiro", keeper=True),))
    match_ = match(
        other, side("Deportivo", "6", xi=(player("2", "Some Keeper"),)), datetime(2026, 10, 11, 14, 15, tzinfo=UTC), 7
    )

    assert ff_use.Lineups(feed_of([match_]), [OYARZABAL], NOW).starts("mikel-oyarzabal-ugarte", [SOCIEDAD]) == []


# ------------------------------------------------------------------------------------------------- out, and two games
def test_a_player_the_page_has_out_has_no_chance_to_start_or_to_come_on() -> None:
    injured = dataclasses.replace(player("2675", "Mikel Oyarzabal", age=29), lesion=0, chance=0.05)
    home = side(
        "Real Sociedad",
        "16",
        xi=(injured,),
        absences=(dataclasses.replace(absence("Mikel Oyarzabal", "mikel-oyarzabal", "out"), cause="Rotura de fibras"),),
    )
    match_ = match(
        home, side("Deportivo", "6", xi=(player("2", "Some Keeper"),)), datetime(2026, 10, 11, 14, 15, tzinfo=UTC), 7
    )

    told = ff_use.Lineups(feed_of([match_]), [OYARZABAL], NOW).starts("mikel-oyarzabal-ugarte", [SOCIEDAD])

    assert told[0].out and told[0].p_start == 0.0
    assert told[0].info["ffStatus"] == {"kind": "out", "cause": "Rotura de fibras"}


def test_a_suspension_is_out_too_and_a_knock_he_plays_despite_is_not() -> None:
    def status(**changes: Any) -> dict[str, Any] | None:
        person = Person("1", "X", "1", "x", 27, None, dataclasses.replace(player("1", "X"), **changes), None)
        return ff_use.status(person)

    assert status(suspended=True) == {"kind": "suspended"}
    assert status(lesion=2) == {"kind": "available"} and status(lesion=1) == {"kind": "doubt"}
    assert status(lesion=-1) is None and status(lesion=-1, yellows=4) == {"yellows": 4}


def test_of_two_games_in_the_week_each_has_its_own_number_or_none(real: list[ffm.Match]) -> None:
    lineups = ff_use.Lineups(feed_of(real), [OYARZABAL], NOW)
    europe = game("g5", "2026-10-15T17:45:00Z", "Real Sociedad", "Some Europa Club", "uefa-europa-league")

    told = lineups.starts("mikel-oyarzabal-ugarte", [SOCIEDAD, europe])

    assert [start.game for start in told] == ["g1"], (
        "FF has not published the Europa League game: it is left to fall back"
    )


def test_when_a_lineup_last_changed_travels_with_the_number(real: list[ffm.Match]) -> None:
    changed = datetime(2026, 10, 9, 18, tzinfo=UTC)
    told = ff_use.Lineups(feed_of(real, changed={"16": changed}), [OYARZABAL], NOW).starts(
        "mikel-oyarzabal-ugarte", [SOCIEDAD]
    )

    assert told[0].info["ffChanged"] == changed.isoformat()


def test_the_run_names_a_clubs_game_the_site_has_no_match_for_and_leaves_out_the_rest(real: list[ffm.Match]) -> None:
    lineups = ff_use.Lineups(feed_of(real), [OYARZABAL], NOW)
    games = [
        SOCIEDAD,  # on the pages
        game("g2", "2026-10-15T17:45:00Z", "Real Sociedad", "Some Europa Club", "uefa-europa-league"),  # not published
        game("g3", "2026-10-17T14:15:00Z", "Real Madrid", "Barcelona"),  # round 9 is not on the pages yet
        game("g4", "2026-10-11T18:00:00Z", "Spain", "Georgia", "uefa-nations-league"),  # no LaLiga club
        game("g5", "2026-10-11T18:00:00Z", "Girona", "Albacete", "segunda-division-es"),  # not in the league's twenty
        game("g6", "2026-10-09T18:00:00Z", "Real Sociedad", "Elche"),  # before NOW: already kicked off, not reported
    ]

    assert lineups.missing(games) == ["Real Madrid - Barcelona 17 Oct", "Real Sociedad - Some Europa Club 15 Oct"]
