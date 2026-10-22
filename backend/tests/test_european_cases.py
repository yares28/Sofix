"""European replay population and actual-deadline contracts."""

from copy import deepcopy

import pytest

from app.research.european_cases import admitted_starters, extra_time, player_game


def test_extra_time_is_distinct_from_regulation_and_includes_scoreless_shootouts():
    assert extra_time({"score": {"regular": {"home": 1, "away": 0}, "total": {"home": 1, "away": 0}}}) is False
    assert (
        extra_time(
            {
                "score": {
                    "regular": {"home": 0, "away": 0},
                    "total": {"home": 0, "away": 0},
                    "penalty": {"home": 5, "away": 4},
                }
            }
        )
        is True
    )


def sample():
    raw = {
        "id": "s",
        "date": "2025-10-24T14:00:00Z",
        "competition": {"slug": "uefa-europa-conference-league"},
        "homeTeam": {"slug": "h"},
        "awayTeam": {"slug": "a"},
    }
    players = []
    for side in ("home", "away"):
        slugs = [f"{side}{i}" for i in range(11)]
        raw[side + "Formation"] = {"startingLineupAvailable": True, "startingLineup": [[{"slug": s} for s in slugs]]}
        players.extend(
            {
                "slug": s,
                "pos": "GK" if i == 0 else "DEF",
                "team": "h" if side == "home" else "a",
                "score": 0,
                "status": "FINAL",
                "ver": 7,
                "started": True,
                "played": True,
                "level": 0,
                "mins": 90,
                "cleanSheet60": 0,
            }
            for i, s in enumerate(slugs)
        )
    return {"raw": raw, "players": players}


def test_all_twenty_two_actual_starters_including_zero_are_required():
    saved = sample()
    assert len(admitted_starters(saved)) == 22
    saved["players"].pop()
    with pytest.raises(ValueError, match="22"):
        admitted_starters(saved)


@pytest.mark.parametrize(
    "field,value",
    [
        ("ver", 6),
        ("status", "REVIEWING"),
        ("team", "club-not-playing"),
        ("score", None),
        ("score", float("nan")),
        ("started", None),
    ],
)
def test_unknown_or_invalid_starter_is_not_silently_filtered(field, value):
    saved = sample()
    saved["players"][0][field] = value
    with pytest.raises(ValueError):
        admitted_starters(saved)


def test_non_xi_disabled_identity_is_retained_but_never_added_as_a_case():
    saved = sample()
    saved["players"].append({**saved["players"][0], "slug": "old-disabled"})
    assert len(admitted_starters(saved)) == 22


def test_resumed_game_uses_actual_original_fixture_lock_and_late_availability():
    saved = sample()
    meta = {**saved["raw"], "so5Fixture": {"slug": "original", "cutOffDate": "2025-10-21T14:00:00Z"}}
    native = {
        "id": "u",
        "date": "2025-10-23T16:45:00+00:00",
        "availableAt": "2025-10-25T16:45:00+00:00",
        "home": "1",
        "away": "2",
        "neutral": False,
    }
    row = player_game("CONF", 2025, native, saved, meta)
    assert row["lock"] == "2025-10-21T14:00:00+00:00" and row["week"] == "original"
    assert row["availableAt"] == "2025-10-26T14:00:00+00:00"
    changed = deepcopy(meta)
    changed["homeTeam"] = {"slug": "wrong"}
    with pytest.raises(ValueError, match="team changed"):
        player_game("CONF", 2025, native, saved, changed)
