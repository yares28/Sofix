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
