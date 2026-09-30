"""How likely three sources said each player was to start, written down before the lock and settled by what happened."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import Any

import pytest

from app.models import ReadModel
from app.sorare import projection, starts
from app.sources import futbolfantasy
from tests.test_pipeline import db  # noqa: F401  (fixture)
from tests.test_sorare_publish import snapshot

LOCK = datetime(2026, 10, 9, 14, tzinfo=UTC)  # the fixture's planned gameweek opens (and locks) then


def chance(slug: str, team: str, value: float) -> futbolfantasy.Chance:
    return futbolfantasy.Chance(
        team=team,
        slug=slug,
        name=slug.replace("-", " ").title(),
        chance=value,
        international=False,
        lesion=-1,
        suspended=False,
    )


def round_8() -> projection.Round:
    """LaLiga round 8 around the fixture's plan week: the cards' game is on 10 October."""
    side = projection.Side("FCB", "Club A", None)
    other = projection.Side("RMA", "Club Z", None)
    match = projection.Match(id="m1", kickoff=datetime(2026, 10, 10, 14, tzinfo=UTC), home=side, away=other)
    return projection.Round(8, (match,))


# --------------------------------------------------------------------------- the rows a run writes
def test_a_player_gets_a_row_for_each_source_that_has_a_number_for_him() -> None:
    ff = futbolfantasy.Snapshot(round=8, chances=[chance("mid-one", "Club A", 0.7)])
    rows = starts.rows(snapshot(), ff, [round_8()])

    by_source = {r.source: r for r in rows if r.player == "mid-one"}
    assert set(by_source) == {"sorare", "sofix", "futbolfantasy"}
    assert by_source["sorare"].chance == pytest.approx(0.9)  # Sorare's starter odds: 9000 basis points in the fixture
    assert by_source["futbolfantasy"].chance == 0.7
    assert 0 < by_source["sofix"].chance <= 1
    assert all(r.lock == LOCK and r.gameweek == "gw-plan" for r in rows)


def test_the_apps_own_chance_does_not_borrow_sorares() -> None:
    rows = starts.rows(snapshot(), None, [])
    mine = {r.player: r.chance for r in rows if r.source == "sofix"}
    theirs = {r.player: r.chance for r in rows if r.source == "sorare"}
    assert mine and theirs
    assert all(mine[p] != pytest.approx(theirs[p]) for p in mine), "from form alone it is not Sorare's 90%"


def test_a_player_with_no_game_in_the_week_has_no_row() -> None:
    snap = snapshot()
    for row in snap["cards"]:
        if row["player"]["slug"] == "front-one":
            row["player"]["plan"] = []
    players = {r.player for r in starts.rows(snap, None, [])}
    assert "front-one" not in players and "mid-one" in players


def test_futbol_fantasys_chance_is_only_kept_for_the_round_it_is_about() -> None:
    ff = futbolfantasy.Snapshot(round=8, chances=[chance("mid-one", "Club A", 0.7)])
    assert any(r.source == "futbolfantasy" for r in starts.rows(snapshot(), ff, [round_8()]))
    # The round it names is not one the calendar knows, or his game is on another day than that round: no row.
    assert not any(r.source == "futbolfantasy" for r in starts.rows(snapshot(), ff, []))
    wrong = futbolfantasy.Snapshot(round=9, chances=ff.chances)
    assert not any(r.source == "futbolfantasy" for r in starts.rows(snapshot(), wrong, [round_8()]))
    assert not any(
        r.source == "futbolfantasy"
        for r in starts.rows(snapshot(), futbolfantasy.Snapshot(round=None, chances=ff.chances), [round_8()])
    )


def test_a_player_the_site_lists_twice_or_names_differently_is_not_guessed() -> None:
    ff = futbolfantasy.Snapshot(round=8, chances=[chance("someone-else", "Club A", 0.9)])
    assert not any(r.source == "futbolfantasy" for r in starts.rows(snapshot(), ff, [round_8()]))


# --------------------------------------------------------------------------- written before the lock, frozen at it
def fresh(chance_value: float = 0.6, source: str = "sorare", player: str = "p1") -> starts.Row:
    return starts.Row(player=player, gameweek="gw-x", source=source, chance=chance_value, lock=LOCK)


def weeks(db) -> dict[str, Any]:  # noqa: F811
    row = db.get(ReadModel, starts.START_KEY)
    return row.payload["weeks"] if row else {}


def test_a_run_writes_the_rows_and_a_later_run_before_the_lock_takes_the_newer_number(db) -> None:  # noqa: F811
    early = LOCK - timedelta(days=2)
    assert starts.save(db, [fresh(0.6), fresh(0.4, "sofix")], early) == {"written": 2, "frozen": 0}
    assert starts.save(db, [fresh(0.85)], early + timedelta(hours=8)) == {"written": 1, "frozen": 0}

    player = weeks(db)["gw-x"]["players"]["p1"]
    assert player["sorare"] == {"chance": 0.85, "at": (early + timedelta(hours=8)).isoformat()}
    assert player["sofix"]["chance"] == 0.4
    assert weeks(db)["gw-x"]["lock"] == LOCK.isoformat()
    assert len(weeks(db)["gw-x"]["players"]) == 1, "the same player, week and source is one entry"


def test_once_the_week_has_locked_what_was_said_stays_as_it_was(db) -> None:  # noqa: F811
    starts.save(db, [fresh(0.6)], LOCK - timedelta(hours=3))
    result = starts.save(db, [fresh(0.05)], LOCK + timedelta(hours=1))
    assert result == {"written": 0, "frozen": 1}
    assert weeks(db)["gw-x"]["players"]["p1"]["sorare"]["chance"] == 0.6, "after the team news it is not what was said"


def test_a_row_first_seen_after_the_lock_is_not_made_up_afterwards(db) -> None:  # noqa: F811
    assert starts.save(db, [fresh(0.6)], LOCK + timedelta(hours=1)) == {"written": 0, "frozen": 0}
    assert weeks(db) == {}


# --------------------------------------------------------------------------- settled by what happened
def past_snapshot(started: bool | None, *, end_hours_ago: float = 30) -> dict[str, Any]:
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
                "gameId": "g",
                "score": 40.0,
                "played": played,
                "started": bool(started),
                "status": "FINAL",
            },
        ],
        "p2": [],
    }
    return snap


def test_what_happened_fills_in_whether_he_started_once_the_scores_are_final(db) -> None:  # noqa: F811
    snap = past_snapshot(True)
    starts.save(
        db,
        [starts.Row("p1", "gw-past", "sorare", 0.7, LOCK), starts.Row("p2", "gw-past", "sorare", 0.5, LOCK)],
        LOCK - timedelta(days=30),
    )
    assert starts.settle(db, snap) == {"settled": 1}
    players = weeks(db)["gw-past"]["players"]
    assert players["p1"]["started"] is True
    assert "started" not in players["p2"], "no history for p2: left open rather than guessed"


def test_a_player_who_did_not_play_did_not_start(db) -> None:  # noqa: F811
    starts.save(db, [starts.Row("p1", "gw-past", "sorare", 0.7, LOCK)], LOCK - timedelta(days=30))
    snap = past_snapshot(None)
    snap["history"]["p1"] = [
        {
            "date": "2026-09-19T14:00:00+00:00",
            "competition": "laliga-es",
            "gameId": "g",
            "score": 0.0,
            "played": False,
            "started": False,
            "status": "DID_NOT_PLAY",
        }
    ]
    assert starts.settle(db, snap) == {"settled": 1}
    assert weeks(db)["gw-past"]["players"]["p1"]["started"] is False


def test_nothing_is_settled_while_scores_can_still_move(db) -> None:  # noqa: F811
    starts.save(db, [starts.Row("p1", "gw-past", "sorare", 0.7, LOCK)], LOCK - timedelta(days=30))
    assert starts.settle(db, past_snapshot(True, end_hours_ago=5)) == {"settled": 0}
    assert "started" not in weeks(db)["gw-past"]["players"]["p1"]


def test_a_row_already_settled_is_left_alone(db) -> None:  # noqa: F811
    starts.save(db, [starts.Row("p1", "gw-past", "sorare", 0.7, LOCK)], LOCK - timedelta(days=30))
    starts.settle(db, past_snapshot(True))
    assert starts.settle(db, past_snapshot(False)) == {"settled": 0}
    assert weeks(db)["gw-past"]["players"]["p1"]["started"] is True


# --------------------------------------------------------------------------- which source to trust
def entry(started: bool | None, **sources: float) -> dict[str, Any]:
    made = {name: {"chance": value, "at": LOCK.isoformat()} for name, value in sources.items()}
    return {**made, **({} if started is None else {"started": started})}


def test_each_source_is_scored_on_the_same_players_it_had_a_number_for() -> None:
    payload = {
        "weeks": {
            "g1": {
                "lock": LOCK.isoformat(),
                "players": {
                    "a": entry(True, sorare=0.9, sofix=0.5),
                    "b": entry(True, sorare=0.9, sofix=0.5),
                    "c": entry(False, sorare=0.8),
                    "d": entry(None, sorare=0.7),  # not settled yet: not counted
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


def test_no_settled_rows_is_an_empty_comparison_not_an_error() -> None:
    assert starts.compare({}) == {}
    assert starts.compare({"weeks": {}}) == {}


# --------------------------------------------------------------------------- the site is asked only every few hours
def snapshot_of(round_number: int = 8) -> futbolfantasy.Snapshot:
    return futbolfantasy.Snapshot(round=round_number, chances=[chance("mid-one", "Club A", 0.7)])


def test_the_site_is_asked_at_most_every_six_hours_and_its_answer_kept_between(db) -> None:  # noqa: F811
    asked: list[int] = []

    def fetch() -> futbolfantasy.Snapshot:
        asked.append(1)
        return snapshot_of()

    first = NOW = LOCK - timedelta(days=2)
    assert starts.chances(db, first, LOCK, fetch=fetch) is not None
    again = starts.chances(db, first + timedelta(hours=5), LOCK, fetch=fetch)
    assert len(asked) == 1, "five hours later it is not asked again"
    assert again is not None and again.round == 8 and again.chances[0].slug == "mid-one"
    starts.chances(db, NOW + timedelta(hours=7), LOCK, fetch=fetch)
    assert len(asked) == 2


def test_as_the_lock_gets_close_it_is_asked_more_often_because_the_team_news_is_what_counts(db) -> None:  # noqa: F811
    asked: list[int] = []

    def fetch() -> futbolfantasy.Snapshot:
        asked.append(1)
        return snapshot_of()

    near = LOCK - timedelta(hours=2)
    starts.chances(db, near, LOCK, fetch=fetch)
    starts.chances(db, near + timedelta(minutes=30), LOCK, fetch=fetch)
    assert len(asked) == 1
    starts.chances(db, near + timedelta(minutes=50), LOCK, fetch=fetch)
    assert len(asked) == 2


def test_a_page_that_cannot_be_read_gives_nothing_and_never_an_old_answer_in_its_place(db) -> None:  # noqa: F811
    starts.chances(db, LOCK - timedelta(days=2), LOCK, fetch=lambda: snapshot_of())
    later = LOCK - timedelta(days=2) + timedelta(hours=7)
    assert starts.chances(db, later, LOCK, fetch=lambda: None) is None
    assert starts.chances(db, later, LOCK, fetch=lambda: futbolfantasy.Snapshot(round=8, chances=[])) is None


def test_a_dry_run_asks_but_remembers_nothing(db) -> None:  # noqa: F811
    assert starts.chances(db, LOCK - timedelta(days=2), LOCK, fetch=snapshot_of, write=False) is not None
    assert db.get(ReadModel, starts.FF_KEY) is None


# --------------------------------------------------------------------------- the job writes it down
class _Client:
    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return None


@pytest.fixture()
def the_job(db, monkeypatch):  # noqa: F811
    from app.jobs import sorare as sorare_job

    monkeypatch.delenv("GITHUB_ACTIONS", raising=False)
    monkeypatch.setattr(sorare_job.settings, "sorare_api_key", "test-key")
    monkeypatch.setattr(sorare_job, "SorareClient", lambda *a, **k: _Client())
    monkeypatch.setattr(sorare_job.sorare_sync, "snapshot", lambda *a, **k: snapshot())
    monkeypatch.setattr(sorare_job.understat, "fetch_leagues", lambda *a, **k: {})
    monkeypatch.setattr(sorare_job.projection, "calendar", lambda db, now: [round_8()])
    return sorare_job


def test_the_job_writes_each_sources_chance_and_asks_the_site_only_once_in_a_while(db, monkeypatch, the_job) -> None:  # noqa: F811
    asked: list[int] = []

    def fetch() -> futbolfantasy.Snapshot:
        asked.append(1)
        return snapshot_of()

    monkeypatch.setattr(futbolfantasy, "fetch_all", fetch)

    summary = the_job.run(db, "yares", runs=1)

    assert summary["futbolfantasy"] == 1 and summary["starts"]["written"] >= 3
    players = weeks(db)["gw-plan"]["players"]
    assert set(players["mid-one"]) >= {"sorare", "sofix", "futbolfantasy"}
    assert players["mid-one"]["futbolfantasy"]["chance"] == 0.7
    assert "futbolfantasy" not in players["back-one"], "the site had nothing on him"

    the_job.run(db, "yares", runs=1)
    assert len(asked) == 1, "the second run, straight after, reuses the page it already read"


def test_a_dry_run_reads_the_site_but_writes_nothing(db, monkeypatch, the_job) -> None:  # noqa: F811
    monkeypatch.setattr(futbolfantasy, "fetch_all", lambda *a, **k: snapshot_of())
    summary = the_job.run(db, "yares", runs=1, dry_run=True)
    assert summary["dryRun"] is True and summary["futbolfantasy"] == 1
    assert db.get(ReadModel, starts.START_KEY) is None and db.get(ReadModel, starts.FF_KEY) is None


def test_when_the_site_cannot_be_read_the_other_two_sources_are_still_written(db, the_job) -> None:  # noqa: F811
    summary = the_job.run(db, "yares", runs=1)  # the test guard answers None, as a failed read does
    assert summary["futbolfantasy"] == 0
    players = weeks(db)["gw-plan"]["players"]
    assert set(players["mid-one"]) == {"sorare", "sofix"}


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
