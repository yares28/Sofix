"""How likely three sources said each player was to start each game, written down before the lock and settled by what happened."""

# ruff: noqa: F811  (the `db` fixture is used by importing it)
from __future__ import annotations

import dataclasses
import re
from datetime import UTC, datetime, timedelta
from typing import Any

import pytest

from app.models import ReadModel
from app.sorare import ff_feed, starts
from app.sorare.forecast import GameStart
from app.sources import futbolfantasy_matches as ffm
from tests.test_ff_link import match, player, side
from tests.test_pipeline import db  # noqa: F401  (fixture)
from tests.test_sorare_publish import snapshot

LOCK = datetime(2026, 10, 9, 14, tzinfo=UTC)  # the fixture's planned gameweek opens (and locks) then
READ = datetime(2026, 10, 7, 9, tzinfo=UTC)  # when Futbol Fantasy's page was read


def told(slug: str, games: list[dict[str, Any]]) -> list[GameStart]:
    """Futbol Fantasy's chance for "mid-one"'s game, as `ff_use.Lineups.starts` would answer."""
    if slug != "mid-one":
        return []
    return [GameStart(games[0]["id"], 0.7, info={"startAt": READ.isoformat()})]


# --------------------------------------------------------------------------- the rows a run writes
def test_a_game_gets_a_row_for_each_source_that_has_a_number_for_it() -> None:
    rows = starts.rows(snapshot(), told)

    by_source = {r.source: r for r in rows if r.player == "mid-one"}
    assert set(by_source) == {"sorare", "sofix", "futbolfantasy"}
    assert by_source["sorare"].chance == pytest.approx(0.9)  # Sorare's starter odds: 9000 basis points in the fixture
    assert by_source["futbolfantasy"].chance == 0.7 and by_source["futbolfantasy"].at == READ
    assert 0 < by_source["sofix"].chance <= 1
    assert all(
        r.lock == LOCK and r.gameweek == "gw-plan" and r.game == "game-mid-one" for r in rows if r.player == "mid-one"
    )


def test_a_player_the_site_has_nothing_on_has_no_row_from_it() -> None:
    rows = starts.rows(snapshot(), told)

    assert not any(r.source == "futbolfantasy" and r.player != "mid-one" for r in rows)
    assert not any(r.source == "futbolfantasy" for r in starts.rows(snapshot()))


def test_the_apps_own_chance_does_not_borrow_sorares() -> None:
    rows = starts.rows(snapshot())
    mine = {r.player: r.chance for r in rows if r.source == "sofix"}
    theirs = {r.player: r.chance for r in rows if r.source == "sorare"}
    assert mine and theirs
    assert all(mine[p] != pytest.approx(theirs[p]) for p in mine), "from form alone it is not Sorare's 90%"


def test_a_player_with_no_game_in_the_week_has_no_row() -> None:
    snap = snapshot()
    for row in snap["cards"]:
        if row["player"]["slug"] == "front-one":
            row["player"]["plan"] = []
    players = {r.player for r in starts.rows(snap)}
    assert "front-one" not in players and "mid-one" in players


def test_two_games_are_two_rows_with_sorares_odds_on_the_first_only() -> None:
    snap = snapshot()
    for row in snap["cards"]:
        if row["player"]["slug"] == "mid-one":
            first, second = dict(row["player"]["plan"][0]), dict(row["player"]["plan"][0])
            first["id"], second["id"] = "game-1", "game-2"
            second["date"] = "2026-10-12T19:00:00Z"
            row["player"]["plan"] = [second, first]  # not in order: the first is found by its kickoff

    def both(slug: str, games: list[dict[str, Any]]) -> list[GameStart]:
        return [GameStart("game-2", 0.4, info={"startAt": READ.isoformat()})] if slug == "mid-one" else []

    rows = [r for r in starts.rows(snap, both) if r.player == "mid-one"]

    assert {(r.game, r.source) for r in rows} == {
        ("game-1", "sorare"),
        ("game-1", "sofix"),
        ("game-2", "sofix"),
        ("game-2", "futbolfantasy"),
    }


# --------------------------------------------------------------------------- written before the lock, frozen at it
def fresh(chance_value: float = 0.6, source: str = "sorare", player_: str = "p1", game: str = "g1") -> starts.Row:
    return starts.Row(player=player_, gameweek="gw-x", game=game, source=source, chance=chance_value, lock=LOCK)


def weeks(db) -> dict[str, Any]:
    row = db.get(ReadModel, starts.START_KEY)
    return row.payload["weeks"] if row else {}


def game_of(db, player_: str = "p1", game: str = "g1", week: str = "gw-x") -> dict[str, Any]:
    return weeks(db)[week]["players"][player_]["games"][game]


def test_a_run_writes_the_rows_and_a_later_run_before_the_lock_takes_the_newer_number(db) -> None:
    early = LOCK - timedelta(days=2)
    assert starts.save(db, [fresh(0.6), fresh(0.4, "sofix")], early) == {"written": 2, "frozen": 0}
    assert starts.save(db, [fresh(0.85)], early + timedelta(hours=8)) == {"written": 1, "frozen": 0}

    assert game_of(db)["sorare"] == {"chance": 0.85, "at": (early + timedelta(hours=8)).isoformat()}
    assert game_of(db)["sofix"]["chance"] == 0.4
    assert weeks(db)["gw-x"]["lock"] == LOCK.isoformat()
    assert len(weeks(db)["gw-x"]["players"]) == 1, "the same player, game and source is one entry"


def test_each_game_of_a_player_is_its_own_entry_and_a_sources_own_reading_time_is_kept(db) -> None:
    now = LOCK - timedelta(hours=1)
    one = starts.Row("p1", "gw-x", "g1", "futbolfantasy", 0.9, LOCK, at=READ)
    two = starts.Row("p1", "gw-x", "g2", "futbolfantasy", 0.2, LOCK, at=READ - timedelta(hours=3))
    starts.save(db, [one, two], now)

    assert game_of(db, game="g1")["futbolfantasy"] == {"chance": 0.9, "at": READ.isoformat()}
    assert game_of(db, game="g2")["futbolfantasy"]["chance"] == 0.2
    assert game_of(db, game="g2")["futbolfantasy"]["at"] == (READ - timedelta(hours=3)).isoformat()


def test_once_the_week_has_locked_what_was_said_stays_as_it_was(db) -> None:
    starts.save(db, [fresh(0.6)], LOCK - timedelta(hours=3))
    result = starts.save(db, [fresh(0.05)], LOCK + timedelta(hours=1))
    assert result == {"written": 0, "frozen": 1}
    assert game_of(db)["sorare"]["chance"] == 0.6, "after the team news it is not what was said"


def test_a_row_first_seen_after_the_lock_is_not_made_up_afterwards(db) -> None:
    assert starts.save(db, [fresh(0.6)], LOCK + timedelta(hours=1)) == {"written": 0, "frozen": 0}
    assert weeks(db) == {}


# --------------------------------------------------------------------------- settled by what happened
def past_snapshot(started: bool | None, *, end_hours_ago: float = 30, game: str = "g") -> dict[str, Any]:
    snap = snapshot()
    week = snap["pastGameweek"]
    end = datetime.fromisoformat(week["end"])
    snap["fetchedAt"] = (end + timedelta(hours=end_hours_ago)).isoformat()
    played = started is not None
    snap["history"] = {
        "p1": [
            {
                "date": "2026-09-19T14:00:00+00:00",
                "competition": "laliga-es",
                "gameId": game,
                "score": 40.0,
                "played": played,
                "started": bool(started),
                "status": "FINAL",
            },
        ],
        "p2": [],
    }
    return snap


def row_past(player_: str, game: str = "g") -> starts.Row:
    return starts.Row(player_, "gw-past", game, "sorare", 0.7, LOCK)


def test_what_happened_fills_in_whether_he_started_the_game_once_the_scores_are_final(db) -> None:
    starts.save(db, [row_past("p1"), row_past("p2")], LOCK - timedelta(days=30))

    assert starts.settle(db, past_snapshot(True)) == {"settled": 1}
    assert game_of(db, "p1", "g", "gw-past")["started"] is True
    assert "started" not in game_of(db, "p2", "g", "gw-past"), "no result for p2: left open rather than guessed"


def test_a_double_gameweek_is_settled_game_by_game(db) -> None:
    starts.save(db, [row_past("p1", "g"), row_past("p1", "h")], LOCK - timedelta(days=30))
    snap = past_snapshot(True)
    snap["history"]["p1"].append(
        {**snap["history"]["p1"][0], "gameId": "h", "started": False, "date": "2026-09-21T19:00:00+00:00"}
    )

    assert starts.settle(db, snap) == {"settled": 2}
    assert game_of(db, "p1", "g", "gw-past")["started"] is True
    assert game_of(db, "p1", "h", "gw-past")["started"] is False, "he came on in the second: not a start"


def test_a_player_who_did_not_play_did_not_start(db) -> None:
    starts.save(db, [row_past("p1")], LOCK - timedelta(days=30))
    snap = past_snapshot(None)
    snap["history"]["p1"][0].update(score=0.0, status="DID_NOT_PLAY")

    assert starts.settle(db, snap) == {"settled": 1}
    assert game_of(db, "p1", "g", "gw-past")["started"] is False


def test_a_game_still_to_be_scored_is_left_open(db) -> None:
    starts.save(db, [row_past("p1")], LOCK - timedelta(days=30))
    snap = past_snapshot(True)
    snap["history"]["p1"][0]["status"] = "PENDING"

    assert starts.settle(db, snap) == {"settled": 0}


def test_nothing_is_settled_while_scores_can_still_move(db) -> None:
    starts.save(db, [row_past("p1")], LOCK - timedelta(days=30))
    assert starts.settle(db, past_snapshot(True, end_hours_ago=5)) == {"settled": 0}
    assert "started" not in game_of(db, "p1", "g", "gw-past")


def test_a_game_already_settled_is_left_alone(db) -> None:
    starts.save(db, [row_past("p1")], LOCK - timedelta(days=30))
    starts.settle(db, past_snapshot(True))
    assert starts.settle(db, past_snapshot(False)) == {"settled": 0}
    assert game_of(db, "p1", "g", "gw-past")["started"] is True


def test_entries_written_before_games_were_told_apart_are_still_settled_over_the_weeks_days(db) -> None:
    old = {"weeks": {"gw-past": {"lock": LOCK.isoformat(), "players": {"p1": {"sorare": {"chance": 0.7, "at": "x"}}}}}}
    db.add(ReadModel(key=starts.START_KEY, payload=old, updated_at=LOCK))
    db.commit()

    assert starts.settle(db, past_snapshot(True)) == {"settled": 1}
    assert weeks(db)["gw-past"]["players"]["p1"]["started"] is True


# --------------------------------------------------------------------------- which source to trust
def said(started: bool | None, **sources: float) -> dict[str, Any]:
    made = {name: {"chance": value, "at": LOCK.isoformat()} for name, value in sources.items()}
    return {**made, **({} if started is None else {"started": started})}


def test_each_source_is_scored_on_the_same_games_it_had_a_number_for() -> None:
    payload = {
        "weeks": {
            "g1": {
                "lock": LOCK.isoformat(),
                "players": {
                    "a": {"games": {"1": said(True, sorare=0.9, sofix=0.5)}},
                    "b": {"games": {"1": said(True, sorare=0.9, sofix=0.5)}},
                    "c": {"games": {"1": said(False, sorare=0.8)}},
                    "d": {"games": {"1": said(None, sorare=0.7)}},  # not settled yet: not counted
                },
            }
        }
    }
    scores = starts.compare(payload)

    assert scores["sorare"]["n"] == 3
    assert scores["sorare"]["brier"] == pytest.approx((0.01 + 0.01 + 0.64) / 3)
    assert scores["sorare"]["right"] == pytest.approx(2 / 3), "called at 50%: two of the three were right"
    assert scores["sorare"]["mean"] == pytest.approx((0.9 + 0.9 + 0.8) / 3)
    assert scores["sofix"] == {
        "n": 2,
        "brier": pytest.approx(0.25),
        "right": pytest.approx(1.0),
        "mean": pytest.approx(0.5),
    }
    assert "futbolfantasy" not in scores


def test_two_games_of_one_player_count_twice_and_the_older_entries_count_once() -> None:
    payload = {
        "weeks": {
            "g1": {"players": {"a": {"games": {"1": said(True, sorare=0.9), "2": said(False, sorare=0.9)}}}},
            "g0": {"players": {"b": said(True, sorare=0.6)}},
        }
    }

    assert starts.compare(payload)["sorare"]["n"] == 3


def test_no_settled_rows_is_an_empty_comparison_not_an_error() -> None:
    assert starts.compare({}) == {}
    assert starts.compare({"weeks": {}}) == {}


# --------------------------------------------------------------------------- the job writes it down
class _Client:
    """Sorare as the job sees it here: the snapshot is faked, so what it is asked is only the card art (a squad, then cards)."""

    roster: list[dict[str, Any]] = []
    pictures: dict[str, str] = {}

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return None

    def query(self, text: str, variables: dict[str, Any] | None = None) -> dict[str, Any]:
        if "nodes { slug }" in text:
            return {"football": {"competition": {"clubs": {"nodes": [{"slug": "club-a"}] if self.roster else []}}}}
        if "activePlayers" in text:
            return {"football": {"club": {"activePlayers": {"pageInfo": {"hasNextPage": False}, "nodes": self.roster}}}}
        slugs = re.findall(r'(p\d+): allCards\(playerSlugs: \["([a-z0-9-]+)"\]', text)
        return {"football": {alias: {"nodes": [{"pictureUrl": self.pictures[slug]}] if slug in self.pictures else []} for alias, slug in slugs}}


def the_match() -> ffm.Match:
    """Futbol Fantasy's page for the fixture's game: Club A at home to Club Z on the 10th, "Mid One" at 70%."""
    mid = dataclasses.replace(player("1", "Mid One", age=29), chance=0.7)
    home = side("Club A", "901", xi=(mid, player("2", "Back One", age=29)))
    away = side("Club Z", "902", xi=(player("3", "Their Nine"),))
    return match(home, away, datetime(2026, 10, 10, 14, tzinfo=UTC), 501)


class Site:
    """Stands in for the site: answers with the matches it is given, and counts how often it is asked."""

    def __init__(self, matches: list[ffm.Match] | None = None) -> None:
        self.matches = matches if matches is not None else [the_match()]
        self.asked = 0
        self.read: list[list[int]] = []  # the matches each question was for

    def __call__(self, wanted: Any, competitions: Any, now: datetime | None = None, **_: Any) -> ffm.Reading:
        self.asked += 1
        picked = [m for m in self.matches if wanted(m.competition, _round(m))]
        self.read.append([m.match_id for m in picked])
        return ffm.Reading(at=now or READ, matches=picked)


def _round(m: ffm.Match) -> ffm.RoundMatch:
    return ffm.RoundMatch(m.match_id, m.url, m.home.name, m.away.name, m.home.club_id, m.away.club_id, m.kickoff)


@pytest.fixture()
def the_job(db, monkeypatch):
    from app.jobs import sorare as sorare_job

    monkeypatch.delenv("GITHUB_ACTIONS", raising=False)
    monkeypatch.setattr(sorare_job.settings, "sorare_api_key", "test-key")
    monkeypatch.setattr(sorare_job, "SorareClient", lambda *a, **k: _Client())
    monkeypatch.setattr(sorare_job.sorare_sync, "snapshot", lambda *a, **k: snapshot())
    monkeypatch.setattr(sorare_job.understat, "fetch_leagues", lambda *a, **k: {})
    monkeypatch.setattr(sorare_job.projection, "calendar", lambda db, now: [])
    return sorare_job


def page_of(db) -> dict[str, Any]:
    from app.sorare import publish

    row = db.get(ReadModel, "sorare")
    assert row is not None
    week = publish.week_of(dict(row.payload))
    assert week is not None
    return week


def test_the_job_reads_the_site_before_planning_and_the_page_carries_its_chance(db, monkeypatch, the_job) -> None:
    site = Site()
    monkeypatch.setattr(ffm, "read_matches", site)

    summary = the_job.run(db, "yares", runs=1)

    mid = {p["player"]: p for p in page_of(db)["playing"]["players"]}["mid-one"]
    assert mid["games"][0]["pStart"] == 0.7 and mid["games"][0]["startSource"] == "futbolfantasy"
    assert mid["games"][0]["ffMatch"]["id"] == 501 and mid["pStart"] == 0.7
    assert summary["futbolfantasy"]["read"] == 1 and summary["futbolfantasy"]["games"] >= 1
    assert summary["futbolfantasy"]["linked"] >= 1 and "failed" not in summary
    odds = summary["sorareOdds"]
    assert odds["players"] >= 12 and odds["withOdds"] == odds["players"], "every fixture player has Sorare's odds"


def test_the_job_writes_each_sources_chance_for_each_game_and_asks_the_site_only_once_in_a_while(
    db, monkeypatch, the_job
) -> None:
    site = Site()
    monkeypatch.setattr(ffm, "read_matches", site)

    summary = the_job.run(db, "yares", runs=1)

    assert summary["starts"]["written"] >= 3
    game = game_of(db, "mid-one", "game-mid-one", "gw-plan")
    assert set(game) >= {"sorare", "sofix", "futbolfantasy"} and game["futbolfantasy"]["chance"] == 0.7
    assert "futbolfantasy" not in game_of(db, "front-one", "game-front-one", "gw-plan"), "the site had nothing on him"

    the_job.run(db, "yares", runs=1)
    assert site.read == [[501], []], (
        "the second run, straight after, finds the match read a moment ago and asks for no page"
    )
    assert len(ff_feed.load(db).matches) == 1


def test_a_dry_run_reads_the_site_but_writes_nothing(db, monkeypatch, the_job) -> None:
    site = Site()
    monkeypatch.setattr(ffm, "read_matches", site)

    summary = the_job.run(db, "yares", runs=1, dry_run=True)

    assert summary["dryRun"] is True and summary["futbolfantasy"]["read"] == 1 and site.asked == 1
    assert db.get(ReadModel, starts.START_KEY) is None and db.get(ReadModel, ff_feed.STORE_KEY) is None
    assert db.get(ReadModel, "ff_links") is None


def test_when_the_site_cannot_be_read_the_page_and_the_other_two_sources_are_still_written(db, the_job) -> None:
    summary = the_job.run(db, "yares", runs=1)  # the test guard answers with nothing, as a failed read does

    assert summary["futbolfantasy"]["matches"] == 0 and summary["futbolfantasy"]["games"] == 0
    game = game_of(db, "mid-one", "game-mid-one", "gw-plan")
    assert set(game) == {"sorare", "sofix"}
    assert "startSource" not in {p["player"]: p for p in page_of(db)["playing"]["players"]}["mid-one"]["games"][0]


def test_a_site_that_breaks_costs_its_numbers_never_the_page(db, monkeypatch, the_job) -> None:
    def boom(*args: Any, **kwargs: Any) -> ffm.Reading:
        raise RuntimeError("the site changed")

    monkeypatch.setattr(ffm, "read_matches", boom)

    summary = the_job.run(db, "yares", runs=1)

    assert "RuntimeError" in summary["failed"]["futbol fantasy"]
    assert db.get(ReadModel, the_job.SORARE_KEY) is not None, "the page was published"
    assert set(game_of(db, "mid-one", "game-mid-one", "gw-plan")) == {"sorare", "sofix"}


def test_a_site_that_breaks_still_leaves_the_last_reading_to_be_used_for_a_day(db, monkeypatch, the_job) -> None:
    monkeypatch.setattr(ffm, "read_matches", Site())
    the_job.run(db, "yares", runs=1)
    monkeypatch.setattr(ffm, "read_matches", lambda *a, **k: (_ for _ in ()).throw(RuntimeError("down")))

    the_job.run(db, "yares", runs=1)

    mid = {p["player"]: p for p in page_of(db)["playing"]["players"]}["mid-one"]
    assert mid["games"][0]["startSource"] == "futbolfantasy", "yesterday's reading is better than none, up to a day"


def test_the_links_found_are_remembered_between_runs(db, monkeypatch, the_job) -> None:
    monkeypatch.setattr(ffm, "read_matches", Site())
    the_job.run(db, "yares", runs=1)

    row = db.get(ReadModel, "ff_links")
    assert row is not None and row.payload["links"]["mid-one"]["ffId"] == "1"


def test_the_report_puts_the_best_source_first_and_says_when_there_is_too_little_to_tell() -> None:
    from app.jobs import starts as report

    text = report.table(
        {
            "sorare": {"n": 120, "brier": 0.131, "right": 0.81, "mean": 0.72},
            "futbolfantasy": {"n": 30, "brier": 0.099, "right": 0.9, "mean": 0.7},
        }
    )
    lines = text.splitlines()
    assert lines[1].startswith("futbolfantasy") and lines[2].startswith("sorare")
    assert "0.099" in lines[1] and "90%" in lines[1]
    assert "Fewer than 100 players for futbolfantasy" in text
    assert report.table({}) == "Nothing is settled yet: a gameweek is scored a day after it ends."


def test_the_job_publishes_the_lineups_page_and_the_homes_team_news(db, monkeypatch, the_job) -> None:
    monkeypatch.setattr(ffm, "read_matches", Site())

    summary = the_job.run(db, "yares", runs=1)

    lineups = db.get(ReadModel, "lineups")
    assert lineups is not None and [m["id"] for m in lineups.payload["matches"]] == [501]
    assert summary["lineupsPage"]["matches"] == 1
    news = page_of(db)["teamNews"]
    assert news["players"] >= 1 and news["split"]["likely"] >= 1 and news["moved"] is None, "no reading a day old yet"
    assert summary["teamNews"]["players"] == news["players"]
    kept = db.get(ReadModel, "ff_chances")
    assert kept is not None and len(kept.payload["readings"]) == 1
    assert db.get(ReadModel, "ff_positions") is not None


def test_the_job_reads_the_squad_pages_once_a_week_and_keeps_where_everyone_plays(db, monkeypatch, the_job) -> None:
    from app.sorare import ff_lineups

    home = ffm.Side(
        **{**side("Real Sociedad", "16", xi=(player("1", "One", keeper=True),)).__dict__, "slug": "real-sociedad"}
    )
    away = ffm.Side(**{**side("Getafe", "8").__dict__, "slug": "getafe"})
    monkeypatch.setattr(ffm, "read_matches", Site([match(home, away, datetime(2026, 10, 10, 14, tzinfo=UTC), 502)]))
    asked: list[dict[str, str]] = []

    def squads(clubs: Any, now: datetime | None = None, **_: Any) -> ffm.SquadReading:
        asked.append(dict(clubs))
        member = ffm.SquadMember("99", "Suplente Uno", "suplente-uno", "MID")
        return ffm.SquadReading(at=now or READ, squads={club: ffm.Squad(club, (member,)) for club in clubs})

    monkeypatch.setattr(ffm, "read_squads", squads)

    summary = the_job.run(db, "yares", runs=1)
    the_job.run(db, "yares", runs=1)

    assert asked == [{"16": "real-sociedad", "8": "getafe"}], "a week apart, not every run"
    assert summary["lineupsPage"]["squads"] == 2
    kept = ff_lineups.load_memory(db)
    assert kept.positions["99"] == "MID" and kept.positions["1"] == "GK" and set(kept.squads) == {"16", "8"}


def test_a_second_run_soon_after_keeps_the_one_reading_to_compare_with(db, monkeypatch, the_job) -> None:
    monkeypatch.setattr(ffm, "read_matches", Site())

    the_job.run(db, "yares", runs=1)
    the_job.run(db, "yares", runs=1)

    assert len(db.get(ReadModel, "ff_chances").payload["readings"]) == 1


def test_a_dry_run_builds_the_news_and_the_page_but_writes_neither(db, monkeypatch, the_job) -> None:
    monkeypatch.setattr(ffm, "read_matches", Site())

    summary = the_job.run(db, "yares", runs=1, dry_run=True)

    assert summary["lineupsPage"]["matches"] == 1 and summary["teamNews"]["players"] >= 1
    for key in ("lineups", "ff_chances", "ff_positions"):
        assert db.get(ReadModel, key) is None, key


def test_with_no_site_there_is_no_lineups_page_and_no_news(db, the_job) -> None:
    summary = the_job.run(db, "yares", runs=1)

    assert summary["teamNews"] is None and "teamNews" not in page_of(db)
    assert db.get(ReadModel, "ff_chances") is None


def test_the_lineups_page_carries_a_real_card_for_a_player_the_owner_does_not_have(db, monkeypatch, the_job) -> None:
    monkeypatch.setattr(ffm, "read_matches", Site())
    monkeypatch.setattr(
        _Client,
        "roster",
        [{"slug": "back-one", "displayName": "Back One", "position": "Defender", "birthDay": None, "activeClub": {"slug": "club-a", "name": "Club A", "shortName": "Club A"}}],
    )
    monkeypatch.setattr(_Client, "pictures", {"back-one": "https://assets.sorare.com/card/zzz/picture/back-one.png"})

    summary = the_job.run(db, "yares", runs=1)

    page = db.get(ReadModel, "lineups")
    assert page is not None and page.payload["art"]["2"] == "https://assets.sorare.com/card/zzz/picture/back-one.png"
    assert db.get(ReadModel, "sorare_card_art") is not None and "failed" not in summary


def test_a_card_art_step_that_fails_costs_only_the_cards(db, monkeypatch, the_job) -> None:
    monkeypatch.setattr(ffm, "read_matches", Site())

    def down(self, text, variables=None):
        raise RuntimeError("Sorare is down")

    monkeypatch.setattr(_Client, "query", down)

    summary = the_job.run(db, "yares", runs=1)

    assert set(summary["failed"]) == {"card art"}, "what was kept is read instead, which cannot fail"
    page = db.get(ReadModel, "lineups")
    assert page is not None and page.payload["art"] == {} and page.payload["matches"], "the page is there, without cards for the others"
