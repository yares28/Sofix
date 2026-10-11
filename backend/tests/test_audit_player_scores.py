"""Owned-player comparisons work before a whole GW settles and without 100 results."""

from datetime import UTC, datetime, timedelta

from app.models import ReadModel
from app.services.publish import put
from app.sorare import audit, player_games
from tests.test_pipeline import db  # noqa: F401

NOW = datetime(2026, 10, 11, 15, tzinfo=UTC)
GAME = "Game:e15903b2-79d4-44ad-93fc-35d2761010d2"


def seed(db):  # noqa: F811
    put(db, "sorare", {"collection": [{"player": "p", "name": "Player", "pic": "card.png"}]}, NOW)
    record = {
        "gameweek": {
            "slug": "gw21",
            "number": 21,
            "lock": (NOW - timedelta(days=2)).isoformat(),
            "end": (NOW + timedelta(days=2)).isoformat(),
        },
        "writtenAt": (NOW - timedelta(days=3)).isoformat(),
        "players": {
            "p": {
                "pos": "MID",
                "mu": 55,
                "by": "sofix",
                "games": [
                    {
                        "id": GAME,
                        "competition": "international",
                        "kickoff": (NOW - timedelta(hours=5)).isoformat(),
                        "home": "Spain",
                        "away": "Denmark",
                        "sofix": 55,
                        "sorare": 60,
                    },
                    {
                        "id": "later",
                        "competition": "international",
                        "kickoff": (NOW + timedelta(days=1)).isoformat(),
                        "home": "Spain",
                        "away": "France",
                        "sofix": 56,
                        "sorare": None,
                    },
                ],
            },
            "not-owned": {"pos": "MID", "games": [{"id": GAME, "sofix": 80}]},
        },
    }
    player_games.save_record(db, record, NOW - timedelta(days=3))
    put(
        db,
        "audit_game_checks",
        {
            "games": {
                GAME: {
                    "finishedSeenAt": (NOW - timedelta(hours=2)).isoformat(),
                    "firstCheckedAt": (NOW - timedelta(hours=1)).isoformat(),
                    "checkedAt": (NOW - timedelta(hours=1)).isoformat(),
                    "first": {"p": 50},
                    "scores": {"p": {"score": 50, "played": True, "started": True, "mins": 90}},
                }
            }
        },
        NOW,
    )


def test_owned_rows_and_small_summary_exist_before_gw_end_and_include_every_game(db):  # noqa: F811
    seed(db)
    page = audit.from_kept(db, NOW)["playerScores"]
    week = page["weeks"][0]
    assert week["slug"] == "gw21" and week["number"] == 21
    assert len(week["rows"]) == 2
    played, pending = week["rows"]
    assert played["name"] == "Player" and played["pic"] == "card.png"
    assert played["home"] == "Spain" and played["away"] == "Denmark"
    assert played["state"] == "provisional" and played["actual"] == 50
    assert played["xscore"] == 55 and played["difference"] == -5 and played["sorare"] == 60
    assert pending["state"] == "pending" and pending["actual"] is None and pending["sorare"] is None
    assert week["summary"] == {
        "checked": 1,
        "total": 2,
        "rechecked": 0,
        "starts": 1,
        "xCases": 1,
        "xMiss": 5.0,
        "sorareCases": 1,
        "sorareMiss": 10.0,
    }


def test_correction_keeps_the_initial_score_and_frozen_forecast(db):  # noqa: F811
    seed(db)
    check = db.get(ReadModel, "audit_game_checks").payload
    check["games"][GAME].update(
        recheckedAt=NOW.isoformat(),
        checkedAt=NOW.isoformat(),
        scores={"p": {"score": 53, "played": True, "started": True, "mins": 90}},
    )
    put(db, "audit_game_checks", check, NOW)
    row = audit.from_kept(db, NOW)["playerScores"]["weeks"][0]["rows"][0]
    assert row["state"] == "rechecked" and row["actual"] == 53 and row["firstScore"] == 50
    assert row["xscore"] == 55 and row["difference"] == -2


def test_zero_is_a_score_missing_is_pending_and_subs_do_not_enter_starter_summary(db):  # noqa: F811
    seed(db)
    check = db.get(ReadModel, "audit_game_checks").payload
    check["games"][GAME]["scores"]["p"].update(score=0, started=False)
    put(db, "audit_game_checks", check, NOW)
    week = audit.from_kept(db, NOW)["playerScores"]["weeks"][0]
    assert week["rows"][0]["actual"] == 0 and week["rows"][0]["difference"] == -55
    assert week["summary"]["starts"] == 0 and week["summary"]["xMiss"] is None
    check["games"][GAME]["scores"]["p"]["score"] = None
    put(db, "audit_game_checks", check, NOW)
    assert audit.from_kept(db, NOW)["playerScores"]["weeks"][0]["rows"][0]["state"] == "pending"


def test_cold_start_no_forecasts_and_post_lock_numbers_remain_explicit(db):  # noqa: F811
    assert audit.from_kept(db, NOW)["playerScores"] == {"weeks": []}
    seed(db)
    record = db.get(ReadModel, "score_record:gw21").payload
    record["writtenAt"] = NOW.isoformat()
    put(db, "score_record:gw21", record, NOW)
    row = audit.from_kept(db, NOW)["playerScores"]["weeks"][0]["rows"][0]
    assert row["xscore"] is None and row["sorare"] is None and row["difference"] is None


class Client:
    def __init__(self, *, score=50, status="played", missing=False):
        self.score, self.status, self.missing = score, status, missing
        self.calls = []

    def query(self, query):
        self.calls.append(query)
        return {
            "g0": None
            if self.missing
            else {
                "id": GAME,
                "date": (NOW - timedelta(hours=5)).isoformat(),
                "statusTyped": self.status,
                "playerGameScores": [
                    {
                        "anyPlayer": {"slug": "p"},
                        "score": self.score,
                        "scoreStatus": "FINAL",
                        "anyPlayerGameStats": {"playedInGame": True, "gameStarted": True, "minsPlayed": 90},
                    }
                ],
            }
        }


def test_scheduled_read_checks_at_kickoff_plus_three_then_26_hours_without_tabs(db):  # noqa: F811
    from app.sorare import score_checks

    seed(db)
    db.delete(db.get(ReadModel, "audit_game_checks"))
    db.commit()
    client = Client()
    kickoff = NOW - timedelta(hours=5)
    assert score_checks.run(db, client, kickoff + timedelta(hours=3) - timedelta(seconds=1))["games"] == 0
    assert score_checks.run(db, client, kickoff + timedelta(hours=3))["games"] == 1
    assert len(client.calls) == 1
    assert score_checks.run(db, client, kickoff + timedelta(hours=25))["games"] == 0
    client.score = 53
    assert score_checks.run(db, client, kickoff + timedelta(hours=26))["games"] == 1
    saved = db.get(ReadModel, "audit_game_checks").payload["games"][GAME]
    assert saved["first"]["p"] == 50 and saved["scores"]["p"]["score"] == 53
    assert saved["recheckedAt"] is not None
    assert score_checks.run(db, client, kickoff + timedelta(hours=27))["games"] == 0
    assert len(client.calls) == 2
    assert audit.from_kept(db, kickoff + timedelta(hours=26))["playerScores"]["weeks"][0]["rows"][0]["difference"] == -2


def test_failed_correction_or_unfinished_game_does_not_mark_rechecked_or_erase_score(db):  # noqa: F811
    from app.sorare import score_checks

    seed(db)
    later = NOW + timedelta(hours=22)
    for client in (Client(missing=True), Client(status="playing"), Client(score=None)):
        score_checks.run(db, client, later)
        saved = db.get(ReadModel, "audit_game_checks").payload["games"][GAME]
        assert not saved.get("recheckedAt") and saved["scores"]["p"]["score"] == 50
        later += timedelta(minutes=31)


def test_cold_start_over_a_day_old_still_requires_two_separate_reads(db):  # noqa: F811
    from app.sorare import score_checks

    seed(db)
    db.delete(db.get(ReadModel, "audit_game_checks"))
    db.commit()
    late = NOW + timedelta(hours=22)
    score_checks.run(db, Client(), late)
    saved = db.get(ReadModel, "audit_game_checks").payload["games"][GAME]
    assert saved.get("firstCheckedAt") and not saved.get("recheckedAt")
    score_checks.run(db, Client(score=51), late + timedelta(minutes=31))
    assert db.get(ReadModel, "audit_game_checks").payload["games"][GAME]["recheckedAt"]


def test_dnp_expiry_and_sorare_fallback_keep_their_identity(db):  # noqa: F811
    seed(db)
    check = db.get(ReadModel, "audit_game_checks").payload
    check["games"][GAME]["scores"]["p"].update(played=False, started=False, score=0)
    check["games"]["later"] = {"reason": "Sorare result unavailable"}
    put(db, "audit_game_checks", check, NOW)
    record = db.get(ReadModel, "score_record:gw21").payload
    record["players"]["p"].update(by="sorare", owned=False)
    record["players"]["p"]["games"][0]["sofix"] = None
    put(db, "score_record:gw21", record, NOW)
    week = audit.from_kept(db, NOW + timedelta(days=20))["playerScores"]["weeks"][0]
    row = week["rows"][0]
    assert row["played"] is False and row["actual"] is None and row["difference"] is None
    assert row["xscore"] == 60 and row["by"] == "sorare"
    assert week["summary"]["checked"] == 1 and week["summary"]["starts"] == 0
    assert "window ended" in week["rows"][1]["reason"]


def test_one_missing_player_does_not_block_a_teammates_day_later_recheck(db):  # noqa: F811
    from copy import deepcopy

    from app.sorare import score_checks

    seed(db)
    db.delete(db.get(ReadModel, "audit_game_checks"))
    record = db.get(ReadModel, "score_record:gw21").payload
    record["players"]["q"] = {
        **deepcopy(record["players"]["p"]),
        "owned": True,
        "name": "Missing teammate",
        "games": [deepcopy(record["players"]["p"]["games"][0])],
    }
    put(db, "score_record:gw21", record, NOW)
    score_checks.run(db, Client(), NOW)
    score_checks.run(db, Client(score=53), NOW + timedelta(hours=22))
    rows = audit.from_kept(db, NOW + timedelta(hours=22))["playerScores"]["weeks"][0]["rows"]
    p = next(row for row in rows if row["player"] == "p" and row["game"] == GAME)
    q = next(row for row in rows if row["player"] == "q")
    assert p["state"] == "rechecked" and p["actual"] == 53 and p["firstScore"] == 50
    assert q["state"] == "pending" and q["actual"] is None


def test_job_publishes_success_and_failure_state_but_skips_an_idle_run(db, monkeypatch):  # noqa: F811
    from contextlib import nullcontext

    from app.jobs import score_checks as job
    from app.sorare import score_checks

    seed(db)
    called = []
    monkeypatch.setattr(job, "SessionLocal", lambda: nullcontext(db))
    monkeypatch.setattr(job, "SorareClient", lambda: nullcontext(Client()))
    monkeypatch.setattr(job, "notify_app", lambda *args: called.append("revalidate"))
    monkeypatch.setattr(score_checks, "run", lambda *args: {"games": 1, "failed": 0, "pending": 0})
    assert job.main() == 0
    assert db.get(ReadModel, "audit").payload["playerScores"]["weeks"][0]["rows"][0]["actual"] == 50
    assert called == ["revalidate"]
    monkeypatch.setattr(score_checks, "run", lambda *args: {"games": 0, "failed": 1, "pending": 1})
    job.main()
    assert called == ["revalidate", "revalidate"]
    monkeypatch.setattr(score_checks, "run", lambda *args: {"games": 0, "failed": 0, "pending": 0})
    job.main()
    assert called == ["revalidate", "revalidate"]


def test_newly_owned_teammate_gets_two_reads_even_when_the_match_was_already_checked(db):  # noqa: F811
    from copy import deepcopy

    from app.sorare import score_checks

    seed(db)
    late = NOW + timedelta(hours=22)
    score_checks.run(db, Client(), late)
    record = db.get(ReadModel, "score_record:gw21").payload
    record["players"]["q"] = {
        **deepcopy(record["players"]["p"]),
        "owned": True,
        "name": "New teammate",
        "games": [deepcopy(record["players"]["p"]["games"][0])],
    }
    put(db, "score_record:gw21", record, late)

    class TeammateClient(Client):
        def query(self, query):
            result = super().query(query)
            teammate = deepcopy(result["g0"]["playerGameScores"][0])
            teammate["anyPlayer"]["slug"] = "q"
            result["g0"]["playerGameScores"].append(teammate)
            return result

    client = TeammateClient()
    assert score_checks.run(db, client, late + timedelta(minutes=31))["games"] == 1
    rows = score_checks.comparison(db, late)["weeks"][0]["rows"]
    assert next(r for r in rows if r["player"] == "q")["state"] == "provisional"
    score_checks.run(db, client, late + timedelta(minutes=62))
    rows = score_checks.comparison(db, late)["weeks"][0]["rows"]
    assert next(r for r in rows if r["player"] == "q")["state"] == "rechecked"
