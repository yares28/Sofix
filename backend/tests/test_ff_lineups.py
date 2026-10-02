"""The Lineups page's data: Futbol Fantasy's matches as the page draws them (plans/futbolfantasy.md, S5).

The squads are the real round-8 pages (`fixtures/futbolfantasy/matches_round_8.json`): their pitch coordinates are what the
rows and the formation are read from, and the owner's real cards are what the "yours" marks are checked against.
"""

from __future__ import annotations

import json
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any

import pytest
from sqlalchemy.orm import Session

from app.sorare import ff_lineups, ff_use
from app.sorare.ff_feed import Feed
from app.sorare.model import Card
from app.sources import futbolfantasy_matches as ffm
from tests.test_ff_link import match, player, side
from tests.test_ff_use import NOW, READ, feed_of, row
from tests.test_pipeline import db  # noqa: F401  (fixture)

FIXTURES = Path(__file__).parent / "fixtures" / "futbolfantasy"


@pytest.fixture(scope="module")
def real() -> list[ffm.Match]:
    return [ffm.match_from_dict(item) for item in json.loads((FIXTURES / "matches_round_8.json").read_text("utf-8"))]


def sides(real: list[ffm.Match], name: str) -> ffm.Side:
    return next(s for m in real for s in (m.home, m.away) if s.name == name)


def card(slug: str, name: str, rarity: str = "limited", pos: str = "FWD", club: str = "Real Sociedad") -> Card:
    return Card(
        slug=f"{slug}-2026-{rarity}-1",
        player=slug,
        name=name,
        positions=(pos,),
        rarity=rarity,
        in_season=True,
        level=0,
        average=50.0,
        club_name=club,
        picture=f"https://assets.example/{slug}-{rarity}.png",
    )


OYARZABAL = row("mikel-oyarzabal-ugarte", "Oyarzabal", "Real Sociedad", "Forward")
BEFORE = datetime(2026, 10, 9, 8, tzinfo=UTC)  # the morning of the round's first game: all ten matches are still ahead


# ------------------------------------------------------------------------------------------------- the pitch
def test_the_eleven_are_read_into_rows_from_their_coordinates(real: list[ffm.Match]) -> None:
    rows, formation = ff_lineups.pitch(sides(real, "Real Sociedad").xi)

    assert formation == "4-2-3-1"
    assert [line for line, _ in rows] == ["FWD", "MID", "MID", "DEF", "GK"], "attack at the top, the keeper last"
    assert [len(group) for _, group in rows] == [1, 3, 2, 4, 1]
    for _, group in rows:
        assert [p.x for p in group] == sorted(p.x for p in group if p.x is not None), "left to right"


def test_a_three_at_the_back_shows_in_the_formation(real: list[ffm.Match]) -> None:
    assert ff_lineups.pitch(sides(real, "Atlético").xi)[1] == "3-4-2-1"
    assert ff_lineups.pitch(sides(real, "Levante").xi)[1] == "4-1-2-2-1"


def test_every_real_eleven_is_eleven_players_in_rows_with_a_keeper(real: list[ffm.Match]) -> None:
    for one in real:
        for s in (one.home, one.away):
            rows, formation = ff_lineups.pitch(s.xi)
            assert sum(len(group) for _, group in rows) == 11 and rows[-1][0] == "GK", s.name
            assert sum(int(n) for n in formation.split("-")) == 10, (s.name, formation)


def test_no_eleven_gives_no_rows() -> None:
    assert ff_lineups.pitch(()) == ([], "")


def test_one_row_of_outfield_players_is_midfield() -> None:
    xi = tuple(player(str(i), f"P{i}", keeper=i == 0) for i in range(3))
    rows, formation = ff_lineups.pitch(xi)

    assert [line for line, _ in rows] == ["MID", "GK"] and formation == "2"


# ------------------------------------------------------------------------------------------------ the payload
def built(real: list[ffm.Match], cards: list[Card] | None = None, **kw: Any) -> dict[str, Any]:
    feed = kw.pop("feed", None) or feed_of(real)
    rows = kw.pop("rows", [OYARZABAL])
    lineups = ff_use.Lineups(feed, rows, NOW)
    return ff_lineups.payload(feed, lineups, cards or [], kw.pop("positions", {}), kw.pop("now", BEFORE))


def find(out: dict[str, Any], match_id: int) -> dict[str, Any]:
    return next(m for m in out["matches"] if m["id"] == match_id)


def test_every_match_is_there_by_kickoff_with_both_sides_drawn(real: list[ffm.Match]) -> None:
    out = built(real)

    assert len(out["matches"]) == 10
    assert [m["kickoff"] for m in out["matches"]] == sorted(m["kickoff"] for m in out["matches"])
    one = find(out, 22502)
    assert (one["competition"], one["competitionName"], one["round"]) == ("laliga", "LaLiga", 8)
    assert one["url"].endswith("/partidos/22502-real-sociedad-deportivo")
    assert one["readAt"] == READ.isoformat()
    home = one["home"]
    assert (home["name"], home["club"], home["ffId"]) == ("Real Sociedad", "RSO", "16")
    assert home["formation"] == "4-2-3-1" and home["published"] is True
    assert [r["line"] for r in home["rows"]] == ["FWD", "MID", "MID", "DEF", "GK"]
    source = sides(real, "Real Sociedad")
    assert home["coach"] == source.coach and home["season"] == source.season_predictability
    assert home["rotations"] == (
        {"value": source.rotations.value, "label": source.rotations.label} if source.rotations else None
    )
    assert home["crest"] == "https://static.futbolfantasy.com/uploads/images/equipos/escudom/16.png"


def test_a_player_is_drawn_with_his_chance_his_place_and_what_the_page_says_of_him(real: list[ffm.Match]) -> None:
    home = find(built(real), 22502)["home"]
    shown = {p["id"]: p for r in home["rows"] for p in r["players"]}

    oyarzabal = shown["2675"]
    assert oyarzabal["name"] == "Mikel Oyarzabal" and oyarzabal["p"] == 0.9
    assert oyarzabal["x"] is not None and oyarzabal["y"] is not None
    assert oyarzabal.get("status") is None
    zubeldia = shown["2802"]
    assert zubeldia["p"] == 0.5 and zubeldia["status"]["kind"] == "doubt"
    keeper = next(p for p in shown.values() if p.get("gk"))
    assert keeper["p"] is not None


def test_the_alternatives_come_in_the_pages_order_with_their_chances(real: list[ffm.Match]) -> None:
    home = find(built(real), 22502)["home"]
    source = sides(real, "Real Sociedad")

    assert [p["id"] for p in home["alternatives"]] == [p.ff_id for p in source.alternatives]
    assert all("x" not in p and "y" not in p for p in home["alternatives"])
    assert home["alternatives"][0]["p"] == source.alternatives[0].chance


def test_the_gauges_and_the_coach_are_passed_on_as_they_are() -> None:
    gauge = ffm.Level(4, "Rotaciones altas")
    coached = ffm.Side(**{**side("Alavés", "10").__dict__, "coach": "Eduardo Coudet", "rotations": gauge})
    one = match(coached, side("Elche", "11"), READ + timedelta(days=1), match_id=5)

    out = built([one], feed=feed_of([one]))

    home = find(out, 5)["home"]
    assert home["coach"] == "Eduardo Coudet" and home["rotations"] == {"value": 4, "label": "Rotaciones altas"}
    assert home["predictability"] is None and find(out, 5)["away"]["coach"] is None


def test_the_injury_list_is_kept_with_its_cause_and_who_it_is_about(real: list[ffm.Match]) -> None:
    home = find(built(real), 22502)["home"]
    source = sides(real, "Real Sociedad")

    assert len(home["absent"]) == len(source.absences)
    first = home["absent"][0]
    assert first["name"] == source.absences[0].name and first["kind"] == source.absences[0].kind
    assert first.get("cause") == source.absences[0].cause


# ---------------------------------------------------------------------------------------------- yours
def test_a_player_of_the_owner_is_marked_with_his_card(real: list[ffm.Match]) -> None:
    out = built(real, [card("mikel-oyarzabal-ugarte", "Oyarzabal")])

    shown = {p["id"]: p for r in find(out, 22502)["home"]["rows"] for p in r["players"]}
    assert shown["2675"]["yours"] == "mikel-oyarzabal-ugarte"
    assert sum(1 for p in shown.values() if p.get("yours")) == 1
    assert out["cards"]["mikel-oyarzabal-ugarte"] == {
        "name": "Oyarzabal",
        "rarity": "limited",
        "pic": "https://assets.example/mikel-oyarzabal-ugarte-limited.png",
        "pos": "FWD",
        "club": "Real Sociedad",
    }


def test_with_several_cards_of_one_player_the_rarest_is_the_one_drawn(real: list[ffm.Match]) -> None:
    out = built(
        real,
        [
            card("mikel-oyarzabal-ugarte", "Oyarzabal", "limited"),
            card("mikel-oyarzabal-ugarte", "Oyarzabal", "rare"),
            card("mikel-oyarzabal-ugarte", "Oyarzabal", "common"),
        ],
    )

    assert out["cards"]["mikel-oyarzabal-ugarte"]["rarity"] == "rare"


def test_a_player_of_the_owner_among_the_alternatives_is_marked_too(real: list[ffm.Match]) -> None:
    kubo = row("takefusa-kubo", "Take Kubo", "Real Sociedad", "Midfielder")

    home = find(built(real, rows=[kubo]), 22502)["home"]

    assert [p["yours"] for p in home["alternatives"] if p.get("yours")] == ["takefusa-kubo"]


def test_only_the_players_who_are_his_carry_the_mark(real: list[ffm.Match]) -> None:
    out = built(real, rows=[])

    every = [p for one in out["matches"] for s in (one["home"], one["away"]) for p in s["alternatives"]]
    assert not any(p.get("yours") for p in every) and out["cards"] == {}


def test_a_player_of_his_at_a_club_the_page_does_not_list_him_under_is_named_with_why(real: list[ffm.Match]) -> None:
    ghost = row("nobody-such", "Nobody Such", "Real Sociedad", "Midfielder")

    home = find(built(real, rows=[OYARZABAL, ghost]), 22502)["home"]

    assert home["unlinked"] == [
        {"slug": "nobody-such", "name": "Nobody Such", "why": "nobody of that name"},
    ]
    assert find(built(real, rows=[OYARZABAL, ghost]), 22502)["away"]["unlinked"] == []


# ------------------------------------------------------------------------------------ freshness and states
def test_when_each_side_changed_and_when_the_site_was_last_asked_are_there(real: list[ffm.Match]) -> None:
    moment = READ - timedelta(hours=20)
    feed = feed_of(real, changed={"16": moment})
    feed.read_at = READ
    feed.failed = ["https://www.futbolfantasy.com/x: HTTP 403"]

    out = built(real, feed=feed)

    assert find(out, 22502)["home"]["changedAt"] == moment.isoformat()
    assert find(out, 22502)["away"]["changedAt"] is None
    assert out["readAt"] == READ.isoformat() and out["failed"] == feed.failed


def test_a_side_the_site_has_not_published_is_said_so(real: list[ffm.Match]) -> None:
    empty = ffm.Match(**{**real[0].__dict__, "home": side("Alavés", "10")})
    feed = feed_of([empty])

    one = find(built([empty], feed=feed), empty.match_id)

    assert one["home"]["published"] is False and one["home"]["rows"] == [] and one["home"]["formation"] == ""
    assert one["away"]["published"] is True


def test_a_match_that_ended_hours_ago_is_left_out_and_one_in_play_stays(real: list[ffm.Match]) -> None:
    now = datetime(2026, 10, 12, 12, tzinfo=UTC)
    early = ffm.Match(**{**real[0].__dict__, "match_id": 1, "kickoff": now - timedelta(hours=14)})
    playing = ffm.Match(**{**real[0].__dict__, "match_id": 2, "kickoff": now - timedelta(hours=1)})
    later = ffm.Match(**{**real[0].__dict__, "match_id": 3, "kickoff": None})
    feed = feed_of([early, playing, later], read_at=now - timedelta(hours=2))

    out = built([], feed=feed, now=now)

    assert [m["id"] for m in out["matches"]] == [2, 3], "kickoff order, the one with no date last"


def test_a_match_with_a_score_or_a_phase_instead_of_a_round_says_so() -> None:
    home = side("Bayern", "30", xi=tuple(player(str(i), f"H{i}", keeper=i == 0) for i in range(11)))
    away = side("Real Sociedad", "16")
    played = ffm.Match(
        match_id=9,
        url="u",
        competition="champions",
        competition_name="Champions League",
        round_label="Octavos de final",
        round_no=None,
        kickoff=READ + timedelta(days=1),
        score=(2, 1),
        home=home,
        away=away,
    )

    one = find(built([played], feed=feed_of([played])), 9)

    assert one["round"] is None and one["phase"] == "Octavos de final" and one["score"] == [2, 1]
    assert one["home"]["club"] is None, "a club the registry does not keep"


def test_an_unread_feed_gives_no_matches() -> None:
    out = ff_lineups.payload(Feed(), None, [], {}, NOW)

    assert out["matches"] == [] and out["readAt"] is None and out["cards"] == {}


# -------------------------------------------------------------------------------------- where people play
def test_the_alternatives_are_placed_by_the_line_he_was_last_drawn_in(real: list[ffm.Match]) -> None:
    source = sides(real, "Real Sociedad")
    known, unknown = source.alternatives[0], source.alternatives[2]

    out = built(real, positions={known.ff_id: "DEF"})

    alts = {p["id"]: p for p in find(out, 22502)["home"]["alternatives"]}
    assert alts[known.ff_id]["pos"] == "DEF"
    assert "pos" not in alts[unknown.ff_id], "nobody has seen him in an eleven: he is listed apart"


def test_the_memory_takes_the_line_of_everyone_in_an_eleven(real: list[ffm.Match]) -> None:
    feed = feed_of(real)

    found = ff_lineups.remember({}, feed, ff_use.Lineups(feed, [], NOW))

    rows, _ = ff_lineups.pitch(sides(real, "Real Sociedad").xi)
    assert all(found[p.ff_id] == line for line, group in rows for p in group)
    assert len(found) == sum(len(s.xi) for m in real for s in (m.home, m.away))


def test_his_sorare_position_outranks_where_the_pitch_drew_him_and_a_fresh_eleven_outranks_the_memory(
    real: list[ffm.Match],
) -> None:
    feed = feed_of(real)
    lineups = ff_use.Lineups(feed, [OYARZABAL], NOW)
    kept = {"2675": "DEF", "99999": "MID"}

    found = ff_lineups.remember(kept, feed, lineups)

    assert found["2675"] == "FWD", "Sorare calls Oyarzabal a forward"
    assert found["99999"] == "MID", "nobody new said otherwise"


def test_the_memory_is_kept_between_runs_and_nothing_is_written_when_it_did_not_change(db: Session) -> None:  # noqa: F811
    assert ff_lineups.load_memory(db) == ff_lineups.Memory()
    kept = ff_lineups.Memory({"1": "DEF"}, {"16": NOW})

    assert ff_lineups.save_memory(db, kept, NOW) is True
    assert ff_lineups.load_memory(db) == kept
    assert ff_lineups.save_memory(db, kept, NOW) is False
    assert ff_lineups.save_memory(db, ff_lineups.Memory({"1": "DEF", "2": "GK"}, {"16": NOW}), NOW) is True


def test_a_memory_that_does_not_read_is_empty(db: Session) -> None:  # noqa: F811
    from app.models import ReadModel

    db.add(
        ReadModel(
            key=ff_lineups.POSITIONS_KEY, payload={"positions": ["x"], "squads": {"16": "not a date"}}, updated_at=NOW
        )
    )
    db.commit()

    assert ff_lineups.load_memory(db) == ff_lineups.Memory()


# ------------------------------------------------------------------------------------------ the squad pages
def squad_reading(*clubs: str) -> ffm.SquadReading:
    members = (
        ffm.SquadMember("1975", "Álex Remiro", "alex-remiro", "GK"),
        ffm.SquadMember("7777", "Nuevo Fichaje", "nuevo", "FWD"),
        ffm.SquadMember("7781", "Javi López", "javi-lopez-1", "DEF", on_loan=True),
    )
    return ffm.SquadReading(at=BEFORE, squads={club: ffm.Squad(club, members) for club in clubs})


def test_a_club_is_read_when_its_squad_was_never_read_or_a_week_ago(real: list[ffm.Match]) -> None:
    feed = feed_of(real)

    everyone = ff_lineups.due_squads(feed, ff_lineups.Memory(), BEFORE)
    assert len(everyone) == 20 and everyone["16"] == "real-sociedad" and everyone["14"] == "rayo-vallecano"

    fresh = ff_lineups.Memory({}, {"16": BEFORE - timedelta(days=3), "14": BEFORE - timedelta(days=8)})
    left = ff_lineups.due_squads(feed, fresh, BEFORE)
    assert "16" not in left and "14" in left and len(left) == 19


def test_a_club_the_registry_does_not_keep_is_not_asked_for() -> None:
    foreign = side("Bayern München", "30", xi=())
    foreign = ffm.Side(**{**foreign.__dict__, "slug": "bayern-munchen"})
    one = match(
        foreign,
        ffm.Side(**{**side("Real Sociedad", "16").__dict__, "slug": "real-sociedad"}),
        BEFORE + timedelta(days=1),
    )

    assert ff_lineups.due_squads(feed_of([one]), ff_lineups.Memory(), BEFORE) == {"16": "real-sociedad"}


def test_the_squads_read_put_every_player_in_his_place_and_those_on_loan_out_of_it(real: list[ffm.Match]) -> None:
    asked: list[dict[str, str]] = []

    def reader(clubs: dict[str, str], now: datetime | None = None, **_: object) -> ffm.SquadReading:
        asked.append(clubs)
        return squad_reading("16")

    memory, reading = ff_lineups.read_squads(ff_lineups.Memory({"5": "MID"}), feed_of(real), BEFORE, reader=reader)

    assert len(asked[0]) == 20 and reading is not None
    assert memory.positions == {"5": "MID", "1975": "GK", "7777": "FWD"}, "the man on loan is nobody's alternative"
    assert memory.squads == {"16": BEFORE}, "only the club whose page was read is marked read"


def test_nothing_is_asked_when_every_squad_was_read_this_week(real: list[ffm.Match]) -> None:
    clubs = {
        club: BEFORE - timedelta(days=1) for club in ff_lineups.due_squads(feed_of(real), ff_lineups.Memory(), BEFORE)
    }

    def reader(*args: object, **kwargs: object) -> ffm.SquadReading:
        raise AssertionError("the site was asked")

    memory, reading = ff_lineups.read_squads(ff_lineups.Memory({}, clubs), feed_of(real), BEFORE, reader=reader)

    assert reading is None and memory.squads == clubs


def test_a_squad_page_that_could_not_be_read_is_asked_again_next_time(real: list[ffm.Match]) -> None:
    memory, reading = ff_lineups.read_squads(
        ff_lineups.Memory(), feed_of(real), BEFORE, reader=lambda clubs, now=None, **_: squad_reading()
    )

    assert memory == ff_lineups.Memory() and reading is not None
    assert len(ff_lineups.due_squads(feed_of(real), memory, BEFORE)) == 20


def test_the_ten_round_8_matches_stay_light_enough_to_be_read_on_every_visit(real: list[ffm.Match]) -> None:
    size = len(json.dumps(built(real), separators=(",", ":")))

    assert size < 250_000, f"the ten round-8 matches are {size} bytes"


# ------------------------------------------------------------------------------------------ who comes in for whom
def with_next(real: list[ffm.Match], name: str, slugs: tuple[str, ...]) -> tuple[list[ffm.Match], ffm.Player]:
    """The real matches with the first starter of one side told who comes in for him (his `next`, by profile slug)."""
    import dataclasses

    changed = []
    first = sides(real, name).xi[0]
    for one in real:
        home, away = one.home, one.away
        if home.name == name:
            home = dataclasses.replace(home, xi=(dataclasses.replace(first, next=slugs), *home.xi[1:]))
        if away.name == name:
            away = dataclasses.replace(away, xi=(dataclasses.replace(first, next=slugs), *away.xi[1:]))
        changed.append(dataclasses.replace(one, home=home, away=away))
    return changed, first


def test_a_starter_lists_who_comes_in_for_him_by_the_ids_of_the_bench(real: list[ffm.Match]) -> None:
    bench = [p for p in sides(real, "Real Sociedad").alternatives if p.slug][:2]
    matches, first = with_next(real, "Real Sociedad", (bench[1].slug or "", "nobody-on-the-bench", bench[0].slug or ""))
    home = find(built(matches), 22502)["home"]
    shown = {p["id"]: p for r in home["rows"] for p in r["players"]}

    assert shown[first.ff_id]["next"] == [bench[1].ff_id, bench[0].ff_id], (
        "the page's order, and only who is on the bench"
    )
    assert all("next" not in p for pid, p in shown.items() if pid != first.ff_id), (
        "a slot the page names nobody under has none"
    )


def test_a_bench_player_can_be_next_in_line_in_more_than_one_slot(real: list[ffm.Match]) -> None:
    import dataclasses

    source = sides(real, "Real Sociedad")
    bench = next(p for p in source.alternatives if p.slug)
    xi = tuple(dataclasses.replace(p, next=(bench.slug or "",)) for p in source.xi[:3]) + source.xi[3:]
    changed = [
        dataclasses.replace(m, home=dataclasses.replace(m.home, xi=xi)) if m.home.name == "Real Sociedad" else m
        for m in real
    ]
    home = find(built(changed), 22502)["home"]
    shown = {p["id"]: p for r in home["rows"] for p in r["players"]}

    assert [shown[p.ff_id].get("next") for p in source.xi[:3]] == [[bench.ff_id]] * 3
