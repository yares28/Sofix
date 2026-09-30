"""The best lineups in hindsight: what the planner builds for a played week once it knows every score."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import Any

import pytest

from app.jobs import sorare as sorare_job
from app.sorare import publish
from app.sorare.model import Forecast
from tests.test_pipeline import db  # noqa: F401  (fixture)
from tests.test_sorare_publish import snapshot


@pytest.fixture(autouse=True)
def no_understat(monkeypatch):
    monkeypatch.setattr(sorare_job.understat, "fetch_leagues", lambda *a, **k: {})


@pytest.fixture(scope="module")
def played() -> dict[str, Any]:
    payload = publish.build_payload(snapshot(), runs=4, draws=600)
    week = publish.week_of(payload, "last")
    assert week is not None
    return week


def test_the_oracle_knows_who_played_and_what_he_scored():
    known = {
        "played": Forecast(p_play=0.4, mu=50.0, games=1, actual=71.0),
        "missed": Forecast(p_play=0.9, mu=60.0, games=1, actual=None),
    }
    oracle = publish.hindsight_forecasts(known)
    assert (oracle["played"].p_play, oracle["played"].mu, oracle["played"].actual) == (1.0, 71.0, 71.0)
    assert (oracle["missed"].p_play, oracle["missed"].actual) == (0.0, None)
    assert oracle["played"].sd == 0.0 and oracle["missed"].sd == 0.0, "nothing left to guess"


def test_a_played_week_carries_the_best_lineups_in_hindsight(played):
    hindsight = played["hindsight"]
    assert hindsight["hindsight"] is True
    assert hindsight["lineups"], "the planner finds lineups for the cards that played"
    assert played["plans"][0].get("hindsight") is None, "Sofix's own plans are not it"


def test_in_hindsight_the_expected_score_is_the_real_one(played):
    for lineup in played["hindsight"]["lineups"]:
        assert lineup["x"] == lineup["actual"]["total"], "no spread, so what it expected is what it scored"
        assert lineup["lo"] == lineup["hi"]


def test_hindsight_never_does_worse_than_the_plans_made_without_it(played):
    best = played["hindsight"]["actual"]["essence"]
    assert best >= max(plan["actual"]["essence"] for plan in played["plans"])


def test_hindsight_leaves_rooms_out_because_a_room_depends_on_the_other_nine(played):
    assert all(lineup["group"] != "Room" for lineup in played["hindsight"]["lineups"])


def test_it_uses_each_card_once_and_only_cards_that_played(played):
    slugs = [c["slug"] for lu in played["hindsight"]["lineups"] for c in [*lu["starters"], *lu["subs"]]]
    assert len(slugs) == len(set(slugs))
    for lineup in played["hindsight"]["lineups"]:
        assert all(card["actual"] is not None for card in lineup["starters"]), "nobody who missed the games starts"


def test_a_week_still_to_play_has_no_hindsight():
    payload = publish.build_payload(snapshot(), runs=4, draws=600)
    coming = publish.week_of(payload)
    assert coming is not None and "hindsight" not in coming


def test_in_a_double_gameweek_what_he_scored_is_the_best_of_his_games():
    # Sorare's "best score chosen": a replay and the oracle both read the same number.
    def game(date: str, score: float, played: bool = True) -> dict[str, Any]:
        return {"date": date, "score": score, "played": played, "status": "FINAL", "started": True}

    rows = [{"player": {"slug": "twice", "position": "Midfielder"}}]
    history = {"twice": [game("2026-09-19T18:00:00+00:00", 40.0), game("2026-09-21T18:00:00+00:00", 88.0)]}
    lock = datetime(2026, 9, 18, 14, tzinfo=UTC)
    window = (lock, datetime(2026, 9, 22, 14, tzinfo=UTC))
    weeks = publish.player_weeks(rows, {"twice": [{}, {}]}, history, lock, window, use_sorare=False)
    assert weeks["twice"].actual == 88.0


# --------------------------------------------------------------------------- a finished week is kept, once final
def _later(payload: dict[str, Any], hours: float) -> dict[str, Any]:
    """The same page, as if the run that built it had happened `hours` after the week just played ended."""
    week = publish.week_of(payload, "last")
    assert week is not None
    made = datetime.fromisoformat(week["gameweek"]["end"]) + timedelta(hours=hours)
    return {**payload, "generatedAt": made.isoformat()}


def test_a_replay_is_kept_once_its_scores_are_final_and_not_before():
    payload = publish.build_payload(snapshot(), runs=4, draws=600)
    past = snapshot()["pastGameweek"]
    assert publish.kept_replay(_later(payload, 30), past) is not None
    assert publish.kept_replay(_later(payload, 2), past) is None, "some scores can still move in the first day"
    assert publish.settled_replay({**_later(payload, 30), "version": publish.PAYLOAD_VERSION - 1}) is None
    other = {**past, "slug": "another-week"}
    assert publish.kept_replay(_later(payload, 30), other) is None


def test_a_run_keeps_the_replay_it_already_has_instead_of_planning_it_again():
    previous = _later(publish.build_payload(snapshot(), runs=4, draws=600), 30)
    marked = publish.week_of(previous, "last")
    assert marked is not None
    marked["kept"] = "as it was"
    again = publish.build_payload(snapshot(), runs=4, draws=600, previous=previous)
    assert publish.week_of(again, "last")["kept"] == "as it was"  # type: ignore[index]


def test_only_a_week_with_final_scores_goes_to_the_archive():
    payload = publish.build_payload(snapshot(), runs=4, draws=600)
    assert publish.archive_of(_later(payload, 2)) is None
    key, week = publish.archive_of(_later(payload, 30))  # type: ignore[misc]
    assert key == "sorare_week:gw-past" and week["gameweek"]["slug"] == "gw-past" and "hindsight" in week


def _fetched(hours: float) -> dict[str, Any]:
    """The fixture's snapshot as a run `hours` after the week just played ended would have taken it."""
    snap = snapshot()
    snap["fetchedAt"] = (datetime.fromisoformat(snap["pastGameweek"]["end"]) + timedelta(hours=hours)).isoformat()
    return snap


def test_a_replay_built_while_sorare_left_something_unanswered_is_not_made_final():
    clean = publish.build_payload(_fetched(30), runs=2, draws=200)
    assert publish.archive_of(clean) is not None and publish.settled_replay(clean) is not None

    gappy_snap = _fetched(30)  # a day and more after it ended: its scores have settled, but a call got no answer
    gappy_snap["pastGaps"] = ["Europe | Champion: could not be read"]
    gappy = publish.build_payload(gappy_snap, runs=2, draws=200)

    assert publish.week_of(gappy, "last")["complete"] is False  # type: ignore[index]
    assert publish.archive_of(gappy) is None, "it is not written to the archive as the last word"
    assert publish.settled_replay(gappy) is None, "and the next run rebuilds it instead of skipping it"
    assert "kept" not in {i["number"]: i for i in gappy["timeline"]}[15]


def test_a_replay_that_still_lacks_something_a_week_later_is_kept_as_it_is():
    snap = _fetched(24 * 8)  # waiting has not helped
    snap["pastGaps"] = ["Europe | Champion: could not be read"]
    payload = publish.build_payload(snap, runs=2, draws=200)
    assert publish.archive_of(payload) is not None and publish.settled_replay(payload) is not None
    assert {i["number"]: i for i in payload["timeline"]}[15]["kept"] is True


def test_a_week_is_final_on_the_clock_alone_when_nothing_says_it_is_incomplete():
    week = publish.week_of(publish.build_payload(_fetched(30), runs=2, draws=200), "last")
    assert week is not None
    end = datetime.fromisoformat(week["gameweek"]["end"])
    assert not publish.is_final(week, end + timedelta(hours=23))
    assert publish.is_final(week, end + timedelta(hours=25))
    older = {k: v for k, v in week.items() if k != "complete"}  # a replay from before the flag existed
    assert publish.is_final(older, end + timedelta(hours=25))


class _Client:
    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return None


def test_what_the_page_points_at_is_written_before_the_page(db, monkeypatch):  # noqa: F811
    monkeypatch.delenv("GITHUB_ACTIONS", raising=False)
    monkeypatch.setattr(sorare_job.settings, "sorare_api_key", "test-key")
    monkeypatch.setattr(sorare_job, "SorareClient", lambda *a, **k: _Client())
    monkeypatch.setattr(sorare_job.sorare_sync, "snapshot", lambda *a, **k: snapshot())
    monkeypatch.setattr(sorare_job.projection, "calendar", lambda db, now: [])
    written: list[str] = []
    real = sorare_job.put

    def recording(session, key, payload, now):
        written.append(key)
        real(session, key, payload, now)

    monkeypatch.setattr(sorare_job, "put", recording)

    summary = sorare_job.run(db, "yares", runs=1)

    assert summary["archived"] == "sorare_week:gw-past"
    assert written.index("sorare_week:gw-past") < written.index(sorare_job.SORARE_KEY), (
        "the page marks the week as kept: its page must exist by then"
    )


# --------------------------------------------------------------------------- the timeline says which weeks are kept
def test_the_timeline_marks_the_week_just_played_as_kept_once_it_is_final():
    payload = publish.build_payload(snapshot(), runs=4, draws=600)  # the fixture's run is two weeks after GW15
    by_number = {item["number"]: item for item in payload["timeline"]}
    assert by_number[15]["kept"] is True and by_number[15]["playing"] > 0 and by_number[15]["won"] >= 0
    assert "kept" not in by_number[21], "a week still to play is not kept"


def test_a_week_played_a_day_ago_is_not_kept_yet():
    fresh = snapshot()
    fresh["fetchedAt"] = "2026-09-22T20:00:00+00:00"  # six hours after GW15 ended
    by_number = {item["number"]: item for item in publish.build_payload(fresh, runs=2, draws=200)["timeline"]}
    assert "kept" not in by_number[15]


def test_a_kept_week_stays_kept_in_the_timeline_after_it_is_no_longer_the_last_one():
    earlier = publish.build_payload(snapshot(), runs=2, draws=200)
    later_snap = snapshot()
    later_snap["fetchedAt"] = "2026-10-12T10:00:00+00:00"
    # GW21 has finished and is now the week just played; GW15 has dropped out of the replay
    later_snap["pastGameweek"] = later_snap["planGameweek"]
    later = publish.build_payload(later_snap, runs=2, draws=200, previous=earlier)
    by_number = {item["number"]: item for item in later["timeline"]}
    assert by_number[15]["kept"] is True, "kept is remembered from the page before, so the picker can say so"
    assert by_number[15]["won"] == {i["number"]: i for i in earlier["timeline"]}[15]["won"]
