"""Weeks Sorare has not opened: every LaLiga round still to play, planned early from form."""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Any

import pytest

from app.jobs import sorare as sorare_job
from app.sorare import projection, publish
from app.sorare.model import Card
from tests.test_pipeline import db  # noqa: F401  (fixture)
from tests.test_sorare_publish import AHEAD_GW, PAST_GW, PLAN_GW, snapshot

CLUBS = {"club-a": "Barcelona", "club-b": "Real Madrid", "club-c": "Sevilla"}
FCB = projection.Side("FCB", "Barcelona", "https://crests.football-data.org/81.png")
RMA = projection.Side("RMA", "Real Madrid", "https://crests.football-data.org/86.png")
SEV = projection.Side("SEV", "Sevilla", "https://crests.football-data.org/559.png")
ATL = projection.Side("ATL", "Atlético Madrid", "https://crests.football-data.org/78.png")


def at(day: str, hour: int = 19) -> datetime:
    return datetime.fromisoformat(f"{day}T{hour:02d}:00:00+00:00")


def match(kickoff: datetime, home: projection.Side, away: projection.Side) -> projection.Match:
    return projection.Match(id=f"{home.code}-{away.code}-{kickoff:%Y%m%d}", kickoff=kickoff, home=home, away=away)


@pytest.fixture(autouse=True)
def no_understat(monkeypatch):
    monkeypatch.setattr(sorare_job.understat, "fetch_leagues", lambda *a, **k: {})


# --------------------------------------------------------------------------- the window Sorare would give a round
def test_a_weekend_round_gets_sorares_friday_to_tuesday_window():
    # 16 May 2027 is a Sunday: Sorare runs Fri 14:00 to Tue 14:00 around it, and locks when it opens.
    week = projection.window(at("2027-05-16", 0))
    assert week == (at("2027-05-14", 14), at("2027-05-18", 14), at("2027-05-14", 14))


def test_a_midweek_round_gets_the_tuesday_to_friday_window():
    assert projection.window(at("2026-10-21", 19)) == (at("2026-10-20", 14), at("2026-10-23", 14), at("2026-10-20", 14))


def test_a_kickoff_before_the_afternoon_lock_falls_in_the_window_before():
    # Friday 12:00 UTC is still the midweek window (Tuesday to Friday 14:00): the weekend has not opened yet.
    start, end, _ = projection.window(at("2026-10-16", 12))
    assert (start, end) == (at("2026-10-13", 14), at("2026-10-16", 14))


def test_these_windows_are_the_ones_sorare_really_drew_this_season():
    # GW17 25-29 Sep, GW18 29 Sep-2 Oct, GW19 2-6 Oct, GW20 6-9 Oct (Sorare's own list, 29 Sep 2026).
    assert projection.window(at("2026-09-26", 19))[:2] == (at("2026-09-25", 14), at("2026-09-29", 14))
    assert projection.window(at("2026-09-30", 19))[:2] == (at("2026-09-29", 14), at("2026-10-02", 14))
    assert projection.window(at("2026-10-03", 19))[:2] == (at("2026-10-02", 14), at("2026-10-06", 14))
    assert projection.window(at("2026-10-07", 19))[:2] == (at("2026-10-06", 14), at("2026-10-09", 14))


# --------------------------------------------------------------------------- which rounds are worth projecting
def rounds() -> list[projection.Round]:
    return [
        projection.Round(8, (match(at("2026-10-10"), FCB, RMA), match(at("2026-10-11"), SEV, ATL))),  # inside GW21
        projection.Round(
            11, (match(at("2026-10-31"), RMA, SEV), match(at("2026-11-01"), ATL, FCB))
        ),  # nothing open there
        projection.Round(36, (match(at("2027-05-16", 0), FCB, SEV),)),
    ]


def test_a_round_inside_a_week_sorare_has_opened_is_left_to_that_week():
    opened = [PAST_GW, PLAN_GW, AHEAD_GW]  # GW21 runs 9-13 Oct, so round 8 (10-11 Oct) is already planned for real
    left = projection.unopened(rounds(), opened)
    assert [r.number for r in left] == [11, 36]


def test_a_round_that_has_started_is_not_early_any_more():
    now = at("2026-10-31", 20)
    assert [r.number for r in projection.unopened(rounds(), [], now=now)] == [36], "round 11 began on the 31st"


# --------------------------------------------------------------------------- each card's game
def card_of(club: str | None, *, league: str = "laliga-es", slug: str = "p1") -> Card:
    return Card(
        slug=f"{slug}-card",
        player=slug,
        name=slug.title(),
        positions=("MID",),
        rarity="limited",
        in_season=True,
        level=0,
        average=50.0,
        league=league,
        club=club,
        club_name=CLUBS.get(club or ""),
    )


def test_a_card_gets_the_game_his_club_plays_that_round_from_his_side():
    everyone = [
        card_of("club-a", slug="home-man"),
        card_of("club-b", slug="away-man"),
        card_of("club-c", slug="idle-man"),
    ]
    games = projection.games_for(everyone, rounds()[1])  # round 11: Real Madrid v Sevilla, Atlético v Barcelona

    home = games["home-man"][0]
    assert (home["team"], home["opponent"], home["venue"]) == ("Barcelona", "Atlético Madrid", "A")
    assert home["kickoff"] == "2026-11-01T19:00:00Z" and home["competition"] == "laliga-es"
    assert home["teamCrest"] == FCB.crest and home["opponentCrest"] == ATL.crest
    assert games["away-man"][0]["venue"] == "H" and games["away-man"][0]["opponent"] == "Sevilla"
    assert games["idle-man"][0]["venue"] == "A"


def test_a_club_that_does_not_play_that_round_has_no_game():
    lonely = projection.Round(9, (match(at("2026-10-17"), RMA, SEV),))
    games = projection.games_for([card_of("club-a")], lonely)
    assert games == {}, "Barcelona is not in this round"


def test_only_laliga_cards_are_placed_in_a_laliga_round():
    abroad = card_of("club-a", league="premier-league-gb-eng", slug="english")
    assert projection.games_for([abroad], rounds()[1]) == {}
    assert projection.games_for([card_of(None, slug="free-agent")], rounds()[1]) == {}


def test_a_double_round_gives_a_player_both_games():
    twice = projection.Round(12, (match(at("2026-11-04"), FCB, RMA), match(at("2026-11-05"), SEV, FCB)))
    assert len(projection.games_for([card_of("club-a")], twice)["p1"]) == 2


# --------------------------------------------------------------------------- the early plan itself
def early_snapshot() -> dict[str, Any]:
    snap = snapshot()
    for row in snap["cards"]:
        club = row["player"]["activeClub"]
        club["shortName"] = CLUBS[club["slug"]]
    return snap


@pytest.fixture(scope="module")
def early() -> list[dict[str, Any]]:
    return publish.projected_weeks(early_snapshot(), rounds()[1:], runs=4, draws=300)


def test_every_unopened_round_becomes_a_week_of_its_own(early):
    assert [w["gameweek"]["id"] for w in early] == ["md11", "md36"]
    assert early[0]["gameweek"]["name"] == "LaLiga GW11"
    # 31 Oct is a Saturday: the weekend window around it, which locks when it opens
    assert early[0]["gameweek"]["start"] == "2026-10-30T14:00:00+00:00"
    assert early[0]["gameweek"]["end"] == "2026-11-03T14:00:00+00:00"
    assert early[0]["gameweek"]["lock"] == early[0]["gameweek"]["start"]
    assert all(w["played"] is False for w in early)


def test_it_says_what_it_is_built_from(early):
    note = early[0]["projected"]
    assert note["round"] == 11
    assert note["basedOn"] == "GW21", "the competitions of the week being planned"
    assert early[0]["source"] == "form", "Sorare projects only a player's next game"


def test_it_plans_the_cards_that_play_and_leaves_the_rest_out(early):
    week = early[0]
    assert week["state"] == "ready" and week["plans"], "there are lineups to plan"
    assert len(week["plans"]) == 1, "one plan is enough this far out"
    playing = {p["player"] for p in week["playing"]["players"]}
    assert playing and all(g["competition"] == "laliga-es" for p in week["playing"]["players"] for g in p["games"])
    assert week["playing"]["cards"] == sum(p["cards"] for p in week["playing"]["players"])


def test_a_round_no_club_of_yours_plays_in_is_an_honest_empty_week():
    only_far = [
        projection.Round(37, (match(at("2027-05-23"), ATL, RMA),))
    ]  # neither Barcelona nor Real Madrid... Sevilla neither
    snap = early_snapshot()
    for row in snap["cards"]:
        row["player"]["activeClub"]["shortName"] = "Sevilla"
    week = publish.projected_weeks(snap, only_far, runs=2, draws=100)[0]
    assert week["state"] == "none" and week["plans"] == [] and week["playing"]["cards"] == 0


def test_the_main_page_only_carries_a_headline_for_each_early_week(early):
    heads = publish.projected_heads(early)
    assert [h["round"] for h in heads] == [11, 36]
    assert set(heads[0]) == {"round", "id", "from", "to", "cards", "plans"}
    payload = publish.build_payload(early_snapshot(), runs=2, draws=100, projected=heads)
    assert payload["projected"] == heads
    assert len(str(payload["projected"])) < 2000, "the whole week is not in the main page"


def test_the_job_writes_each_early_week_apart_and_replaces_it_every_run(db, monkeypatch):  # noqa: F811
    from app.models import ReadModel

    monkeypatch.delenv("GITHUB_ACTIONS", raising=False)
    monkeypatch.setattr(sorare_job.settings, "sorare_api_key", "test-key")
    monkeypatch.setattr(sorare_job, "SorareClient", lambda *a, **k: _Client())
    monkeypatch.setattr(sorare_job.sorare_sync, "snapshot", lambda *a, **k: early_snapshot())
    monkeypatch.setattr(sorare_job.projection, "calendar", lambda db, now: rounds())

    summary = sorare_job.run(db, "yares", runs=1)

    assert summary["projected"] == [11, 36]
    row = db.get(ReadModel, "sorare_ahead:11")
    assert row is not None and row.payload["projected"]["round"] == 11
    main = db.get(ReadModel, sorare_job.SORARE_KEY)
    assert [h["round"] for h in main.payload["projected"]] == [11, 36]
    first = row.updated_at

    sorare_job.run(db, "yares", runs=1)
    assert db.get(ReadModel, "sorare_ahead:11").updated_at >= first, "written again: the plan follows the numbers"


class _Client:
    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return None


# --------------------------------------------------------------------------- the calendar, from the fixtures the app holds
def test_the_calendar_groups_the_fixtures_still_to_come_into_rounds(db):  # noqa: F811
    from app.models import Competition, Fixture, Team

    league = Competition(source_key="PD", name="LaLiga")
    barca = Team(
        canonical_name="FC Barcelona",
        short_name="Barcelona",
        code="FCB",
        crest_url="https://crests.football-data.org/81.png",
    )
    madrid = Team(canonical_name="Real Madrid CF", code="RMA")
    coded_wrongly = Team(canonical_name="Nowhere FC", code=None)
    db.add_all([league, barca, madrid, coded_wrongly])
    db.flush()

    def fixture(matchday: int | None, when: str, home: Team, away: Team, n: int) -> Fixture:
        return Fixture(
            source_fixture_id=f"f{n}",
            competition_id=league.id,
            season="2026",
            matchday=matchday,
            kickoff_utc=datetime.fromisoformat(when).replace(tzinfo=UTC),
            home_team_id=home.id,
            away_team_id=away.id,
        )

    db.add_all(
        [
            fixture(7, "2026-09-20T19:00:00", barca, madrid, 1),  # long over
            fixture(11, "2026-11-01T19:00:00", madrid, barca, 2),
            fixture(11, "2026-10-31T19:00:00", barca, madrid, 3),
            fixture(12, "2026-11-08T19:00:00", barca, coded_wrongly, 4),  # a side with no code cannot be placed
            fixture(None, "2026-11-09T19:00:00", barca, madrid, 5),  # no round yet
        ]
    )
    db.commit()

    rounds = projection.calendar(db, datetime(2026, 10, 1, tzinfo=UTC))

    assert [r.number for r in rounds] == [11]
    only = rounds[0]
    assert [m.kickoff.day for m in only.matches] == [31, 1], "in kickoff order"
    first = only.matches[0]
    assert (first.home.code, first.home.name, first.away.name) == ("FCB", "Barcelona", "Real Madrid CF")
    assert first.home.crest == "https://crests.football-data.org/81.png"
    assert only.first == first.kickoff
