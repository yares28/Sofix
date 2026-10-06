"""The Audit page's numbers (roadmap batch 5, TODO T7): how often the xScore picks the better of two players, and which of Sorare,
Futbol Fantasy and Sofix was right about who starts. Every history and record here is made up, so what each test says is certain."""

# ruff: noqa: F811  (the `db` fixture is used by importing it)
from __future__ import annotations

import json
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import pytest
from fastapi.testclient import TestClient

from app.config import Settings
from app.db import get_db
from app.main import create_app
from app.models import ReadModel
from app.sorare import audit, starts
from tests.test_pipeline import db  # noqa: F401  (fixture)
from tests.test_starts import Site, the_job  # noqa: F401  (fixtures)
from tests.test_xscore_backtest import game, player

NOW = datetime(2026, 10, 7, 12, tzinfo=UTC)
LOCK = "2026-10-06T14:00:00+00:00"


# --------------------------------------------------------------------------- the replay of the history
def steady_history() -> dict[str, dict[str, Any]]:
    """Six midfielders whose levels differ and never change, over fourteen weeks: any model that reads form orders them right."""
    return {
        f"secret-name-{i}": player([game(7 * week, score=30.0 + 8 * i) for week in range(14)], pos="MID")
        for i in range(6)
    }


def test_the_replay_says_how_often_the_xscore_picked_the_better_player_and_what_a_guess_would_get() -> None:
    out = audit.replay(steady_history(), [], NOW)

    pairs = out["xscore"]["pairs"]
    assert pairs["rate"] > 0.95 and pairs["lo"] <= pairs["rate"] <= pairs["hi"]
    assert pairs["weeks"] == 14 and pairs["pairs"] == 14 * 15
    assert out["xscore"]["flat"]["rate"] == 0.5, "the same number for everyone is a coin flip"
    assert out["xscore"]["last5"]["rate"] > 0.95
    assert set(out["xscore"]["byPosition"]) == {"MID"} and out["xscore"]["byPosition"]["MID"]["pairs"] == 14 * 15


def test_the_replay_says_how_far_off_it_ran_and_over_what() -> None:
    out = audit.replay(steady_history(), [], NOW)

    xscore = out["xscore"]
    assert out["players"] == 6 and out["from"] == "2026-01-05" and out["to"] == "2026-04-06"
    assert xscore["games"] == 6 * 14
    assert xscore["typicalMiss"] >= 0 and xscore["was"] == pytest.approx(50.0), "their levels run from 30 to 70"
    assert set(xscore["within"]) == {"10", "15", "20"} and all(0 <= v <= 1 for v in xscore["within"].values())
    assert out["version"] == audit.VERSION and out["builtAt"] == NOW.isoformat()


def test_the_replay_scores_sofixs_own_chance_of_starting_on_the_games_it_replays() -> None:
    out = audit.replay(steady_history(), [], NOW)["starts"]["sofix"]

    assert out["games"] == 6 * 14 and out["started"] == 1.0, "every game was a start"
    assert 0.9 < out["right"] < 1.0, "right from the second game on, wrong when he had no record at all"
    assert 0 < out["brier"] < 0.25 and 0 < out["mean"] < 1
    assert out["always"] == 1.0, "saying he starts every time would have been right every time"
    assert sum(b["n"] for b in out["buckets"]) == out["games"]
    assert all(b["said"] is not None and b["was"] is not None for b in out["buckets"])


def test_the_replay_holds_numbers_only_never_a_player() -> None:
    text = json.dumps(audit.replay(steady_history(), [], NOW))

    assert "secret-name" not in text and "Test Player" not in text


def test_a_history_with_nothing_to_compare_gives_no_rate_not_an_error() -> None:
    out = audit.replay({"p": player([game(0), game(7)])}, [], NOW)

    assert out["xscore"]["pairs"]["rate"] is None and out["xscore"]["pairs"]["pairs"] == 0


def test_the_replay_file_is_read_when_it_is_there_and_ignored_when_it_is_not_what_the_page_expects(
    tmp_path: Path,
) -> None:
    good = tmp_path / "replay.json"
    good.write_text(json.dumps(audit.replay(steady_history(), [], NOW)), "utf-8")
    broken = tmp_path / "broken.json"
    broken.write_text("{not json", "utf-8")
    other = tmp_path / "other.json"
    other.write_text(json.dumps({"version": 99, "xscore": {}}), "utf-8")

    assert audit.read_replay(good)["players"] == 6
    assert audit.read_replay(broken) is None and audit.read_replay(other) is None
    assert audit.read_replay(tmp_path / "missing.json") is None


# --------------------------------------------------------------------------- who starts, as recorded
def cell(chances: dict[str, float], started: bool | None = None, **more: Any) -> dict[str, Any]:
    out: dict[str, Any] = {source: {"chance": value, "at": LOCK} for source, value in chances.items()}
    if started is not None:
        out |= {"started": started, "played": started}
    return out | more


def record_of(weeks: dict[str, dict[str, dict[str, Any]]]) -> dict[str, Any]:
    """slug -> player -> entry, as the record keeps them."""
    return {"weeks": {slug: {"lock": LOCK, "players": players} for slug, players in weeks.items()}}


def hundred_games(source: str = "sofix") -> dict[str, Any]:
    """Fifty games said at 90% (45 of them starts) and fifty said at 10% (5 starts): right 90 times in 100."""
    games: dict[str, dict[str, Any]] = {}
    for n in range(50):
        games[f"hi{n}"] = cell({source: 0.9}, started=n < 45)
        games[f"lo{n}"] = cell({source: 0.1}, started=n < 5)
    return record_of({"gw": {"p": {"games": games}}})


def test_a_source_with_nothing_recorded_says_none_and_one_recorded_but_not_played_yet_says_waiting() -> None:
    record = record_of({"gw": {"p": {"games": {"g1": cell({"sofix": 0.6}), "g2": cell({"sofix": 0.5})}}}})

    live = audit.starts_record(record)

    assert live["sofix"]["state"] == "waiting" and live["sofix"]["recorded"] == 2 and live["sofix"]["settled"] == 0
    assert live["futbolfantasy"]["state"] == "none" and live["futbolfantasy"]["recorded"] == 0
    assert live["sorare"]["state"] == "none"
    assert audit.starts_record({})["sofix"]["state"] == "none", "no record at all is not an error"


def test_under_the_floor_a_source_shows_its_counts_and_no_figures() -> None:
    games = {f"g{n}": cell({"futbolfantasy": 0.9}, started=True) for n in range(audit.FLOOR - 1)}
    live = audit.starts_record(record_of({"gw": {"p": {"games": games}}}))

    ff = live["futbolfantasy"]
    assert ff["state"] == "few" and ff["settled"] == audit.FLOOR - 1 and ff["recorded"] == audit.FLOOR - 1
    assert ff["right"] is None and ff["brier"] is None and ff["buckets"] is None, "too few to tell"


def test_at_the_floor_each_figure_is_what_the_arithmetic_says() -> None:
    sofix = audit.starts_record(hundred_games())["sofix"]

    assert sofix["state"] == "enough" and sofix["settled"] == 100
    assert sofix["right"] == pytest.approx(0.9)
    assert sofix["brier"] == pytest.approx(0.09)
    assert sofix["mean"] == pytest.approx(0.5) and sofix["started"] == pytest.approx(0.5)
    low, high = sofix["buckets"][0], sofix["buckets"][-1]
    assert (low["n"], low["said"], low["was"]) == (50, pytest.approx(0.1), pytest.approx(0.1))
    assert (high["n"], high["said"], high["was"]) == (50, pytest.approx(0.9), pytest.approx(0.9))


def test_each_source_is_counted_on_the_games_it_had_a_number_for() -> None:
    games = {
        "g1": cell({"sofix": 0.8, "futbolfantasy": 0.9}, started=True),
        "g2": cell({"sofix": 0.3}, started=False),
        "g3": cell({"sofix": 0.5, "sorare": 0.7}),  # not played yet
    }
    live = audit.starts_record(record_of({"gw": {"p": {"games": games}}}))

    assert (live["sofix"]["recorded"], live["sofix"]["settled"]) == (3, 2)
    assert (live["futbolfantasy"]["recorded"], live["futbolfantasy"]["settled"]) == (1, 1)
    assert (live["sorare"]["recorded"], live["sorare"]["settled"]) == (1, 0)


def test_an_entry_from_before_games_were_told_apart_counts_once_for_the_player() -> None:
    old = cell({"sofix": 0.7, "sorare": 0.6}, started=True)
    live = audit.starts_record(record_of({"gw": {"p": old}}))

    assert (live["sofix"]["recorded"], live["sofix"]["settled"]) == (1, 1)
    assert (live["sorare"]["recorded"], live["sorare"]["settled"]) == (1, 1)


def test_the_record_by_gameweek_counts_what_was_written_and_what_was_scored_newest_first() -> None:
    record = {
        "weeks": {
            "old": {
                "lock": "2026-09-29T14:00:00+00:00",
                "players": {"a": {"games": {"g1": cell({"sofix": 0.6}, started=True)}}},
            },
            "new": {
                "lock": LOCK,
                "players": {
                    "a": {"games": {"g2": cell({"sofix": 0.6, "futbolfantasy": 0.8}), "g3": cell({"sofix": 0.4})}},
                    "b": {"model": {}},  # a note with no games is not a game
                },
            },
        }
    }

    weeks = audit.weeks_record(record)

    assert [w["slug"] for w in weeks] == ["new", "old"]
    assert weeks[0] == {
        "slug": "new",
        "lock": LOCK,
        "games": 2,
        "settled": 0,
        "sources": {"sorare": 0, "sofix": 2, "futbolfantasy": 1},
    }
    assert weeks[1]["games"] == 1 and weeks[1]["settled"] == 1
    assert audit.weeks_record({}) == []


# --------------------------------------------------------------------------- the xScore, as recorded
def noted(pos: str, p_play: float, mu: float, games: dict[str, dict[str, Any]]) -> dict[str, Any]:
    return {"model": {"pos": pos, "pPlay": p_play, "mu": mu}, "games": games}


def scored(score: float, played: bool = True) -> dict[str, Any]:
    return {"started": played, "played": played, "score": score if played else None}


def six_weeks_in_order(weeks: int) -> dict[str, Any]:
    """Six midfielders a week, expected and scored in the same order (expected = chance of playing x score if he plays)."""
    out: dict[str, dict[str, Any]] = {}
    for week in range(weeks):
        out[f"gw{week}"] = {
            f"p{i}": noted("MID", 1.0, 30.0 + 8 * i, {f"g{week}-{i}": scored(30.0 + 8 * i)}) for i in range(6)
        }
    return record_of(out)


def test_the_live_xscore_is_marked_by_the_same_pairs_as_the_replay_once_there_are_enough() -> None:
    live = audit.xscore_record(six_weeks_in_order(7))

    assert live["state"] == "enough" and live["pairs"] == 7 * 15 and live["weeks"] == 7
    assert live["rate"] == 1.0 and live["lo"] <= 1.0 <= live["hi"]
    assert live["floor"] == audit.FLOOR


def test_under_the_floor_the_live_xscore_shows_counts_and_no_rate() -> None:
    live = audit.xscore_record(six_weeks_in_order(2))

    assert live["state"] == "few" and live["pairs"] == 30
    assert live["rate"] is None and live["lo"] is None


def test_the_expected_score_is_the_chance_of_playing_times_his_score_if_he_plays_and_his_gameweek_the_best_game() -> (
    None
):
    # a: 50% to play at 80 (expected 40) scored 60 and 30 in his two games, so 60; b: 100% at 50 scored 50.
    # Expected says a < b, and a did better: one pair, wrong.
    record = record_of(
        {
            "gw": {
                "a": noted("DEF", 0.5, 80.0, {"g1": scored(60.0), "g2": scored(30.0)}),
                "b": noted("DEF", 1.0, 50.0, {"g3": scored(50.0)}),
            }
        }
    )

    live = audit.xscore_record(record)

    assert live["pairs"] == 1 and live["state"] == "few"
    rows = audit.live_rows(record)
    assert {r.player: (r.expected, r.score) for r in rows} == {"a": (40.0, 60.0), "b": (50.0, 50.0)}


def test_a_game_he_did_not_play_counts_as_nothing_in_his_gameweek() -> None:
    record = record_of({"gw": {"a": noted("FWD", 0.9, 60.0, {"g1": scored(0.0, played=False)})}})

    assert [(r.score, r.played) for r in audit.live_rows(record)] == [(0.0, False)]


def test_a_player_with_a_game_still_to_be_scored_is_not_marked_yet_and_one_with_no_note_never_is() -> None:
    record = record_of(
        {
            "gw": {
                "a": noted("MID", 1.0, 50.0, {"g1": scored(50.0), "g2": {}}),  # his second game has no result yet
                "b": {"games": {"g3": scored(40.0)}},  # no note: the model never said anything about him
                "c": noted("MID", 1.0, 40.0, {"g4": scored(40.0)}),
            }
        }
    )

    assert [r.player for r in audit.live_rows(record)] == ["c"]
    assert audit.xscore_record(record)["state"] == "waiting", "recorded, but nothing to pair yet"


def test_with_no_player_noted_the_live_xscore_says_none() -> None:
    assert audit.xscore_record({})["state"] == "none"


def test_a_gameweek_of_the_record_with_no_readable_lock_is_skipped_not_an_error() -> None:
    good = six_weeks_in_order(1)["weeks"]
    record = {
        "weeks": {
            **good,
            "no-lock": {"players": {"a": noted("MID", 1.0, 40.0, {"g": scored(40.0)})}},
            "bad-lock": {"lock": "soon", "players": {}},
        }
    }

    live = audit.xscore_record(record)

    assert live["noted"] == 6 and live["pairs"] == 15, "only the gameweek that has a lock is counted"
    assert [w["slug"] for w in audit.weeks_record(record)][0] == "gw0", (
        "and it is the one listed first, the others last"
    )
    assert {w["slug"] for w in audit.weeks_record(record)} == {"gw0", "no-lock", "bad-lock"}


# --------------------------------------------------------------------------- the page
def test_the_page_carries_both_halves_and_says_when_there_is_no_replay() -> None:
    page = audit.build(hundred_games(), None, NOW)

    assert page["version"] == audit.VERSION and page["generatedAt"] == NOW.isoformat() and page["floor"] == audit.FLOOR
    assert page["xscore"]["replay"] is None and page["replay"] is None
    assert page["xscore"]["live"]["state"] == "none"
    assert page["starts"]["live"]["sofix"]["state"] == "enough" and page["starts"]["replay"] is None
    assert [w["slug"] for w in page["starts"]["weeks"]] == ["gw"]


def test_the_page_with_a_replay_says_what_it_covers() -> None:
    replay = audit.replay(steady_history(), [], NOW)

    page = audit.build({}, replay, NOW)

    assert page["xscore"]["replay"]["pairs"]["rate"] > 0.95
    assert page["starts"]["replay"]["sofix"]["games"] == 6 * 14
    assert page["replay"] == {"builtAt": NOW.isoformat(), "from": "2026-01-05", "to": "2026-04-06", "players": 6}


def test_publishing_writes_the_page_under_its_own_key_from_the_record_and_the_replay_file(
    db, tmp_path, monkeypatch
) -> None:
    file = tmp_path / "replay.json"
    file.write_text(json.dumps(audit.replay(steady_history(), [], NOW)), "utf-8")
    monkeypatch.setattr(audit, "REPLAY_FILE", file)
    db.add(ReadModel(key=starts.START_KEY, payload=hundred_games(), updated_at=NOW))
    db.commit()

    summary = audit.publish(db, NOW)

    row = db.get(ReadModel, audit.AUDIT_KEY)
    assert row is not None and row.payload["version"] == audit.VERSION
    assert row.payload["starts"]["live"]["sofix"]["right"] == pytest.approx(0.9)
    assert row.payload["xscore"]["replay"]["pairs"]["rate"] > 0.95
    assert summary["settled"] == 100 and summary["bytes"] > 0


def test_publishing_with_no_record_and_no_replay_file_still_writes_an_honest_empty_page(
    db, tmp_path, monkeypatch
) -> None:
    monkeypatch.setattr(audit, "REPLAY_FILE", tmp_path / "nothing.json")

    audit.publish(db, NOW)

    row = db.get(ReadModel, audit.AUDIT_KEY)
    assert row is not None and row.payload["replay"] is None
    assert row.payload["starts"]["live"]["sofix"]["state"] == "none"


# --------------------------------------------------------------------------- the job and the local server
def test_a_refresh_writes_the_audit_page_after_the_record(db, monkeypatch, the_job) -> None:
    from app.sorare import ff_feed  # noqa: F401
    from app.sources import futbolfantasy_matches as ffm

    monkeypatch.setattr(ffm, "read_matches", Site())

    summary = the_job.run(db, "yares", runs=1)

    row = db.get(ReadModel, audit.AUDIT_KEY)
    assert row is not None and row.payload["version"] == audit.VERSION
    assert summary["audit"]["bytes"] > 0
    assert row.payload["starts"]["live"]["sofix"]["recorded"] >= 1, "written after this run's own start record"


def test_an_audit_that_breaks_costs_only_the_audit_never_the_page(db, monkeypatch, the_job) -> None:
    from app.sources import futbolfantasy_matches as ffm

    monkeypatch.setattr(ffm, "read_matches", Site())

    def broken(*args: Any, **kwargs: Any) -> Any:
        raise RuntimeError("no replay today")

    monkeypatch.setattr(audit, "publish", broken)

    summary = the_job.run(db, "yares", runs=1)

    assert "audit" in summary["failed"] and "no replay today" in summary["failed"]["audit"]
    assert db.get(ReadModel, "sorare") is not None, "the Play page was published all the same"
    assert db.get(ReadModel, audit.AUDIT_KEY) is None


def test_a_dry_run_builds_nothing_of_the_audit(db, monkeypatch, the_job) -> None:
    from app.sources import futbolfantasy_matches as ffm

    monkeypatch.setattr(ffm, "read_matches", Site())

    the_job.run(db, "yares", runs=1, dry_run=True)

    assert db.get(ReadModel, audit.AUDIT_KEY) is None


def test_the_local_server_serves_the_published_page_or_builds_it_from_the_record(db) -> None:
    app = create_app(Settings(app_env="dev"))
    app.dependency_overrides[get_db] = lambda: db
    client = TestClient(app)

    built = client.get("/api/audit").json()  # nothing published: built from whatever the record holds
    assert built["success"] is True and built["data"]["starts"]["live"]["sofix"]["state"] == "none"

    db.add(ReadModel(key=audit.AUDIT_KEY, payload={"version": 1, "marker": "published"}, updated_at=NOW))
    db.commit()
    assert client.get("/api/audit").json()["data"]["marker"] == "published"


def _kept(number: int, expected: float, won: float, lineups: int = 2, cash: float = 0.0) -> dict[str, Any]:
    plan = {
        "rank": 1,
        "essence": expected,
        "cash": cash,
        "lineups": [{}] * lineups,
        "actual": {"essence": won, "cash": cash / 2},
    }
    best = {
        "rank": 1,
        "essence": 999,
        "cash": 0,
        "lineups": [{}],
        "actual": {"essence": 999, "cash": 0},
        "hindsight": True,
    }
    return {"gameweek": {"number": number, "slug": f"gw-{number}"}, "plans": [plan, best]}


def test_the_rewards_add_up_what_each_plan_expected_and_what_it_won_season_long() -> None:
    weeks = [_kept(18, 120.4, 250, cash=1.0), _kept(17, 63, 0, lineups=3), {"gameweek": {"number": 19}, "plans": []}]
    rewards = audit.rewards_record(weeks)
    assert [w["gameweek"] for w in rewards["weeks"]] == [17, 18]  # oldest first; a week with no played plan is left out
    assert rewards["expected"] == {
        "essence": 183,
        "cash": 1.0,
    }  # chance x reward, added up: a fraction of a prize per week
    assert rewards["won"] == {
        "essence": 250,
        "cash": 0.5,
    }  # what the lineups really won, whole rewards; hindsight ignored
    assert rewards["lineups"] == 5


def test_publishing_counts_the_rewards_of_every_kept_week(db, tmp_path, monkeypatch) -> None:  # noqa: F811
    monkeypatch.setattr(audit, "REPLAY_FILE", tmp_path / "nothing.json")
    db.add(ReadModel(key="sorare_week:gw-17", payload=_kept(17, 63, 0), updated_at=NOW))
    db.add(
        ReadModel(key="sorare_plan:gw-19", payload=_kept(19, 10, 0), updated_at=NOW)
    )  # a plan at its lock: not played yet
    db.commit()
    audit.publish(db, NOW)
    rewards = db.get(ReadModel, audit.AUDIT_KEY).payload["rewards"]
    assert [w["gameweek"] for w in rewards["weeks"]] == [17] and rewards["expected"]["essence"] == 63
