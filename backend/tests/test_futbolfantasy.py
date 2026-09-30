"""Futbol Fantasy's expected starting chances: read politely, once per team, and never trusted when a page goes wrong."""

from __future__ import annotations

import httpx
import pytest

from app.sources import futbolfantasy

LINEUPS = """<html><head><title>Alineaciones Probables de LaLiga 2026/27 - Jornada 8 - FutbolFantasy</title></head><body>
<a href="https://www.futbolfantasy.com/laliga/equipos/real-sociedad">Real Sociedad</a>
<a href="/laliga/equipos/barcelona">Barcelona</a>
<a href="/laliga/equipos/real-sociedad">again</a>
<a href="/laliga/equipos/rayo-vallecano/plantilla">a sub-page still names its team</a>
</body></html>"""


def player(slug: str, chance: str | None, **flags: str) -> str:
    """One player row as the team page draws it: a div with the facts as data attributes (and a lot more of them)."""
    base = {"data-lesion": "-1", "data-sancionado": "0", "data-nodisponible": "0", "data-internacional": "0"}
    base.update({f"data-{key}": value for key, value in flags.items()})
    attributes = " ".join(f'{key}="{value}"' for key, value in base.items())
    probability = f' data-probabilidad="{chance}"' if chance is not None else ""
    return f'<div class="jugador" data-nombre="{slug}"{probability} data-edad="23" {attributes}></div>'


def team_page(*rows: str) -> str:
    return "<html><body><div data-nombre-sin-probabilidad='x'>header</div>" + "".join(rows) + "</body></html>"


def client_for(handler) -> httpx.Client:
    return httpx.Client(transport=httpx.MockTransport(handler), headers={"User-Agent": futbolfantasy.USER_AGENT})


def test_the_team_pages_and_the_round_come_from_the_lineups_page() -> None:
    assert futbolfantasy.team_slugs(LINEUPS) == ["real-sociedad", "barcelona", "rayo-vallecano"]
    assert futbolfantasy.round_of(LINEUPS) == 8
    assert futbolfantasy.round_of("<title>nothing here</title>") is None


def test_it_reads_each_players_chance_and_the_facts_that_might_explain_it() -> None:
    page = team_page(
        player("mikel-oyarzabal", "80%", internacional="1"),
        player("jon-martin", "0%", lesion="3"),
        player("a-player-with-no-chance", None),
    )
    chances = futbolfantasy.parse_team(page, "real-sociedad")

    assert [c.slug for c in chances] == ["mikel-oyarzabal", "jon-martin"], "a row with no chance on it is not a chance"
    first = chances[0]
    assert (first.name, first.team, first.chance) == ("Mikel Oyarzabal", "Real Sociedad", 0.8)
    assert first.international is True and first.lesion == -1
    assert chances[1].chance == 0.0 and chances[1].lesion == 3


def test_a_chance_that_cannot_be_read_is_skipped_not_guessed() -> None:
    page = team_page(player("fine", "50%"), player("odd", "soon"), player("huge", "250%"))
    assert [c.slug for c in futbolfantasy.parse_team(page, "sevilla")] == ["fine"]


def test_it_asks_once_per_team_politely_and_leaves_a_failed_team_out() -> None:
    seen: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(request)
        if request.url.path == "/laliga/posibles-alineaciones":
            return httpx.Response(200, text=LINEUPS)
        if "barcelona" in request.url.path:
            return httpx.Response(503)
        return httpx.Response(200, text=team_page(player("x-" + request.url.path.rsplit("/", 1)[1], "60%")))

    found = futbolfantasy.fetch_all(client_for(handler), pause=0)

    assert found is not None and found.round == 8
    assert sorted({c.team for c in found.chances}) == ["Rayo Vallecano", "Real Sociedad"]
    paths = [r.url.path for r in seen]
    assert paths[0] == "/laliga/posibles-alineaciones"
    assert paths.count("/laliga/equipos/real-sociedad") == 1, "once per team"
    assert paths.count("/laliga/equipos/barcelona") == 2, "one retry on a server error, then it is left out"
    assert all("Sofix" in r.headers["user-agent"] for r in seen)


def test_a_lineups_page_it_cannot_read_gives_nothing_rather_than_a_guess() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(500)

    assert futbolfantasy.fetch_all(client_for(handler), pause=0) is None


@pytest.mark.parametrize("html", ["<html>no team links here</html>", ""])
def test_a_lineups_page_with_no_teams_gives_nothing(html: str) -> None:
    assert futbolfantasy.fetch_all(client_for(lambda request: httpx.Response(200, text=html)), pause=0) is None


def test_it_turns_its_chances_into_the_shape_the_name_matching_already_reads() -> None:
    found = futbolfantasy.Snapshot(
        round=8, chances=futbolfantasy.parse_team(team_page(player("mikel-oyarzabal", "80%")), "real-sociedad")
    )
    league = found.as_league()
    assert [(p.id, p.name, p.team) for p in league.players] == [("mikel-oyarzabal", "Mikel Oyarzabal", "Real Sociedad")]
    assert found.by_id()["mikel-oyarzabal"].chance == 0.8
