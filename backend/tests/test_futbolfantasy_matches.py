"""Futbol Fantasy read match by match: what a round page, a match page and a team page give, and how it is read politely.

The fixtures under `tests/fixtures/futbolfantasy/` are the real pages of 30 Sep 2026, pruned to what the parser reads
(`Real Sociedad - Deportivo`, LaLiga round 8, before the round; `Liverpool - Atlético`, played; two round pages; the next
matches of Real Sociedad's team page). A test here that fails after a fixture is refreshed says the site's markup moved.
"""

from __future__ import annotations

from datetime import UTC, date, datetime
from pathlib import Path

import httpx
import pytest

from app.sources import futbolfantasy_matches as ffm

FIXTURES = Path(__file__).parent / "fixtures" / "futbolfantasy"
MATCH_URL = "https://www.futbolfantasy.com/partidos/22502-real-sociedad-deportivo"


def page(name: str) -> str:
    return (FIXTURES / name).read_text(encoding="utf-8")


@pytest.fixture(scope="module")
def match() -> ffm.Match:
    parsed = ffm.parse_match(page("match_real_sociedad_deportivo.html"), MATCH_URL)
    assert parsed is not None
    return parsed


# ------------------------------------------------------------------------------------------------------ round pages
def test_a_round_page_lists_the_matches_with_their_kickoff_in_utc() -> None:
    round_ = ffm.parse_round(page("round_laliga_8.html"))

    assert round_ is not None
    assert (round_.competition, round_.competition_name, round_.number, round_.label) == (
        "laliga",
        "LaLiga",
        8,
        "Jornada 8",
    )
    assert len(round_.matches) == 10
    first, sociedad = round_.matches[0], round_.matches[5]
    assert (first.home, first.away, first.home_id, first.away_id) == ("Málaga", "Espanyol", "11", "7")
    assert first.kickoff == datetime(2026, 10, 9, 19, 0, tzinfo=UTC), "21:00 in Madrid, which was UTC+2 that day"
    assert first.match_id == 22497 and first.score is None
    assert (sociedad.home, sociedad.away, sociedad.match_id) == ("Real Sociedad", "Deportivo", 22502)
    assert sociedad.url == MATCH_URL


def test_a_played_round_page_carries_the_scores_and_a_european_one_is_named_so() -> None:
    round_ = ffm.parse_round(page("round_champions_1.html"))

    assert round_ is not None and (round_.competition, round_.number) == ("champions", 1)
    brujas = round_.matches[0]
    assert (brujas.home, brujas.away, brujas.score) == ("Brujas", "Aston Villa", (2, 3))
    assert brujas.home_id == "536", "a club's id is the same in every competition: Real Sociedad is 16 in both"


def test_the_clock_is_madrids_so_a_winter_kickoff_is_an_hour_earlier_in_utc() -> None:
    assert ffm._stamp("2026-12-13 21:00:00") == datetime(2026, 12, 13, 20, 0, tzinfo=UTC)
    assert ffm._stamp("2026-10-11 16:15:00") == datetime(2026, 10, 11, 14, 15, tzinfo=UTC)
    assert ffm._stamp("not a date") is None
    assert ffm._when("Domingo, 11 de octubre del 2026 a las 16:15h") == datetime(2026, 10, 11, 14, 15, tzinfo=UTC)
    assert ffm._when("Martes, 1 de diciembre de 2026 a las 18:45h") == datetime(2026, 12, 1, 17, 45, tzinfo=UTC)


@pytest.mark.parametrize("html", ["", "<html><body>hello</body></html>", "<title>Noticias - FutbolFantasy</title>"])
def test_a_page_that_is_not_a_lineup_page_gives_nothing(html: str) -> None:
    assert ffm.parse_round(html) is None
    assert ffm.parse_match(html, MATCH_URL) is None


# ------------------------------------------------------------------------------------------------------ match pages
def test_a_match_page_gives_its_header(match: ffm.Match) -> None:
    assert (match.match_id, match.competition, match.round_label, match.round_no) == (22502, "laliga", "Jornada 8", 8)
    assert match.kickoff == datetime(2026, 10, 11, 14, 15, tzinfo=UTC) and not match.played
    assert (match.home.name, match.home.slug, match.home.club_id) == ("Real Sociedad", "real-sociedad", "16")
    assert (match.away.name, match.away.slug, match.away.club_id) == ("Deportivo", "deportivo", "6")


def test_both_elevens_come_with_each_players_chance_and_place_on_the_pitch(match: ffm.Match) -> None:
    home = {p.name: p for p in match.home.xi}

    assert len(match.home.xi) == len(match.away.xi) == 11
    oyarzabal = home["Mikel Oyarzabal"]
    assert (oyarzabal.chance, oyarzabal.x, oyarzabal.y, oyarzabal.ff_id, oyarzabal.slug) == (
        0.9,
        50.0,
        18.0,
        "2675",
        "mikel-oyarzabal",
    )
    assert oyarzabal.international is True and oyarzabal.nationality == "ES" and oyarzabal.news is True
    assert (home["Álex Remiro"].y, home["Álex Remiro"].goalkeeper) == (87.0, True), "the goalkeeper is drawn last"
    assert sum(p.goalkeeper for p in match.home.xi) == sum(p.goalkeeper for p in match.away.xi) == 1, (
        "a goalkeeper's shirt carries `portero`, not `campo`: finding players by that class loses two of the 22"
    )
    assert all(p.chance is not None and 0 <= p.chance <= 1 for p in match.home.xi + match.away.xi)


def test_a_player_carries_the_age_the_page_shows_which_tells_two_of_a_surname_apart(match: ffm.Match) -> None:
    home = {p.name: p for p in match.home.xi + match.home.alternatives}

    assert (home["Mikel Oyarzabal"].age, home["Takefusa Kubo"].age) == (29, 25)
    assert all(
        p.age is not None for p in match.home.xi + match.home.alternatives + match.away.xi + match.away.alternatives
    )


def test_a_name_keeps_its_accents_when_the_site_does_and_falls_back_to_the_profile_address(match: ffm.Match) -> None:
    names = {p.name for p in match.home.xi}
    assert {"Gonçalo Guedes", "Álex Remiro", "Jon Martín"} <= names
    assert "Luka Sucic" in names, "named by his news pop-up, the page has no photo label for him"

    html = (
        '<header class="encabezado-partido"><div class="fecha"><strong>LaLiga 2026/27 - Jornada 1</strong></div>'
        '<div class="fecha">Sábado, 15 de agosto del 2026 a las 18:00h</div>'
        '<div class="equipo local"><a href="/laliga/equipos/a"><div class="nombre">A</div><img src="escudom/1.png"></a></div>'
        '<div class="equipo visitante"><a href="/laliga/equipos/b"><div class="nombre">B</div><img src="escudom/2.png"></a></div>'
        '</header><div class="local"><div class="jugador_7 campo camiseta-wrapper" data-onceff="titular" data-onceff-x="50%"'
        ' data-onceff-y="18%"><a class="camiseta" data-probabilidad="60%" data-lesion="-1"'
        ' href="https://www.futbolfantasy.com/jugadores/pepe-del-rio/laliga-26-27"></a></div></div>'
    )
    parsed = ffm.parse_match(html, "https://www.futbolfantasy.com/partidos/1-a-b")
    assert parsed is not None and parsed.home.xi[0].name == "Pepe Del Rio" and parsed.home.xi[0].chance == 0.6


def test_the_alternatives_come_in_order_of_likelihood_and_have_no_place_on_the_pitch(match: ffm.Match) -> None:
    home = match.home.alternatives

    assert len(home) == 15 and len(match.away.alternatives) == 17
    chances = [p.chance for p in home]
    assert chances == sorted(chances, reverse=True), "the page lists them most likely first"
    assert (home[0].name, home[0].chance) == ("Ander Barrenetxea", 0.5)
    assert all(p.x is None and p.y is None for p in home + match.away.alternatives), "they sit on a grid, not the pitch"
    assert next(p for p in home if p.name == "Takefusa Kubo").chance == 0.4


def test_the_injury_code_on_a_shirt_matches_the_injury_list(match: ffm.Match) -> None:
    by_name = {p.name: p for p in match.home.xi + match.away.xi}
    assert by_name["Igor Zubeldia"].lesion == ffm.DOUBT
    assert by_name["Lorenzo Amatucci"].lesion == ffm.AVAILABLE
    assert by_name["Mikel Oyarzabal"].lesion == -1

    injuries = {a.name: a for a in match.home.absences + match.away.absences}
    assert injuries["Álvaro Odriozola"].kind == "out" and injuries["Álvaro Odriozola"].note == "Baja hasta octubre"
    assert (
        injuries["Igor Zubeldia"].kind == "doubt"
        and injuries["Igor Zubeldia"].cause == "Molestias en los isquiotibiales"
    )
    assert injuries["Igor Zubeldia"].since == "Desde 12/09 (18 días)"
    assert injuries["Lorenzo Amatucci"].kind == "available"
    assert injuries["Marc Casadó"].kind == "out" and injuries["Zakaria Eddahchouri"].kind == "doubt"


def test_a_ban_is_a_suspension_with_its_reason_and_belongs_to_its_own_team(match: ffm.Match) -> None:
    banned = [a for a in match.home.absences if a.kind == "suspended"]
    assert [(a.name, a.cause) for a in banned] == [("Orri Steinn Óskarsson", "Doble amarilla")]
    assert not [a for a in match.away.absences if a.kind == "suspended"], "Deportivo has no one suspended"
    assert len(match.home.absences) == 3 and len(match.away.absences) == 5


def test_the_coach_gauges_are_read_as_levels_and_a_share(match: ffm.Match) -> None:
    assert match.home.coach == "Pellegrino Matarazzo" and match.away.coach == "Antonio Hidalgo"
    assert match.home.rotations == ffm.Level(1, "Sin rotaciones")
    assert match.home.predictability == ffm.Level(3, "Poco previsible")
    assert match.home.season_predictability == pytest.approx(0.83), (
        "how predictable his lineups have been, not how often Futbol Fantasy is right"
    )


def test_the_match_squad_is_not_published_until_the_club_names_it(match: ffm.Match) -> None:
    assert match.home.squad_published is False and match.away.squad_published is False


def test_a_played_match_carries_its_score_and_its_cards() -> None:
    played = ffm.parse_match(
        page("match_played_champions.html"), "https://www.futbolfantasy.com/partidos/24118-liverpool-atletico"
    )

    assert played is not None and played.played and played.score == (2, 1)
    assert (played.competition, played.round_label, played.home.name, played.away.name) == (
        "champions",
        "Jornada 1",
        "Liverpool",
        "Atlético",
    )
    assert played.kickoff == datetime(2026, 9, 9, 19, 0, tzinfo=UTC)
    assert sum(p.goalkeeper for p in played.home.xi) == 1 and len(played.home.xi) == 11


def test_a_chance_that_is_not_a_percentage_is_no_chance() -> None:
    assert [ffm._chance(v) for v in ("80%", "5%", "100%", " 95 % ")] == [0.8, 0.05, 1.0, 0.95]
    assert [ffm._chance(v) for v in (None, "", "soon", "250%", "-5%", "80.5%")] == [None] * 6


def test_a_match_survives_being_stored_as_json_and_read_back(match: ffm.Match) -> None:
    import json

    stored = json.loads(json.dumps(ffm.to_dict(match)))
    assert ffm.match_from_dict(stored) == match

    stored["home"]["xi"][0]["a_field_from_the_future"] = 1
    stored["a_field_from_the_future"] = 1
    assert ffm.match_from_dict(stored) == match, "a payload from another build still loads"

    round_ = ffm.parse_round(page("round_laliga_8.html"))
    assert round_ is not None and ffm.round_from_dict(json.loads(json.dumps(ffm.to_dict(round_)))) == round_


# -------------------------------------------------------------------------------------------------------- team page
def test_a_team_page_lists_its_next_matches_in_every_competition() -> None:
    upcoming = ffm.parse_upcoming(page("team_next_matches.html"), today=date(2026, 9, 30))

    assert [(u.competition, u.phase, u.match_id) for u in upcoming] == [
        ("Amistoso", "Amistoso", 24410),
        ("LaLiga", "Jornada 8", 22502),
        ("Europa League", "Jornada 2", 24278),
        ("LaLiga", "Jornada 9", 22507),
        ("Europa League", "Jornada 3", 24303),
    ]
    league = upcoming[1]
    assert (league.home, league.away, league.home_id, league.away_id) == ("Real Sociedad", "Deportivo", "16", "6")
    assert league.kickoff == datetime(2026, 10, 11, 14, 15, tzinfo=UTC)


def test_a_date_with_no_year_is_the_next_one_even_across_new_year() -> None:
    assert ffm._short_when("Sáb 03/01 16:15h", date(2026, 12, 28)) == datetime(2027, 1, 3, 15, 15, tzinfo=UTC)
    assert ffm._short_when("Dom 11/10 16:15h", date(2026, 9, 30)) == datetime(2026, 10, 11, 14, 15, tzinfo=UTC)
    assert ffm._short_when("Vie 30/02 16:15h", date(2026, 9, 30)) is None, "no such day"
    assert ffm._short_when("sin fecha", date(2026, 9, 30)) is None


# --------------------------------------------------------------------------------------------------------- reading
class Site:
    """A stand-in for the site: each address answers with a page, a status, or nothing at all."""

    def __init__(self, pages: dict[str, str | int]) -> None:
        self.pages = pages
        self.asked: list[str] = []

    def client(self) -> httpx.Client:
        def handler(request: httpx.Request) -> httpx.Response:
            url = str(request.url)
            self.asked.append(url)
            answer = self.pages.get(url)
            if answer is None:
                raise httpx.ConnectError("unreachable", request=request)
            if isinstance(answer, int):
                return httpx.Response(answer, request=request)
            return httpx.Response(200, text=answer, request=request)

        return httpx.Client(transport=httpx.MockTransport(handler), headers={"User-Agent": ffm.USER_AGENT})


LALIGA_ROUND = "https://www.futbolfantasy.com/laliga/posibles-alineaciones"
CHAMPIONS_ROUND = "https://www.futbolfantasy.com/champions/posibles-alineaciones"


def test_the_reader_takes_the_round_page_then_only_the_matches_it_is_asked_for() -> None:
    site = Site({LALIGA_ROUND: page("round_laliga_8.html"), MATCH_URL: page("match_real_sociedad_deportivo.html")})

    reading = ffm.read_matches(lambda competition, item: item.match_id == 22502, client=site.client(), pause=0)

    assert site.asked == [LALIGA_ROUND, MATCH_URL]
    assert [m.match_id for m in reading.matches] == [22502] and reading.failed == [] and reading.stopped is None
    assert len(reading.rounds["laliga"].matches) == 10, "the whole round is kept, for the page that lists every match"


def test_a_match_that_is_already_played_is_not_read_again_unless_asked() -> None:
    site = Site({CHAMPIONS_ROUND: page("round_champions_1.html")})

    reading = ffm.read_matches(lambda c, m: True, competitions=["champions"], client=site.client(), pause=0)

    assert site.asked == [CHAMPIONS_ROUND] and reading.matches == []
    assert len(reading.rounds["champions"].matches) == 4


def test_a_page_that_fails_is_named_and_leaves_the_others_alone() -> None:
    other = "https://www.futbolfantasy.com/partidos/22493-alaves-atletico"
    site = Site(
        {LALIGA_ROUND: page("round_laliga_8.html"), other: 500, MATCH_URL: page("match_real_sociedad_deportivo.html")}
    )

    reading = ffm.read_matches(lambda c, item: item.match_id in (22493, 22502), client=site.client(), pause=0)

    assert [m.match_id for m in reading.matches] == [22502]
    assert len(reading.failed) == 1 and reading.failed[0].startswith(other)
    assert site.asked.count(other) == 2, "one retry on a server error, as before"


def test_a_page_that_is_not_a_lineup_page_is_said_so_not_kept() -> None:
    site = Site({LALIGA_ROUND: page("round_laliga_8.html"), MATCH_URL: "<html><body>Mantenimiento</body></html>"})

    reading = ffm.read_matches(lambda c, item: item.match_id == 22502, client=site.client(), pause=0)

    assert reading.matches == [] and reading.failed == [f"{MATCH_URL}: not a lineup page"]


def test_a_page_the_parser_chokes_on_costs_that_match_and_not_the_rest_of_the_read(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    other = "https://www.futbolfantasy.com/partidos/22493-alaves-atletico"
    site = Site(
        {
            LALIGA_ROUND: page("round_laliga_8.html"),
            other: page("match_real_sociedad_deportivo.html"),
            MATCH_URL: page("match_real_sociedad_deportivo.html"),
        }
    )
    real = ffm.parse_match

    def choke(html: str, url: str) -> ffm.Match | None:
        if url == other:
            raise ValueError("a shape nobody expected")
        return real(html, url)

    monkeypatch.setattr(ffm, "parse_match", choke)
    reading = ffm.read_matches(lambda c, item: item.match_id in (22493, 22502), client=site.client(), pause=0)

    assert [m.match_id for m in reading.matches] == [22502]
    assert reading.failed == [f"{other}: could not be parsed (ValueError)"]


def test_it_leaves_the_site_alone_after_three_unreadable_pages_in_a_row() -> None:
    site = Site({LALIGA_ROUND: page("round_laliga_8.html")})  # every match page is unreachable

    reading = ffm.read_matches(lambda c, item: True, client=site.client(), pause=0)

    assert reading.matches == [] and len(reading.failed) == 3
    assert reading.stopped == "3 pages in a row could not be read"
    assert len(site.asked) == 1 + 3, "the round page and three tries, not ten"


def test_it_stops_where_it_is_when_the_time_budget_is_spent() -> None:
    site = Site({LALIGA_ROUND: page("round_laliga_8.html"), MATCH_URL: page("match_real_sociedad_deportivo.html")})
    ticks = iter([0.0, 0.0, 1.0, 999.0, 999.0, 999.0])  # started, round page, the match, then out of time

    reading = ffm.read_matches(
        lambda c, item: True, client=site.client(), pause=0, budget=100.0, clock=lambda: next(ticks)
    )

    assert reading.stopped == "out of time"
    assert len(site.asked) == 2, "the round page and the first match it wanted; the rest are left unread"


def test_an_unreadable_round_page_gives_nothing_and_says_so() -> None:
    site = Site({LALIGA_ROUND: 403})

    reading = ffm.read_matches(lambda c, item: True, client=site.client(), pause=0)

    assert reading.matches == [] and reading.rounds == {}
    assert reading.failed == [f"{LALIGA_ROUND}: HTTP 403"], (
        "what the run's summary shows: the page and the status, short"
    )


def test_it_waits_between_pages_and_says_who_it_is() -> None:
    site = Site({LALIGA_ROUND: page("round_laliga_8.html"), MATCH_URL: page("match_real_sociedad_deportivo.html")})
    waits: list[float] = []

    ffm.read_matches(lambda c, item: item.match_id == 22502, client=site.client(), pause=2.0, sleep=waits.append)

    assert waits == [2.0], "no pause before the first page, one before the second"
    assert "personal" in ffm.USER_AGENT


# ------------------------------------------------------------------------------------------------ the squad pages
SQUAD_URL = "https://www.futbolfantasy.com/laliga/equipos/real-sociedad/plantilla"


def test_a_squad_page_gives_each_player_his_number_his_profile_and_his_line() -> None:
    squad = ffm.parse_squad(page("squad_real_sociedad.html"))

    assert squad is not None and squad.club_id == "16"
    by_id = {m.ff_id: m for m in squad.members}
    remiro = by_id["1975"]
    assert (remiro.name, remiro.slug, remiro.line, remiro.on_loan) == ("Álex Remiro", "alex-remiro", "GK", False)
    lines = [m.line for m in squad.members if not m.on_loan]
    assert lines.count("GK") == 4 and lines.count("DEF") >= 10 and lines.count("MID") >= 10 and lines.count("FWD") >= 3
    assert by_id["12538"].slug == "jon-aramburu" and by_id["12538"].line == "DEF", "the same number the match page uses"


def test_a_player_out_on_loan_is_there_but_marked() -> None:
    squad = ffm.parse_squad(page("squad_real_sociedad.html"))

    assert squad is not None
    loaned = [m for m in squad.members if m.on_loan]
    assert len(loaned) == 2
    assert {m.slug for m in loaned} >= {"javi-lopez-1", "mikel-goti"}
    assert next(m for m in loaned if m.slug == "javi-lopez-1").line == "DEF"


def test_a_page_that_is_not_a_squad_gives_nothing() -> None:
    assert ffm.parse_squad("<html><body>Mantenimiento</body></html>") is None
    assert ffm.parse_squad(page("round_laliga_8.html")) is None


def test_the_reader_takes_each_clubs_squad_page_politely_and_names_the_one_it_could_not_read() -> None:
    other = "https://www.futbolfantasy.com/laliga/equipos/deportivo/plantilla"
    site = Site({SQUAD_URL: page("squad_real_sociedad.html"), other: 500})

    reading = ffm.read_squads({"16": "real-sociedad", "8": "deportivo"}, client=site.client(), pause=0)

    assert site.asked == [SQUAD_URL, other, other], "one retry on a server error"
    assert list(reading.squads) == ["16"] and reading.failed == [f"{other}: HTTP 500"]
    assert reading.stopped is None


def test_the_squad_reader_keeps_to_its_time_budget() -> None:
    site = Site({SQUAD_URL: page("squad_real_sociedad.html")})
    clock = iter([0.0, 0.0, 100.0, 100.0])

    reading = ffm.read_squads(
        {"16": "real-sociedad", "8": "deportivo"}, client=site.client(), pause=0, budget=60, clock=lambda: next(clock)
    )

    assert list(reading.squads) == ["16"] and reading.stopped == "out of time"
