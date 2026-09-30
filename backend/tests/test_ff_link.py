"""Linking Futbol Fantasy's players, clubs and matches to Sorare's (plans/futbolfantasy.md, S2).

The squads in `fixtures/futbolfantasy/matches_round_8.json` are real: the ten LaLiga round-8 match pages of 30 Sep 2026
(every club of the league), reduced to who each page lists. `REAL_CARDS` is the owner's collection of that day as Sorare
spells it, with the Futbol Fantasy id each player has on those pages; it is the regression set for the names.
"""

from __future__ import annotations

import json
from datetime import UTC, date, datetime, timedelta
from pathlib import Path
from typing import Any

import pytest
from sqlalchemy.orm import Session

from app.models import ReadModel
from app.services import team_registry
from app.sorare import ff_link as link
from app.sources import futbolfantasy_matches as ffm
from tests.test_pipeline import db  # noqa: F401  (fixture)

FIXTURES = Path(__file__).parent / "fixtures" / "futbolfantasy"
ON = date(2026, 9, 30)
POSITION = {"GK": "Goalkeeper", "DEF": "Defender", "MID": "Midfielder", "FWD": "Forward"}

# (Sorare player slug, the name Sorare shows, its club, position, the id on the Futbol Fantasy pages; None where the
# club plays no match the pages cover: Girona, Granada, Chelsea, Stuttgart...).
REAL_CARDS = [
    ("abderrahman-rebbach", "A. Rebbach", "Deportivo Alavés", "FWD", "10476"),
    ("abdul-mumin", "Abdul Mumin", "Girona", "DEF", None),
    ("adrian-de-la-fuente", "Dela", "Levante", "DEF", "6346"),
    ("aissa-mandi", "Aïssa Mandi", "Levante", "DEF", "1566"),
    ("aleix-febas-perez", "Febas", "Celta de Vigo", "MID", "6885"),
    ("alejandro-catena-marugan", "Catena", "Osasuna", "DEF", "6493"),
    ("alejandro-grimaldo-garcia", "Alejandro Grimaldo", "Atlético Madrid", "DEF", "2771"),
    ("altay-bayindir", "Altay Bayındır", "Celta de Vigo", "GK", "9012"),
    ("alvaro-garcia-rivera", "Álvaro García", "Rayo Vallecano", "FWD", "867"),
    ("alvaro-nunez-cobo", "A.Nuñez", "Celta de Vigo", "DEF", "11767"),
    ("ander-guevara-lajo", "Guevara", "Deportivo Alavés", "MID", "3802"),
    ("andoni-gorosabel-espinosa", "Gorosabel", "Espanyol", "DEF", "3799"),
    ("andrei-florin-ratiu", "Andrei Rațiu", "Rayo Vallecano", "DEF", "6560"),
    ("antonio-martinez-lopez", "Toni Martínez", "Deportivo Alavés", "FWD", "5032"),
    ("arda-guler", "Arda Güler", "Real Madrid", "MID", "11439"),
    ("benat-gerenabarrena-zendoia", "Beñat Gerenabarrena", "Athletic Club", "MID", "10213"),
    ("borja-iglesias-quintas", "Borja Iglesias", "Celta de Vigo", "FWD", "1945"),
    ("carl-starfelt", "Carl Starfelt", "Celta de Vigo", "DEF", "9612"),
    ("carlos-martin-dominguez", "Carlos Martín", "Hajduk Split", "FWD", None),
    ("carlos-romero-serrano", "Carlos Romero", "Villarreal", "DEF", "11172"),
    ("couhaib-driouech", "Couhaib Driouech", "Celta de Vigo", "FWD", "14199"),
    ("david-lopez-silva", "David López", "Girona", "DEF", None),
    ("david-soria-solis", "David Soria", "Getafe", "GK", "1919"),
    ("diego-javier-llorente-rios", "Diego Llorente", "Real Betis", "DEF", "707"),
    ("ferran-jutlga-blanc", "Ferran Jutglà", "Celta de Vigo", "FWD", "7842"),
    ("florian-lejeune", "Florian Lejeune", "Rayo Vallecano", "DEF", "863"),
    ("francisco-roman-alarcon-suarez", "Isco", "Real Betis", "MID", "336"),
    ("fraser-forster", "Fraser Forster", "AFC Bournemouth", "GK", None),
    ("gerard-gumbau-garriga", "Gumbau", "Granada", "MID", None),
    ("gerard-moreno-balaguero", "Gerard Moreno", "Villarreal", "FWD", "843"),
    ("german-valera-karabinaite", "Germán Valera", "Elche", "FWD", "7658"),
    ("guido-rodriguez", "Guido Rodríguez", "Valencia", "MID", "7676"),
    ("heorhii-tsitaishvili", "Giorgi Tsitaishvili", "Rayo Vallecano", "FWD", "8337"),
    ("hugo-gonzalez-sotos", "Hugo González", "Celta de Vigo", "FWD", "9744"),
    ("hugo-rincon-lumbreras", "Hugo Rincón", "Athletic Club", "DEF", "11677"),
    ("hugo-sotelo", "Hugo Sotelo", "Levante", "MID", "8988"),
    ("iago-aspas-juncal", "Iago Aspas", "Celta de Vigo", "FWD", "175"),
    ("igor-zubeldia-elorza", "Zubeldia", "Real Sociedad", "DEF", "2802"),
    ("ilias-akhomach-chakkour", "Ilias Akhomach", "Villarreal", "FWD", "9763"),
    ("inaki-williams-arthuer", "Williams", "Athletic Club", "FWD", "1934"),
    ("inigo-ruiz-de-galarreta-etxeberria", "Ruiz de Galarreta", "Athletic Club", "MID", "44"),
    ("inigo-vicente-elorduy", "Iñigo Vicente", "Racing Santander", "FWD", "6442"),
    ("ionu-andrei-radu", "Ionuț Radu", "Celta de Vigo", "GK", "5978"),
    ("isaac-palazon-camacho", "Isi Palazón", "Rayo Vallecano", "MID", "6957"),
    ("jan-oblak", "Jan Oblak", "Atlético Madrid", "GK", "1826"),
    ("javier-galan-gil", "Javier Galán", "Celta de Vigo", "DEF", "6487"),
    ("johan-andres-mojica-palacio", "J. Mojica", "Getafe", "DEF", "899"),
    ("jon-ander-olasagasti-imizcoz", "Olasagasti", "Levante", "MID", "8961"),
    ("jorge-de-frutos-sebastian", "De Frutos", "Rayo Vallecano", "FWD", "6633"),
    ("jorge-resurreccion-merodio", "Koke", "Atlético Madrid", "MID", "63"),
    ("jose-luis-garcia-vaya", "Pepelu", "Valencia", "MID", "2715"),
    ("jose-luis-gaya-pena", "Gayà", "Valencia", "DEF", "663"),
    ("jose-salinas-moran", "José Salinas", "Málaga", "DEF", "8250"),
    ("josep-maria-chavarria-perez", "Pep Chavarría", "Chelsea", "DEF", None),
    ("juan-berrocal-gonzalez", "Juan Berrocal", "Málaga", "DEF", "5671"),
    ("juan-marcos-foyth", "Juan Foyth", "Villarreal", "DEF", "4705"),
    ("julen-agirrezabala-astulez", "Julen Agirrezabala", "Racing Santander", "GK", "9213"),
    ("justin-de-haas", "Justin de Haas", "Valencia", "DEF", "18018"),
    ("luis-alfonso-espino-garcia", "Alfonso Espino", "Racing Club", "DEF", None),
    ("luiz-lucio-reis-junior", "Luíz Júnior", "Villarreal", "GK", "14125"),
    ("marc-bartra-aregall", "Marc Bartra", "Real Betis", "DEF", "322"),
    ("marcos-alonso-mendoza", "Marcos Alonso", "Celta de Vigo", "DEF", "4397"),
    ("mathew-ryan", "Mathew Ryan", "Levante", "GK", "1743"),
    ("matias-ezequiel-dituro", "Matías Dituro", "Elche", "GK", "9161"),
    ("maximilian-mittelstadt", "Maximilian Mittelstädt", "Stuttgart", "DEF", None),
    ("miguel-roman-gonzalez", "Miguel Román", "Celta de Vigo", "MID", "13808"),
    ("mikel-oyarzabal-ugarte", "Oyarzabal", "Real Sociedad", "FWD", "2675"),
    ("moriba-kourouma-kourouma", "Ilaix Moriba", "Celta de Vigo", "MID", "8082"),
    ("nacho-perez-gomez", "Nacho Pérez", "Levante", "DEF", "16020"),
    ("nahuel-tenaglia", "Nahuel Tenaglia", "Deportivo Alavés", "DEF", "9909"),
    ("nathan-saliba", "Nathan Saliba", "Villarreal", "MID", "17695"),
    ("oscar-mingueza-garcia", "Óscar Mingueza", "Crystal Palace", "DEF", None),
    ("pau-navarro-badenes", "Pau Navarro", "Villarreal", "DEF", "12860"),
    ("peio-canales-urtasun", "Peio Canales", "Athletic Club", "MID", "14017"),
    ("pelayo-fernandez-balboa", "Pelayo Fernández", "Rayo Vallecano", "DEF", "13801"),
    ("ramon-terrats-espacio", "Ramon Terrats", "Getafe", "MID", "8944"),
    ("rodrigo-riquelme-reche", "Rodrigo Riquelme", "Real Betis", "MID", "6450"),
    ("sheraldo-becker", "Sheraldo Becker", "Mainz 05", "FWD", None),
    ("takefusa-kubo", "Take", "Real Sociedad", "FWD", "7091"),
    ("thibaut-courtois", "Thibaut Courtois", "Real Madrid", "GK", "59"),
    ("unai-lopez-cabrera", "Unai López", "Rayo Vallecano", "MID", "1881"),
    ("victor-chust-garcia", "Víctor Chust", "Elche", "DEF", "8273"),
    ("yan-diomande", "Yan Diomande", "Real Madrid", "FWD", "15342"),
    ("yuri-berchiche-izeta", "Yuri", "Athletic Club", "DEF", "735"),
]
NEEDS_AGE = {"heorhii-tsitaishvili"}  # "Heorhii" and "Georgiy": only the surname and the age say it is the same man


@pytest.fixture(scope="module")
def matches() -> list[ffm.Match]:
    return [ffm.match_from_dict(item) for item in json.loads((FIXTURES / "matches_round_8.json").read_text("utf-8"))]


@pytest.fixture(scope="module")
def ages(matches: list[ffm.Match]) -> dict[str, int | None]:
    return {
        person.ff_id: person.age
        for match in matches
        for side in (match.home, match.away)
        for person in link.people(side)
        if person.ff_id
    }


def real_card(row: tuple[str, str, str, str, str | None], age: int | None = None) -> link.Wanted:
    slug, display, club, position, _ = row
    born = f"{ON.year - age}-01-01" if age is not None else None
    return card(slug, display, club, POSITION[position], born)


# ------------------------------------------------------------------------------------------------------ small builders
def card(slug: str, display: str, club: str, position: str = "Midfielder", born: str | None = None) -> link.Wanted:
    found = link.wanted(
        {
            "player": {
                "slug": slug,
                "displayName": display,
                "position": position,
                "birthDay": born,
                "activeClub": {"name": club, "shortName": club},
            }
        }
    )
    assert found is not None
    return found


def player(ff_id: str, name: str, slug: str | None = None, age: int | None = 27, keeper: bool = False) -> ffm.Player:
    return ffm.Player(
        ff_id=ff_id,
        name=name,
        slug=slug or name.lower().replace(" ", "-"),
        chance=0.5,
        lesion=-1,
        international=False,
        suspended=False,
        yellows=None,
        reds=None,
        nationality=None,
        age=age,
        x=50.0,
        y=50.0,
        goalkeeper=keeper,
    )


def absence(name: str, slug: str, kind: str = "out") -> ffm.Absence:
    return ffm.Absence(kind=kind, name=name, slug=slug, cause="Molestias", since=None, note=None)


def side(
    name: str,
    club_id: str | None = None,
    xi: tuple[ffm.Player, ...] = (),
    alternatives: tuple[ffm.Player, ...] = (),
    absences: tuple[ffm.Absence, ...] = (),
) -> ffm.Side:
    return ffm.Side(
        name=name,
        slug=None,
        club_id=club_id,
        coach=None,
        rotations=None,
        predictability=None,
        season_predictability=None,
        xi=xi,
        alternatives=alternatives,
        absences=absences,
    )


def match(home: ffm.Side, away: ffm.Side, kickoff: datetime | None, match_id: int = 1) -> ffm.Match:
    return ffm.Match(
        match_id=match_id,
        url=f"https://www.futbolfantasy.com/partidos/{match_id}",
        competition="laliga",
        competition_name="LaLiga",
        round_label="Jornada 8",
        round_no=8,
        kickoff=kickoff,
        score=None,
        home=home,
        away=away,
    )


# ------------------------------------------------------------------------------------------------ the real collection
def test_the_owners_real_cards_link_to_the_real_squads_by_name_alone(matches: list[ffm.Match]) -> None:
    """No age is known, so the name steps carry everything but the one man who is only told by his surname and age."""
    cards = [real_card(row) for row in REAL_CARDS]
    found = link.link_cards(cards, matches, ON)

    for slug, _, club, _, expected in REAL_CARDS:
        if expected is None:
            assert slug not in found.links and slug not in found.misses, f"{club} plays no match that was read"
        elif slug in NEEDS_AGE:
            assert slug not in found.links and found.misses[slug].reason.startswith("only a surname is in common")
        else:
            assert slug in found.links, f"{slug}: {found.misses.get(slug)}"
            assert found.links[slug].person.ff_id == expected, (slug, found.links[slug])


def test_with_their_ages_every_card_of_a_club_that_was_read_links_to_the_right_person(
    matches: list[ffm.Match], ages: dict[str, int | None]
) -> None:
    cards = [real_card(row, ages.get(row[4] or "")) for row in REAL_CARDS]
    found = link.link_cards(cards, matches, ON)

    wrong = {
        slug: found.links[slug].person.ff_id
        for slug, _, _, _, expected in REAL_CARDS
        if slug in found.links and found.links[slug].person.ff_id != expected
    }
    assert not wrong
    assert not found.misses
    assert found.links["heorhii-tsitaishvili"].how == "surname"
    assert len(found.links) == sum(1 for row in REAL_CARDS if row[4] is not None)


def test_how_a_real_name_was_told_is_the_weakest_step_that_was_needed(matches: list[ffm.Match]) -> None:
    by_slug = {row[0]: row for row in REAL_CARDS}
    found = link.link_cards([real_card(by_slug[slug]) for slug in by_slug], matches, ON)

    assert found.links["takefusa-kubo"].how == "name"  # Sorare shows "Take", but its slug is his name
    assert (
        found.links["francisco-roman-alarcon-suarez"].how == "part"
    )  # "Isco" + the slug: Futbol Fantasy's "Isco Alarcón"
    assert found.links["inaki-williams-arthuer"].how == "part"  # not his brother Nico
    assert found.links["javier-galan-gil"].how == "first"  # "Javi Galán"
    assert found.links["mathew-ryan"].how == "name" and found.links["mathew-ryan"].person.name == "Mathew Ryan"
    assert found.links["alejandro-grimaldo-garcia"].how == "first"  # "Álex" is short for Alejandro


def test_an_age_that_is_not_his_is_not_linked_even_when_the_name_is_exactly_his(matches: list[ffm.Match]) -> None:
    row = next(row for row in REAL_CARDS if row[0] == "iago-aspas-juncal")
    found = link.link_cards([real_card(row, age=20)], matches, ON)  # Futbol Fantasy's Iago Aspas is 39

    assert not found.links
    assert found.misses["iago-aspas-juncal"].reason == "a name like his is there, but not his age or position"


def test_a_joined_injury_list_keeps_the_person_and_the_chance(matches: list[ffm.Match]) -> None:
    atletico = next(s for m in matches for s in (m.home, m.away) if s.club_id == "2")
    grimaldo = next(person for person in link.people(atletico) if person.name == "Álex Grimaldo")

    assert grimaldo.absence is not None and grimaldo.absence.kind == "doubt"
    assert grimaldo.player is not None and grimaldo.player.chance == 0.5 and grimaldo.ff_id == "2771"
    assert len({person.key for person in link.people(atletico)}) == len(link.people(atletico))


# ------------------------------------------------------------------------------------------------------ the two sides
def test_a_card_row_becomes_every_way_its_name_is_written() -> None:
    found = card("carlos-martin-dominguez-2", "Carlos Martín", "Hajduk Split", "Forward", "1998-03-26")

    assert found.words == {"carlos", "martin", "dominguez"}  # the "-2" of a second Carlos Martín is not a name
    assert found.full_key == "carlos martin dominguez" and found.display_key == "carlos martin"
    assert found.born == date(1998, 3, 26) and found.position == "FWD"
    assert link.age_on(found.born, date(2026, 3, 25)) == 27 and link.age_on(found.born, date(2026, 3, 26)) == 28
    assert link.wanted({"player": {}}) is None
    assert link.wanted({"player": {"slug": "x", "birthDay": "not a date"}}).born is None  # type: ignore[union-attr]


def test_people_lists_the_eleven_then_the_bench_and_joins_the_injury_lists_by_profile_address() -> None:
    both = side(
        "Celta",
        "5",
        xi=(player("1", "Iago Aspas"), player("2", "Ionut Radu", slug="andrei-radu", keeper=True)),
        alternatives=(player("3", "Javi Galán", slug="javi-galan"), player("4", "Reserve", keeper=False)),
        absences=(
            absence("Javi Galán", "javi-galan", "doubt"),
            absence("Mikel Rodriguez", "mikel-rodriguez"),  # nobody lists him but the injury table
            absence("Nobody Slug", None),  # type: ignore[arg-type]
        ),
    )
    everyone = link.people(both)

    assert [p.name for p in everyone] == [
        "Iago Aspas",
        "Ionut Radu",
        "Javi Galán",
        "Reserve",
        "Mikel Rodriguez",
        "Nobody Slug",
    ]
    by_name = {p.name: p for p in everyone}
    assert by_name["Javi Galán"].absence is not None and by_name["Javi Galán"].player is not None
    assert by_name["Mikel Rodriguez"].player is None and by_name["Mikel Rodriguez"].ff_id is None
    assert by_name["Mikel Rodriguez"].key == "slug:mikel-rodriguez" and by_name["Nobody Slug"].key == "name:nobody slug"
    # the page only says who keeps goal for the eleven: a substitute is never declared an outfield player
    assert by_name["Ionut Radu"].keeper is True and by_name["Iago Aspas"].keeper is False
    assert by_name["Javi Galán"].keeper is None and by_name["Reserve"].keeper is None


# ------------------------------------------------------------------------------------------------------------- clubs
@pytest.mark.parametrize(
    ("ours", "club_id", "theirs", "same"),
    [
        (["Real Sociedad"], "16", "Real Sociedad", True),
        (["Celta de Vigo", "Celta"], "5", "Celta", True),
        (["Deportivo Alavés"], "28", "Alavés", True),
        (["Deportivo Alavés"], "6", "Deportivo", False),  # La Coruña is not Alavés, though one name holds the other
        (["Deportivo"], "28", "Alavés", False),
        (["Racing Club"], "42", "Racing", False),  # Argentina's Racing is not Santander's
        (["Racing Santander"], "42", "Racing", True),
        (["Atlético Madrid"], "2", "Atlético", True),
        (["Girona"], None, "Girona", True),  # a club only the cup brings: by name, through the registry
        (["Stuttgart"], "999", "VfB Stuttgart", True),  # neither is a club the registry knows: their words
        (["Mainz 05"], "998", "1. FSV Mainz 05", True),
        (["Real"], "997", "Real Oviedo", False),  # one short word names half of Spain
        (["Sporting CP"], "996", "Sporting Braga", False),
        (["Chelsea"], "15", "Real Madrid", False),  # a foreign name against a club the registry knows
        (["Real Madrid"], "995", "Chelsea", False),
        ([], "15", "Real Madrid", False),
    ],
)
def test_clubs_are_the_same_by_identity_when_the_registry_knows_them_and_by_words_when_not(
    ours: list[str], club_id: str | None, theirs: str, same: bool
) -> None:
    assert link.same_club(ours, side(theirs, club_id)) is same


def test_the_registry_knows_every_clubs_futbol_fantasy_number_and_the_pages_agree_with_it(
    matches: list[ffm.Match],
) -> None:
    numbered = [team for team in team_registry.TEAMS if team.ff_id]
    assert len(numbered) == 20 and len({team.ff_id for team in numbered}) == 20
    assert team_registry.by_ff_id("16").code == "RSO" and team_registry.by_ff_id("6").code == "DEP"  # type: ignore[union-attr]
    assert team_registry.by_ff_id("28").code == "ALA" and team_registry.by_ff_id("42").code == "SAN"  # type: ignore[union-attr]
    assert team_registry.by_ff_id("9999") is None and team_registry.by_ff_id(None) is None
    # every club on the real pages is a club the registry names by that number, and the two agree on which club it is
    sides = [side for match in matches for side in (match.home, match.away)]
    assert {side.club_id for side in sides} == {team.ff_id for team in numbered}
    for side in sides:
        club = team_registry.by_ff_id(side.club_id)
        assert club is not None and link.same_club([club.name], side), (side.name, club)


# ----------------------------------------------------------------------------------------------------------- matches
def fixture_between(home: str, home_id: str, away: str, away_id: str, hours: float = 0) -> ffm.Match:
    return match(
        side(home, home_id), side(away, away_id), datetime(2026, 10, 10, 14, 15, tzinfo=UTC) + timedelta(hours=hours)
    )


def test_a_sorare_game_is_the_match_with_the_same_clubs_on_the_same_day() -> None:
    real = fixture_between("Real Madrid", "15", "Villarreal", "22")
    other = fixture_between("Barcelona", "3", "Getafe", "8")
    kickoff = datetime(2026, 10, 10, 14, 15, tzinfo=UTC)

    found = link.match_of_game("Real Madrid", "Villarreal", kickoff, [other, real])
    assert found is not None and found[0] is real and found[1].name == "Real Madrid"
    away = link.match_of_game("Villarreal", "Real Madrid", kickoff, [other, real])  # the player's own club is the side
    assert away is not None and away[1].name == "Villarreal"
    assert link.match_of_game("Real Madrid", "Getafe", kickoff, [other, real]) is None


def test_a_game_moved_a_day_is_the_same_match_but_the_second_leg_of_a_tie_is_not() -> None:
    first = fixture_between("Real Madrid", "15", "Villarreal", "22")
    kickoff = datetime(2026, 10, 10, 14, 15, tzinfo=UTC)

    assert link.match_of_game("Real Madrid", "Villarreal", kickoff + timedelta(hours=30), [first]) is not None
    assert link.match_of_game("Real Madrid", "Villarreal", kickoff + timedelta(days=7), [first]) is None
    second = fixture_between("Villarreal", "22", "Real Madrid", "15", hours=24 * 7)
    found = link.match_of_game("Real Madrid", "Villarreal", kickoff + timedelta(days=7), [first, second])
    assert found is not None and found[0] is second


def test_a_match_without_a_kickoff_is_never_guessed_to_be_a_game() -> None:
    undated = match(side("Real Madrid", "15"), side("Villarreal", "22"), None)

    assert (
        link.match_of_game("Real Madrid", "Villarreal", datetime(2026, 10, 10, 14, 15, tzinfo=UTC), [undated]) is None
    )


def test_home_and_away_are_not_compared_so_a_neutral_final_can_be_listed_either_way() -> None:
    final = fixture_between("Villarreal", "22", "Real Madrid", "15")

    found = link.match_of_game("Real Madrid", "Villarreal", datetime(2026, 10, 10, 14, 15, tzinfo=UTC), [final])
    assert found is not None and found[1].name == "Real Madrid"


# ----------------------------------------------------------------------------------------------------------- people
def celta() -> ffm.Side:
    return side(
        "Celta",
        "5",
        xi=(player("10", "Iago Aspas", age=39), player("11", "Hugo González", age=23)),
        alternatives=(
            player("12", "Javi Galán", slug="javi-galan", age=31),
            player("13", "Javi Rodríguez", slug="javi-rodriguez", age=30),
            player("14", "Hugo Álvarez", age=24),
        ),
    )


def test_the_same_name_is_enough_whatever_the_accents_and_case() -> None:
    found = link.choose(card("iago-aspas-juncal", "IAGO ASPAS", "Celta de Vigo"), link.people(celta()), ON)

    assert isinstance(found, link.Link) and found.how == "name" and found.person.ff_id == "10"


def test_a_name_inside_the_other_is_enough_when_it_has_two_words() -> None:
    found = link.choose(card("hugo-gonzalez-sotos", "Hugo González", "Celta de Vigo"), link.people(celta()), ON)
    assert isinstance(found, link.Link) and found.person.ff_id == "11"
    # one word of a name is nothing: "Hugo" is two of these players' first name, so a card called Hugo links to neither
    lone = link.choose(card("hugo", "Hugo", "Celta de Vigo"), link.people(celta()), ON)
    assert isinstance(lone, link.Miss)


def test_a_short_first_name_needs_the_same_surname_and_is_unique_to_its_owner() -> None:
    pool = link.people(celta())
    javier = link.choose(card("javier-galan-gil", "Javier Galán", "Celta de Vigo", "Defender"), pool, ON)
    assert isinstance(javier, link.Link) and javier.how == "first" and javier.person.ff_id == "12"
    # a different first name is not "Javi", and with no age to say otherwise the shared surname alone is left unlinked
    other = link.choose(card("carlos-galan", "Carlos Galán", "Celta de Vigo", "Defender"), pool, ON)
    assert isinstance(other, link.Miss) and other.candidates == ("Javi Galán",)
    assert other.reason == "only a surname is in common, and there is no age to say it is him"
    # "Javi" is the short form of Javier, not of Javier's neighbour Rodríguez: the surname decides who
    rodriguez = link.choose(card("javier-rodriguez", "Javier Rodríguez", "Celta de Vigo", "Defender"), pool, ON)
    assert isinstance(rodriguez, link.Link) and rodriguez.person.ff_id == "13"


def test_a_surname_alone_is_trusted_only_with_both_ages_and_only_for_one_person_of_the_squad() -> None:
    pool = [*link.people(celta()), *link.people(side("X", None, xi=(player("20", "Georgiy Tsitaishvili", age=25),)))]
    with_age = link.choose(
        card("heorhii-tsitaishvili", "Giorgi Tsitaishvili", "Celta de Vigo", "Forward", "2000-11-18"), pool, ON
    )
    without_age = link.choose(card("heorhii-tsitaishvili", "Giorgi Tsitaishvili", "Celta de Vigo", "Forward"), pool, ON)

    assert isinstance(with_age, link.Link) and (with_age.how, with_age.person.ff_id) == ("surname", "20")
    assert isinstance(without_age, link.Miss)
    # the same surname twice in a squad and both fit: nobody is picked
    twins = [player("30", "Carlos Soler", age=29), player("31", "Miguel Soler", age=29)]
    both = link.choose(
        card("jose-soler", "José Soler", "Celta de Vigo", born="1997-02-01"),
        link.people(side("Y", None, xi=tuple(twins))),
        ON,
    )
    assert isinstance(both, link.Miss) and both.reason == "more than one of that name"
    assert set(both.candidates) == {"Carlos Soler", "Miguel Soler"}


def test_two_players_of_one_surname_are_told_apart_by_first_name_then_by_age() -> None:
    williams = side(
        "Athletic",
        "1",
        xi=(player("1934", "Iñaki Williams", slug="inaki-williams", age=32), player("8693", "Nico Williams", age=24)),
    )
    pool = link.people(williams)

    inaki = link.choose(card("inaki-williams-arthuer", "Williams", "Athletic Club", "Forward"), pool, ON)
    nico = link.choose(card("nico-williams", "Nico Williams", "Athletic Club", "Forward"), pool, ON)
    assert isinstance(inaki, link.Link) and inaki.person.ff_id == "1934"
    assert isinstance(nico, link.Link) and nico.person.ff_id == "8693"
    # with nothing but the surname the two cannot be told apart by name; the age is what decides, and only with a birthday
    bare = link.choose(card("williams", "Williams", "Athletic Club", "Forward", "2002-07-12"), pool, ON)
    assert isinstance(bare, link.Link) and (bare.how, bare.person.ff_id) == ("surname", "8693")
    none = link.choose(card("williams", "Williams", "Athletic Club", "Forward"), pool, ON)
    assert isinstance(none, link.Miss) and none.reason.startswith("only a surname is in common")
    assert set(none.candidates) == {"Iñaki Williams", "Nico Williams"}


def test_age_is_allowed_a_year_either_way_but_not_two() -> None:
    pool = link.people(side("Celta", "5", xi=(player("10", "Iago Aspas", age=39),)))

    def linked(age: int) -> bool:
        return isinstance(
            link.choose(card("iago-aspas-juncal", "Iago Aspas", "Celta", born=f"{ON.year - age}-01-01"), pool, ON),
            link.Link,
        )

    assert [linked(age) for age in (36, 37, 38, 39, 40, 41, 42)] == [False, False, True, True, True, False, False]


def test_a_keeper_is_never_an_outfield_player_and_the_reverse_but_only_the_eleven_says_so() -> None:
    pool = link.people(
        side(
            "Levante",
            "10",
            xi=(player("1", "Mathew Ryan", keeper=True),),
            alternatives=(player("2", "Mat Ryan Jr", keeper=False),),  # a substitute: the page does not say
        )
    )
    keeper = link.choose(card("mathew-ryan", "Mathew Ryan", "Levante", "Goalkeeper"), pool, ON)
    outfield = link.choose(card("mathew-ryan", "Mathew Ryan", "Levante", "Midfielder"), pool, ON)

    assert isinstance(keeper, link.Link) and keeper.person.ff_id == "1"
    assert (
        isinstance(outfield, link.Miss) and outfield.reason == "a name like his is there, but not his age or position"
    )


def test_nobody_of_that_name_says_so() -> None:
    found = link.choose(card("unknown-player", "Unknown Player", "Celta de Vigo"), link.people(celta()), ON)

    assert found == link.Miss("unknown-player", "nobody of that name")


# ---------------------------------------------------------------------------------------- a side, the cards of a club
def test_only_cards_of_the_sides_club_are_tried_and_a_miss_is_reported_for_those() -> None:
    cards = [
        card("iago-aspas-juncal", "Iago Aspas", "Celta de Vigo"),
        card("mystery", "Mystery Man", "Celta de Vigo"),
        card("jan-oblak", "Jan Oblak", "Atlético Madrid", "Goalkeeper"),  # another club: not this side's business
    ]
    found = link.link_side(celta(), cards, ON)

    assert set(found.links) == {"iago-aspas-juncal"} and set(found.misses) == {"mystery"}


def test_a_hand_checked_link_is_that_person_or_nobody_and_beats_every_name() -> None:
    cards = [card("hugo-gonzalez-sotos", "Hugo González", "Celta de Vigo")]

    by_hand = link.link_side(celta(), cards, ON, overrides={"hugo-gonzalez-sotos": "14"})
    assert (
        by_hand.links["hugo-gonzalez-sotos"].person.name == "Hugo Álvarez"
        and by_hand.links["hugo-gonzalez-sotos"].how == "override"
    )
    elsewhere = link.link_side(celta(), cards, ON, overrides={"hugo-gonzalez-sotos": "999"})  # he is not in this squad
    assert not elsewhere.links and not elsewhere.misses, "an override names a person: nobody else is guessed"


def test_a_link_found_before_outlives_a_respelling_but_not_a_different_man() -> None:
    respelled = side("Celta", "5", xi=(player("12", "Xavi Galán Gil", slug="xavi-galan", age=31),))
    cards = [card("javier-galan-gil", "Javier Galán", "Celta de Vigo", "Defender", "1995-05-01")]
    kept = {"javier-galan-gil": {"ffId": "12", "slug": "javi-galan", "name": "Javi Galán"}}

    by_memory = link.link_side(respelled, cards, ON, kept=kept)
    assert by_memory.links["javier-galan-gil"].how == "kept"
    # the page now has a different person under that number: no word in common, so it is worked out again (and fails)
    stranger = side("Celta", "5", xi=(player("12", "Pedro Martínez", age=31),))
    assert not link.link_side(stranger, cards, ON, kept=kept).links
    # he is 18 on the page but was born in 1995: the same number does not make him the same man
    young = side("Celta", "5", xi=(player("12", "Javi Galán", age=18),))
    assert not link.link_side(young, cards, ON, kept=kept).links


def test_a_kept_link_follows_a_transfer_to_the_other_clubs_squad() -> None:
    other = side("Sevilla", "17", xi=(player("12", "Javi Galán", slug="javi-galan", age=31),))
    cards = [card("javier-galan-gil", "Javier Galán", "Celta de Vigo", "Defender")]

    found = link.link_side(other, cards, ON, kept={"javier-galan-gil": {"ffId": "12", "slug": "javi-galan"}})

    assert found.links["javier-galan-gil"].how == "kept"


def test_two_cards_that_come_out_as_one_person_are_both_dropped_unless_one_was_set_by_hand() -> None:
    # Sorare sometimes holds one man twice: the second profile gets a "-2" on its slug
    duplicate = [
        card("francisco-roman-alarcon-suarez", "Isco", "Real Betis"),
        card("francisco-roman-alarcon-suarez-2", "Isco", "Real Betis"),
    ]
    betis = side("Betis", "4", xi=(player("336", "Isco Alarcón", age=34),))

    both = link.link_side(betis, duplicate, ON)
    assert not both.links and {m.reason for m in both.misses.values()} == {"the same person as another of yours"}
    decided = link.link_side(betis, duplicate, ON, overrides={"francisco-roman-alarcon-suarez-2": "336"})
    assert set(decided.links) == {"francisco-roman-alarcon-suarez-2"}
    assert "francisco-roman-alarcon-suarez" in decided.misses


def test_a_person_is_found_again_on_the_same_clubs_side_of_another_match() -> None:
    here = side("Celta", "5", xi=(player("12", "Javi Galán", slug="javi-galan", age=31),))
    there = side("Celta", "5", alternatives=(player("12", "Javier Galán", slug="javi-galan", age=31),))
    found = link.link_side(here, [card("javier-galan-gil", "Javier Galán", "Celta de Vigo", "Defender")], ON)

    again = link.find_person(there, found.links["javier-galan-gil"])
    assert again is not None and again.name == "Javier Galán"
    assert (
        link.find_person(side("Celta", "5", xi=(player("99", "Somebody Else"),)), found.links["javier-galan-gil"])
        is None
    )
    # a person the injury table alone names has no number, so his profile address is what finds him
    absent_only = link.Link(
        "x", link.people(side("Alavés", "28", absences=(absence("Mikel Rodriguez", "mikel-rodriguez"),)))[0], "name"
    )
    assert (
        link.find_person(
            side("Alavés", "28", alternatives=(player("7", "Mikel Rodriguez", slug="mikel-rodriguez"),)), absent_only
        )
        is not None
    )


def test_a_card_linked_on_two_matches_needs_the_same_person_on_both() -> None:
    card_ = card("javier-galan-gil", "Javier Galán", "Celta de Vigo", "Defender")
    league = match(
        side("Celta", "5", xi=(player("12", "Javi Galán", age=31),)),
        side("Elche", "21"),
        datetime(2026, 10, 11, tzinfo=UTC),
        1,
    )
    cup = match(
        side("Celta", "5", xi=(player("12", "Javi Galán", age=31),)),
        side("Lugo", None),
        datetime(2026, 10, 14, tzinfo=UTC),
        2,
    )
    agreed = link.link_cards([card_], [league, cup], ON)
    assert agreed.links["javier-galan-gil"].person.ff_id == "12" and not agreed.misses

    clash = match(
        side("Celta", "5", xi=(player("77", "Javi Galán", age=31),)),
        side("Lugo", None),
        datetime(2026, 10, 14, tzinfo=UTC),
        3,
    )
    disagreed = link.link_cards([card_], [league, clash], ON)
    assert not disagreed.links and disagreed.misses["javier-galan-gil"].reason == "a different person on each side"


def test_a_card_found_on_one_side_is_not_also_reported_missing_from_another() -> None:
    card_ = card("hugo-gonzalez-sotos", "Hugo González", "Celta de Vigo")
    without = match(
        side("Celta", "5", xi=(player("1", "Iago Aspas"),)), side("Elche", "21"), datetime(2026, 10, 11, tzinfo=UTC), 1
    )
    with_him = match(
        side("Celta", "5", xi=(player("11", "Hugo González"),)),
        side("Lugo", None),
        datetime(2026, 10, 14, tzinfo=UTC),
        2,
    )

    found = link.link_cards([card_], [without, with_him], ON)

    assert "hugo-gonzalez-sotos" in found.links and not found.misses


# ---------------------------------------------------------------------------------------------------------- memory
def stored(session: Session) -> dict[str, Any]:
    row = session.get(ReadModel, link.KEPT_KEY)
    return dict(row.payload) if row else {}


def a_link(how: str = "name", ff_id: str | None = "12", slug: str | None = "javi-galan") -> link.Link:
    person = link.Person(
        key=ff_id or f"slug:{slug}",
        name="Javi Galán",
        ff_id=ff_id,
        slug=slug,
        age=31,
        keeper=None,
        player=None,
        absence=None,
    )
    return link.Link("javier-galan-gil", person, how)


def test_the_links_found_are_remembered_and_only_rewritten_when_they_change(db: Session) -> None:  # noqa: F811
    now = datetime(2026, 9, 30, 12, tzinfo=UTC)

    assert link.load_kept(db) == {}
    assert link.save_kept(db, {"javier-galan-gil": a_link()}, now) == 1
    assert link.load_kept(db)["javier-galan-gil"]["ffId"] == "12"
    assert (
        link.save_kept(db, {"javier-galan-gil": a_link()}, now + timedelta(hours=6)) == 0
    )  # the same man: nothing written
    assert link.load_kept(db)["javier-galan-gil"]["at"] == now.isoformat()
    assert link.save_kept(db, {"javier-galan-gil": a_link(ff_id="13")}, now + timedelta(hours=7)) == 1
    assert link.load_kept(db)["javier-galan-gil"]["ffId"] == "13"


def test_a_link_set_by_hand_is_not_copied_into_the_memory_and_a_damaged_memory_reads_as_empty(db: Session) -> None:  # noqa: F811
    now = datetime(2026, 9, 30, 12, tzinfo=UTC)

    assert link.save_kept(db, {"javier-galan-gil": a_link("override")}, now) == 0
    assert stored(db) == {}
    db.add(ReadModel(key=link.KEPT_KEY, payload={"links": ["not", "a", "dict"]}, updated_at=now))
    db.commit()
    assert link.load_kept(db) == {}


def test_a_person_with_only_a_profile_address_is_remembered_by_it(db: Session) -> None:  # noqa: F811
    now = datetime(2026, 9, 30, 12, tzinfo=UTC)

    assert link.save_kept(db, {"javier-galan-gil": a_link(ff_id=None)}, now) == 1
    assert link.load_kept(db)["javier-galan-gil"] == {
        "ffId": None,
        "slug": "javi-galan",
        "name": "Javi Galán",
        "how": "name",
        "at": now.isoformat(),
    }
