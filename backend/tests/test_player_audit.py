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
    assert page["starts"]["live"] == audit.starts_record(legacy)
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


def test_unknown_and_not_yet_final_week_results_are_not_guessed(db):  # noqa: F811
    keep(db)
    row = db.get(PlayerGame, ("p1", "g"))
    row.started = None
    db.commit()
    audit.publish(db, END + timedelta(hours=23))
    assert db.get(ReadModel, "audit").payload["starts"]["live"]["sofix"]["settled"] == 0
    audit.publish(db, NOW)
    page = db.get(ReadModel, "audit").payload
    assert page["starts"]["live"]["sofix"]["settled"] == 1
    assert page["starts"]["live"]["sofix"]["right"] is None


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
    assert xi["all"]["sofix"]["rate"] is None, "under 100: too few to tell"
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
