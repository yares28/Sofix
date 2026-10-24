# ruff: noqa: F811
from copy import deepcopy
from datetime import UTC, datetime, timedelta

import pytest

from app.models import PlayerGame, ReadModel
from app.services.publish import put
from app.sorare import audit, frozen_scores
from tests.test_pipeline import db  # noqa: F401

END = datetime(2026, 10, 6, 14, tzinfo=UTC)
NOW = END + timedelta(days=2)


def frozen():
    def card(slug, pos, slot, **extra):
        return {
            "slug": f"card-{slug}",
            "player": slug,
            "name": slug,
            "pos": pos,
            "slot": slot,
            "rarity": "limited",
            "inSeason": True,
            "level": 10,
            "average": 40,
            "club": slug,
            "mult": 1.1,
            "captain": False,
            **extra,
        }

    return {
        "gameweek": {
            "slug": "gw",
            "number": 20,
            "start": (END - timedelta(days=4)).isoformat(),
            "end": END.isoformat(),
        },
        "builtAt": (END - timedelta(days=5)).isoformat(),
        "playing": {
            "players": [
                {"player": slug, "games": [{"id": gid} for gid in gids]}
                for slug, gids in {"a": ["g1", "g2"], "b": ["g1"], "c": ["g1"]}.items()
            ]
        },
        "plans": [
            {
                "rank": 1,
                "lineups": [
                    {
                        "comp": "LaLiga",
                        "board": "b",
                        "key": "LaLiga | Limited",
                        "group": "Classic",
                        "rarity": "limited",
                        "x": 150,
                        "captainBonus": 0.5,
                        "clubBonus": [2, 0.05],
                        "averageBonus": [100, 0.05],
                        "minInSeason": 0,
                        "starters": [card("a", "MID", "MID", captain=True), card("b", "DEF", "EXT")],
                        "subs": [card("c", "FWD", "OUT")],
                    }
                ],
            }
        ],
    }


def keep(db):
    put(db, "sorare_plan:gw", frozen(), NOW)
    for player, game, played, score in [
        ("a", "g1", True, 40),
        ("a", "g2", True, 80),
        ("b", "g1", False, None),
        ("c", "g1", True, 50),
    ]:
        db.add(
            PlayerGame(
                player=player,
                game_id=game,
                date=END - timedelta(days=1),
                competition="laliga-es",
                status="FINAL",
                played=played,
                started=played,
                score=score,
                read_at=NOW,
            )
        )
    db.commit()


def test_frozen_lineups_use_best_double_game_score_saved_multipliers_captain_and_substitution_rules(db):
    keep(db)
    result = frozen_scores.read(db, NOW)[0]
    line = result["plans"][0]["lineups"][0]
    assert line["score"] == pytest.approx(80 * 1.6 + 50 * 1.1)  # sub removes lineup bonuses, never inherits captain
    assert line["cameIn"] == [{"sub": "card-c", "for": "card-b"}]
    assert line["bonusLost"] is True
    assert db.get(ReadModel, "sorare_plan:gw").payload == frozen()
    assert audit.from_kept(db, NOW)["frozenPlans"] == [result]


def test_missing_pending_or_unscored_results_are_unknown_never_a_dnp(db):
    keep(db)
    row = db.get(PlayerGame, ("a", "g2"))
    for status, played, score in [
        ("PENDING", True, 80),
        ("REVIEWING", True, 80),
        ("FINAL", None, 80),
        ("FINAL", True, None),
        ("DID_NOT_PLAY", True, 80),
    ]:
        row.status, row.played, row.score = status, played, score
        db.commit()
        assert frozen_scores.read(db, NOW)[0]["plans"][0]["lineups"][0]["score"] is None
    db.delete(row)
    db.commit()
    assert frozen_scores.read(db, NOW)[0]["plans"][0]["lineups"][0]["score"] is None


def test_sorares_explicit_did_not_play_status_allows_a_known_substitution(db):
    keep(db)
    db.get(PlayerGame, ("b", "g1")).status = "DID_NOT_PLAY"
    db.commit()
    line = frozen_scores.read(db, NOW)[0]["plans"][0]["lineups"][0]
    assert line["score"] == pytest.approx(183)
    assert line["cameIn"] == [{"sub": "card-c", "for": "card-b"}]


def test_waits_a_day_and_does_not_guess_missing_frozen_rules(db):
    keep(db)
    assert frozen_scores.read(db, END + timedelta(hours=23)) == []
    value = deepcopy(frozen())
    del value["plans"][0]["lineups"][0]["starters"][0]["mult"]
    put(db, "sorare_plan:gw", value, NOW)
    assert frozen_scores.read(db, NOW)[0]["plans"][0]["lineups"][0]["score"] is None


def test_incomplete_old_plan_is_unscorable_not_a_result_still_pending(db):
    keep(db)
    value = deepcopy(frozen())
    del value["plans"][0]["lineups"][0]["clubBonus"]
    put(db, "sorare_plan:gw", value, NOW)
    line = frozen_scores.read(db, NOW)[0]["plans"][0]["lineups"][0]
    assert line["score"] is None
    assert line["reason"] == "incomplete-plan"


def test_lineups_audit_judges_sofix_and_sorare_plans_by_score_and_by_prize_and_keeps_a_settled_week(db):
    from app.sorare import lineup_audit

    keep(db)
    db.get(PlayerGame, ("b", "g1")).status = "DID_NOT_PLAY"  # the lineup scores 183
    tiers = [
        {"lo": 1, "hi": 10, "cash": 5, "essence": 0, "card": False},
        {"lo": 11, "hi": 100, "cash": 0, "essence": 250, "card": False},
        {"lo": 101, "hi": 500, "cash": 0, "essence": 0, "card": False, "xp": 500},
    ]
    sofix = deepcopy(frozen())
    sofix["plans"][0]["lineups"][0]["tiers"] = tiers  # expected 150: 33 points off
    second = deepcopy(sofix["plans"][0])
    second["rank"] = 2
    second["lineups"][0]["x"] = 170
    sofix["plans"].append(second)
    sorare = {"gameweek": sofix["gameweek"], "plans": [deepcopy(second) | {"rank": 1}]}  # expected 170: within 15
    put(db, "sorare_plan:gw", sofix, NOW)
    put(db, "sorare_alt:gw", sorare, NOW)
    put(db, "sorare_references", {"gw": {"LaLiga | Limited": {"cuts": {"10": 300, "100": 200, "500": 100}}}}, NOW)
    db.commit()

    got = lineup_audit.read(db, NOW)
    assert got["band"] == 15
    best, other = got["plans"]["sofix"]
    assert (best["rank"], best["scored"], best["hit"]) == (1, 1, 0)
    assert (other["rank"], other["hit"]) == (2, 1)  # every plan has its own rate
    assert best["won"] == {"card": 0, "cash": 0, "essence": 0, "xp": 1, "none": 0}  # 183 reaches the XP tier only
    assert got["plans"]["sorare"][0]["hit"] == 1
    assert got["weeks"][0]["final"] is True

    # A settled week is kept: the plans are not opened again, so what they said then stays what is counted.
    db.delete(db.get(ReadModel, "sorare_plan:gw"))
    put(
        db, "sorare_plan:other", {"gameweek": {"slug": "other", "number": 21, "end": NOW.isoformat()}, "plans": []}, NOW
    )
    db.commit()
    assert lineup_audit.read(db, NOW)["plans"] == got["plans"]


def test_a_prize_cannot_be_said_without_the_scores_that_paid(db):
    from app.sorare import lineup_audit

    keep(db)
    tally = lineup_audit.read(db, NOW, write=False)["plans"]["sofix"][0]
    assert (tally["lineups"], tally["judged"]) == (1, 0)
    assert db.get(ReadModel, lineup_audit.KEY) is None


def test_missing_results_are_not_permanently_closed_after_fourteen_days(db):
    from app.sorare import lineup_audit

    keep(db)
    row = db.get(PlayerGame, ("a", "g2"))
    row.status, row.score = "PENDING", None
    db.commit()
    late = END + timedelta(days=16)
    assert lineup_audit.read(db, late)["weeks"][0]["final"] is False
    row.status, row.score = "FINAL", 80
    db.commit()
    got = lineup_audit.read(db, late + timedelta(hours=1))
    assert got["plans"]["sofix"][0]["scored"] == 1
    assert lineup_audit.read(db, late + timedelta(hours=2))["plans"] == got["plans"]


def test_sorare_plan_uses_its_own_saved_game_map_for_an_alternative_only_player(db):
    from app.sorare import lineup_audit

    keep(db)
    other = deepcopy(frozen())
    other["playing"]["players"][0] = {"player": "alternative", "games": [{"id": "other-game"}]}
    other["plans"][0]["lineups"][0]["starters"][0]["player"] = "alternative"
    db.add(
        PlayerGame(
            player="alternative",
            game_id="other-game",
            date=END,
            competition="laliga-es",
            status="FINAL",
            played=True,
            started=True,
            score=80,
        )
    )
    put(db, "sorare_alt:gw", other, NOW)
    got = lineup_audit.read(db, NOW)
    assert got["plans"]["sorare"][0]["scored"] == 1


def test_old_final_cache_is_rebuilt_when_it_has_incorrectly_closed_missing_results(db):
    from app.sorare import lineup_audit

    keep(db)
    stale = {
        "slug": "gw",
        "number": 20,
        "end": END.isoformat(),
        "final": True,
        "sofix": [
            {
                "rank": 1,
                "lineups": 1,
                "scored": 0,
                "hit": 0,
                "judged": 0,
                "won": {"card": 0, "cash": 0, "essence": 0, "xp": 0, "none": 0},
            }
        ],
        "sorare": [],
    }
    put(db, lineup_audit.KEY, {"weeks": {"gw": stale}}, NOW)
    assert lineup_audit.read(db, NOW)["plans"]["sofix"][0]["scored"] == 1


def test_missing_reward_cut_for_one_board_is_retried_even_when_another_board_has_cuts(db):
    from app.sorare import lineup_audit

    keep(db)
    plan = deepcopy(frozen())
    plan["plans"][0]["lineups"][0]["tiers"] = [{"lo": 1, "hi": 100, "essence": 250}]
    put(db, "sorare_plan:gw", plan, NOW)
    put(db, "sorare_references", {"gw": {"other-board": {"cuts": {"100": 100}}}}, NOW)
    first = lineup_audit.read(db, NOW)
    assert first["weeks"][0]["final"] is False
    assert first["plans"]["sofix"][0]["judged"] == 0
    put(db, "sorare_references", {"gw": {"LaLiga | Limited": {"cuts": {"100": 100}}}}, NOW)
    second = lineup_audit.read(db, NOW)
    assert second["plans"]["sofix"][0]["judged"] == 1
    assert second["plans"]["sofix"][0]["won"]["essence"] == 1
