"""The live Audit uses kept games for every player, and leaves unknown results open."""

from copy import deepcopy
from datetime import UTC, datetime, timedelta

from app.api import audit_page
from app.models import PlayerGame, ReadModel
from app.services.publish import put
from app.sorare import audit, ff_chances, missions, player_games, starts, versus
from tests.test_pipeline import db  # noqa: F401
from tests.test_sorare_missions import cand, log

LOCK = datetime(2026, 9, 18, 14, tzinfo=UTC)
END = LOCK + timedelta(days=4)
NOW = END + timedelta(days=2)


def records(count=2):
    return {
        "gameweek": {"slug": "gw", "number": 18, "lock": LOCK.isoformat(), "end": END.isoformat()},
        "writtenAt": (LOCK - timedelta(hours=1)).isoformat(),
        "players": {
            f"p{i}": {
                "pos": "MID",
                "mu": 50 + i / 10,
                "pPlay": 0.9,
                "games": [
                    {
                        "id": "g",
                        "competition": "laliga-es",
                        "kickoff": (LOCK + timedelta(days=1)).isoformat(),
                        "sofix": 50 + i / 10,
                        "sorare": 55,
                        "sources": {"sofix": 0.7, "sorare": 0.8, "futbolfantasy": 0.9},
                        "ffMatch": {"id": 7},
                        "ffPlayer": str(i),
                    }
                ],
            }
            for i in range(count)
        },
    }


def keep(db, count=2):  # noqa: F811
    record = records(count)
    player_games.save_statements(db, record, LOCK - timedelta(hours=1))
    player_games.save(
        db,
        {
            slug: [
                {
                    "gameId": "g",
                    "date": (LOCK + timedelta(days=1)).isoformat(),
                    "competition": "laliga-es",
                    "status": "FINAL",
                    "played": True,
                    "started": True,
                    "score": 51 + i / 10,
                    "mins": 90,
                }
            ]
            for i, slug in enumerate(record["players"])
        },
        NOW,
    )
    put(db, "score_record:gw", record, NOW)
    return record


def test_audit_counts_all_players_from_kept_games_and_applies_the_floor(db):  # noqa: F811
    keep(db, 120)
    audit.publish(db, NOW)
    page = db.get(ReadModel, "audit").payload
    assert page["starts"]["live"]["sorare"]["settled"] == 120
    assert page["starts"]["live"]["sofix"]["right"] == 1.0
    assert page["versus"]["all"]["starts"] == 120 and page["versus"]["all"]["sofix"]["miss"] == 1.0
    assert page["xscore"]["live"]["marked"] == 120


def test_local_api_fallback_uses_the_same_stored_results(db):  # noqa: F811
    keep(db)
    page = audit_page(db).data
    assert page["starts"]["live"]["sofix"]["settled"] == 2


def test_explicit_nonappearance_with_no_start_stat_settles_but_unknown_appearance_does_not(db):  # noqa: F811
    keep(db)
    no_show = db.get(PlayerGame, ("p0", "g"))
    no_show.status, no_show.played, no_show.started = "DID_NOT_PLAY", False, None
    unknown = db.get(PlayerGame, ("p1", "g"))
    unknown.started = None
    db.commit()
    page = audit.from_kept(db, NOW)
    assert page["starts"]["live"]["sofix"]["settled"] == 1
    assert page["starts"]["live"]["sofix"]["started"] == 0.0
    no_show.played = True  # contradictory source data is not a result
    db.commit()
    assert audit.from_kept(db, NOW)["starts"]["live"]["sofix"]["settled"] == 0


def test_idle_score_job_publishes_full_gw_scores_at_the_boundary_without_a_source_read(db, monkeypatch):  # noqa: F811
    from contextlib import nullcontext

    from app.jobs import score_checks as job

    keep(db)
    before = END + timedelta(hours=23)
    audit.publish(db, before)
    assert db.get(ReadModel, "audit").payload["xscore"]["live"]["marked"] == 0

    class Clock:
        @staticmethod
        def now(_):
            return END + timedelta(hours=24)

    calls = []
    monkeypatch.setattr(job, "datetime", Clock)
    monkeypatch.setattr(job, "SessionLocal", lambda: nullcontext(db))
    monkeypatch.setattr(job, "SorareClient", lambda: nullcontext(object()))
    monkeypatch.setattr(job.score_checks, "run", lambda *args: {"games": 0, "failed": 0, "pending": 0})
    monkeypatch.setattr(job, "notify_app", lambda *args: calls.append("revalidate"))
    job.main()
    assert db.get(ReadModel, "audit").payload["starts"]["live"]["sofix"]["settled"] == 2
    assert db.get(ReadModel, "audit").payload["xscore"]["live"]["marked"] == 2
    job.main()
    assert calls == ["revalidate"], "repeated idle runs neither duplicate counts nor republish"


def test_daily_history_publishes_all_saved_sources_without_an_owner_card_or_page_visit(db, monkeypatch):  # noqa: F811
    from app.jobs import league_history as job

    keep(db)
    put(db, "sorare", {"market": [{"slug": "p0"}], "collection": []}, NOW)
    missing = db.get(PlayerGame, ("p0", "g"))
    missing.status, missing.score, missing.played, missing.started = "PENDING", None, None, None
    db.commit()

    def read(client, slugs, kept, at, save, **kwargs):
        result = {
            "p0": {
                "at": at.isoformat(),
                "games": [
                    {
                        "gameId": "g",
                        "date": (LOCK + timedelta(days=1)).isoformat(),
                        "competition": "laliga-es",
                        "status": "FINAL",
                        "score": 0,
                        "played": True,
                        "started": False,
                    }
                ],
            }
        }
        save(result)
        return result

    monkeypatch.setattr(job, "league_history", read)
    assert db.get(ReadModel, "audit") is None  # cold start
    job.run(db, object(), NOW)
    page = deepcopy(db.get(ReadModel, "audit").payload)
    for source in starts.SOURCES:
        assert page["starts"]["live"][source]["settled"] == 2
    assert page["versus"]["subs"]["starts"] == 1
    assert page["versus"]["subs"]["sofix"]["miss"] == 50
    job.run(db, object(), NOW + timedelta(minutes=30))
    assert db.get(ReadModel, "audit").payload["starts"] == page["starts"]


def test_daily_history_keeps_checking_a_sold_players_unfinished_record_then_stops(db, monkeypatch):  # noqa: F811
    from app.jobs import league_history as job

    record = keep(db)
    record["players"]["p0"]["owned"] = True
    put(db, "score_record:gw", record, NOW)
    put(db, "sorare", {"collection": [], "market": []}, NOW)
    pending = db.get(PlayerGame, ("p0", "g"))
    pending.status, pending.started = "REVIEWING", None
    db.commit()
    asked = []

    def read(client, slugs, kept, at, save, **kwargs):
        asked.extend(slugs)
        return {}

    monkeypatch.setattr(job, "league_history", read)
    job.run(db, object(), NOW)
    assert asked == ["p0"]
    pending.status, pending.started = "FINAL", True
    db.commit()
    job.run(db, object(), NOW + timedelta(days=1))
    assert asked == ["p0"], "sold players with final results do not consume further daily reads"


def test_table_results_match_legacy_figures_on_the_overlap_without_double_counting(db):  # noqa: F811
    record = keep(db)
    legacy = {
        "weeks": {
            "gw": {
                "lock": LOCK.isoformat(),
                "players": {
                    slug: {
                        "games": {
                            "g": {
                                **{
                                    source: {"chance": chance}
                                    for source, chance in entry["games"][0]["sources"].items()
                                },
                                "started": True,
                                "played": True,
                                "score": 51 + i / 10,
                                "mins": 90,
                            }
                        }
                    }
                    for i, (slug, entry) in enumerate(record["players"].items())
                },
            }
        }
    }
    put(db, starts.START_KEY, legacy, NOW)
    old_scores = deepcopy(record)
    for i, entry in enumerate(old_scores["players"].values()):
        entry["games"][0]["actual"] = {"started": True, "played": True, "score": 51 + i / 10, "mins": 90}
    audit.publish(db, NOW)
    page = db.get(ReadModel, "audit").payload

    # the table knows each game's competition and the oldest record does not: the split by competition is the one difference
    def figures(live):
        return {source: {k: v for k, v in found.items() if k != "byCompetition"} for source, found in live.items()}

    assert figures(page["starts"]["live"]) == figures(audit.starts_record(legacy))
    assert all(found["byCompetition"] == [] for found in audit.starts_record(legacy).values())
    assert page["versus"]["all"] == versus.figures([old_scores])["all"]
    assert page["starts"]["weeks"][0]["games"] == 2


def test_a_legacy_start_record_without_score_metadata_can_still_finish(db):  # noqa: F811
    keep(db, 1)
    db.delete(db.get(ReadModel, "score_record:gw"))
    put(
        db,
        starts.START_KEY,
        {"weeks": {"old": {"lock": LOCK.isoformat(), "players": {"p0": {"games": {"g": {"sofix": {"chance": 0.7}}}}}}}},
        NOW,
    )
    audit.publish(db, NOW)
    assert db.get(ReadModel, "audit").payload["starts"]["live"]["sofix"]["settled"] == 1


def test_known_starts_count_before_the_week_ends_but_unknown_results_are_not_guessed(db):  # noqa: F811
    keep(db)
    row = db.get(PlayerGame, ("p1", "g"))
    row.started = None
    db.commit()
    audit.publish(db, END + timedelta(hours=23))
    early = db.get(ReadModel, "audit").payload
    assert early["starts"]["live"]["sofix"]["settled"] == 1
    assert early["xscore"]["live"]["marked"] == 0
    # Sorare against Sofix does not wait for the week: the one game with a known start counts as soon as it is read
    assert early["versus"]["all"]["starts"] == 1 and early["versus"]["settled"] == 0
    audit.publish(db, NOW)
    page = db.get(ReadModel, "audit").payload
    assert page["starts"]["live"]["sofix"]["settled"] == 1
    assert page["starts"]["live"]["sofix"]["right"] == 1.0


def test_partial_double_counts_known_start_facts_and_elevens_without_finalising_scores(db):  # noqa: F811
    record = keep(db, 3)
    early = LOCK + timedelta(days=1, hours=4)
    second = {
        **deepcopy(record["players"]["p0"]["games"][0]),
        "id": "later",
        "kickoff": (END - timedelta(hours=2)).isoformat(),
        "ffMatch": {"id": 8},
    }
    record["players"]["p0"]["games"].append(second)
    player_games.save_statements(db, record, LOCK - timedelta(hours=1))
    put(db, "score_record:gw", record, early)
    first = db.get(PlayerGame, ("p0", "g"))
    first.status, first.score, first.ff_xi = "REVIEWING", 0, True
    no_show = db.get(PlayerGame, ("p1", "g"))
    no_show.status, no_show.played, no_show.started, no_show.score, no_show.ff_xi = (
        "DID_NOT_PLAY",
        False,
        None,
        None,
        False,
    )
    db.get(PlayerGame, ("p2", "g")).started = None
    future = db.get(PlayerGame, ("p0", "later"))
    future.status, future.played, future.started, future.score = "FINAL", True, True, 99
    db.commit()
    side = {"club": "ATL", "published": True, "players": {"0": {"xi": True, "line": "MID"}}}
    put(db, ff_chances.KEY, {"matches": {"7": {"atLock": {"home": side}}}}, early)
    frozen = deepcopy(db.get(ReadModel, "score_record:gw").payload)
    audit.publish(db, early)
    page = deepcopy(db.get(ReadModel, "audit").payload)
    assert page["starts"]["weeks"][0]["games"] == 4
    assert page["starts"]["weeks"][0]["settled"] == 2
    for source in starts.SOURCES:
        assert page["starts"]["live"][source]["settled"] == 2
        assert page["elevens"]["all"][source]["checked"] == 1
    assert page["xscore"]["live"]["marked"] == 0
    assert page["versus"]["settled"] == 0
    first.started = False  # a later correction replaces the case; it does not add a second case
    db.commit()
    audit.publish(db, early + timedelta(minutes=30))
    corrected = deepcopy(db.get(ReadModel, "audit").payload)
    assert corrected["starts"]["weeks"][0]["settled"] == 2
    assert corrected["elevens"]["all"]["futbolfantasy"]["started"] == 0
    audit.publish(db, early + timedelta(hours=1))
    assert db.get(ReadModel, "audit").payload["starts"] == corrected["starts"]
    assert db.get(ReadModel, "score_record:gw").payload == frozen


def test_legacy_start_only_record_checks_each_game_while_a_later_game_is_pending(db):  # noqa: F811
    keep(db, 2)
    db.delete(db.get(ReadModel, "score_record:gw"))
    later = db.get(PlayerGame, ("p1", "g"))
    later.date, later.status = END - timedelta(hours=1), "PENDING"
    db.commit()
    put(
        db,
        starts.START_KEY,
        {
            "weeks": {
                "old": {
                    "lock": LOCK.isoformat(),
                    "players": {slug: {"games": {"g": {"sofix": {"chance": 0.7}}}} for slug in ("p0", "p1")},
                }
            }
        },
        NOW,
    )
    page = audit.from_kept(db, LOCK + timedelta(days=1, hours=4))
    assert page["starts"]["live"]["sofix"]["settled"] == 1


def test_release_republishes_already_saved_starts_on_an_idle_job_before_gw_end(db, monkeypatch):  # noqa: F811
    from contextlib import nullcontext

    from app.jobs import score_checks as job

    keep(db)
    early = LOCK + timedelta(days=1, hours=4)
    old_page = audit.from_kept(db, early)
    old_page["settlementVersion"] = 1
    for source in starts.SOURCES:
        old_page["starts"]["live"][source]["settled"] = 0
    put(db, "audit", old_page, early)

    class Clock:
        @staticmethod
        def now(_):
            return early

    calls = []
    monkeypatch.setattr(job, "datetime", Clock)
    monkeypatch.setattr(job, "SessionLocal", lambda: nullcontext(db))
    monkeypatch.setattr(job, "SorareClient", lambda: nullcontext(object()))
    monkeypatch.setattr(job.score_checks, "run", lambda *args: {"games": 0, "failed": 0, "pending": 0})
    monkeypatch.setattr(job, "notify_app", lambda *args: calls.append("revalidate"))
    job.main()
    assert db.get(ReadModel, "audit").payload["starts"]["live"]["sofix"]["settled"] == 2
    job.main()
    assert calls == ["revalidate"]


def test_post_lock_week_metadata_is_not_used_as_a_prediction(db):  # noqa: F811
    record = keep(db)
    record["writtenAt"] = (LOCK + timedelta(minutes=1)).isoformat()
    put(db, "score_record:gw", record, NOW)
    audit.publish(db, NOW)
    assert db.get(ReadModel, "audit").payload["xscore"]["live"]["noted"] == 0


def test_kept_projection_status_counts_games_and_only_prelock_changes(db):  # noqa: F811
    record = keep(db)
    assert player_games.summary(db) == {"gameweeks": 1, "rows": 2, "projections": 2, "scored": 2}
    record["players"]["p0"]["games"][0]["sorare"] += 2
    assert player_games.moved(db, record, LOCK - timedelta(minutes=1)) == 1
    assert player_games.moved(db, record, LOCK) == 0


def test_week_metadata_is_frozen_with_its_source_readings(db):  # noqa: F811
    record = records()
    player_games.save_record(db, record, LOCK - timedelta(minutes=1))
    record["players"]["p0"]["mu"] = 99
    record["writtenAt"] = LOCK.isoformat()
    assert player_games.save_record(db, record, LOCK) == 0
    assert db.get(ReadModel, "score_record:gw").payload["players"]["p0"]["mu"] == 50


def test_elevens_preserve_formation_ties_and_absences_and_count_by_week_and_club(db):  # noqa: F811
    keep(db)
    side = {
        "club": "ATL",
        "published": True,
        "players": {"0": {"xi": True, "line": "MID", "kind": None}, "1": {"xi": False, "line": "MID", "kind": None}},
    }
    put(
        db,
        ff_chances.KEY,
        {
            "matches": {
                "7": {"gw": "gw", "atLock": {"at": (LOCK - timedelta(hours=1)).isoformat(), "home": side, "away": {}}}
            }
        },
        NOW,
    )
    first = db.get(PlayerGame, ("p0", "g"))
    first.ff_xi, first.started, first.sofix_start, first.sorare_start = True, False, 0.4, 0.8
    second = db.get(PlayerGame, ("p1", "g"))
    second.ff_xi, second.sofix_start, second.sorare_start = False, 0.9, 0.8
    db.commit()
    audit.publish(db, NOW)
    xi = db.get(ReadModel, "audit").payload["elevens"]
    assert xi["all"]["futbolfantasy"]["started"] == 0
    assert xi["all"]["sofix"]["started"] == 1
    assert xi["all"]["sorare"]["started"] == 0, "ties keep FF's starter"
    for group in [xi["all"], xi["weeks"][0]["sources"], xi["clubs"][0]["sources"]]:
        assert group["sofix"]["checked"] == 1 and group["sofix"]["rate"] == 1.0
        assert group["futbolfantasy"]["checked"] == 1 and group["futbolfantasy"]["rate"] == 0.0
    assert xi["weeks"][0]["week"] == 18 and xi["clubs"][0]["club"] == "ATL"
    side["players"]["1"]["kind"] = "suspended"
    put(db, ff_chances.KEY, {"matches": {"7": {"gw": "gw", "atLock": {"home": side, "away": {}}}}}, NOW)
    audit.publish(db, NOW)
    assert db.get(ReadModel, "audit").payload["elevens"]["all"]["sofix"]["started"] == 0


def test_missions_settle_from_kept_stats_and_missing_candidate_does_not_mean_dnp(db):  # noqa: F811
    at = datetime(2026, 10, 8, 12, tzinfo=UTC)
    payload = log([cand("a"), cand("unknown")], ["a"])
    put(db, "missions_log:2026-10", payload, NOW)
    player_games.save(
        db,
        {
            "a": [
                {
                    "gameId": "Game:1",
                    "date": "2026-10-06T19:00:00Z",
                    "competition": "laliga-es",
                    "status": "FINAL",
                    "played": True,
                    "started": True,
                    "stats": [{"stat": "goals", "statValue": 1, "totalScore": 25}],
                }
            ]
        },
        at,
    )
    missions.settle_kept(db, at)
    found = db.get(ReadModel, "missions_log:2026-10").payload["days"]["2026-10-06"]["limited"]["cands"]
    assert found[0]["r"]["did"]["Decisive Picker"] is True
    assert "r" not in found[1]
