"""The score engine's E1 (plans/score-engine.md §7): roles from the eleven, each stat's rate, the all-around part if he starts."""

from __future__ import annotations

import math

import numpy as np
import pytest

from app.sorare.engine import allround, roles
from app.sorare.keeper import GameNumbers

S = allround.STATS.index


def test_a_back_four_has_full_backs_at_its_ends_and_a_front_three_wingers() -> None:
    lines = [["gk"], ["rb", "cb1", "cb2", "lb"], ["dm1", "dm2"], ["rw", "am", "lw"], ["st"]]
    assert roles.roles_of(lines) == {
        "gk": "GK",
        "rb": "FB",
        "cb1": "CB",
        "cb2": "CB",
        "lb": "FB",
        "dm1": "CM",
        "dm2": "CM",
        "rw": "AM",
        "am": "AM",
        "lw": "AM",
        "st": "ST",
    }


def test_behind_a_back_three_the_ends_of_the_midfield_four_are_wing_backs() -> None:
    lines = [["gk"], ["c1", "c2", "c3"], ["rwb", "m1", "m2", "lwb"], ["w1", "st", "w2"]]
    found = roles.roles_of(lines)
    assert [found[p] for p in ("c1", "rwb", "m1", "lwb", "w1", "st")] == ["CB", "FB", "CM", "FB", "AM", "ST"]


def test_a_four_four_two_has_wide_midfielders_and_two_strikers() -> None:
    found = roles.roles_of([["gk"], ["a", "b", "c", "d"], ["rm", "c1", "c2", "lm"], ["s1", "s2"]])
    assert [found[p] for p in ("rm", "c1", "lm", "s1", "s2")] == ["AM", "CM", "AM", "ST", "ST"]


def game(day: int, rows: dict[str, dict[str, object]], lines: list[list[str]] | None = None) -> dict[str, object]:
    """A made-up game: `rows` are players with pos, mins, started and stats {name: count}."""
    players = {}
    for slug, row in rows.items():
        stats = {
            name: [float(c), float(c) * allround.TABLE_V7[str(row["pos"])].get(name, 0.0)]
            for name, c in row.get("stats", {}).items()
        }  # type: ignore[attr-defined]
        players[slug] = {
            "pos": row["pos"],
            "team": "home",
            "played": int(row["mins"]) > 0,  # type: ignore[call-overload]
            "started": row.get("started", True),
            "mins": row["mins"],
            "stats": stats,
            "score": 40.0,
            "aa": sum(v[1] for v in stats.values()),
            "level": 35.0,
        }
    xi = lines or [[s for s, r in rows.items() if r.get("started", True)]]
    return {
        "date": f"2025-09-{day:02d}T18:00:00Z",
        "home": {"slug": "home"},
        "away": {"slug": "away"},
        "players": players,
        "xi": {"home": {"start": xi}, "away": {"start": []}},
    }


def settings(k: float, tau: float = math.inf) -> allround.Settings:
    n = len(allround.STATS)
    return allround.Settings(k=np.full(n, k), tau=np.full(n, tau))


def test_a_rate_is_his_count_pulled_towards_his_role_by_k_ninetieths() -> None:
    # The role (CM) made 4 tackles per 90 over 900 minutes; he made 2 in his 180 of them. With k = 2: (2 + 2 × 4) / (2 + 2) = 2.5.
    book = allround.Book(settings(2.0))
    mids = [["gk"], ["d1", "d2", "d3", "d4"], ["me", "x"]]
    book.add(
        game(
            1,
            {
                "me": {"pos": "MID", "mins": 90, "stats": {"won_tackle": 1}},
                "x": {"pos": "MID", "mins": 90, "stats": {"won_tackle": 7}},
            },
            mids,
        )
    )
    book.add(
        game(
            8,
            {
                "me": {"pos": "MID", "mins": 90, "stats": {"won_tackle": 1}},
                "x": {"pos": "MID", "mins": 90, "stats": {"won_tackle": 7}},
            },
            mids,
        )
    )
    for day in (15, 22, 29):
        book.add(
            game(
                day,
                {
                    "y": {"pos": "MID", "mins": 90, "stats": {"won_tackle": 4}},
                    "z": {"pos": "MID", "mins": 90, "stats": {"won_tackle": 4}},
                },
                [["gk"], ["d1", "d2", "d3", "d4"], ["y", "z"]],
            )
        )
    # role: (1 + 7 + 1 + 7 + 6 × 4) tackles in 900 minutes = 4 per 90
    assert book.rate("me", "CM")[S("won_tackle")] == pytest.approx((2 + 2 * 4) / (2 + 2))
    # a player never seen has his role's rate
    assert book.rate("new", "CM")[S("won_tackle")] == pytest.approx(4.0)


def test_older_games_weigh_less_when_a_stat_forgets() -> None:
    # One game 30 days ago with 6 tackles, one today with 0, τ = 30 days: weights e^-1 and 1, no pull (k = 0).
    book = allround.Book(settings(0.0, tau=30.0))
    lines = [["gk"], ["d1", "d2", "d3", "d4"], ["me"]]
    book.add(game(1, {"me": {"pos": "MID", "mins": 90, "stats": {"won_tackle": 6}}}, lines))
    book.add(game(30, {"me": {"pos": "MID", "mins": 90, "stats": {}}}, lines))
    w = math.exp(-29 / 30)
    assert book.rate("me", "CM", at=allround.day_of("2025-09-30T18:00:00Z"))[S("won_tackle")] == pytest.approx(
        6 * w / (w + 1)
    )


def test_his_usual_minutes_and_role_come_from_his_starts() -> None:
    book = allround.Book(settings(1.0))
    lines = [["gk"], ["rb", "c1", "c2", "lb"], ["m"]]
    for day, mins in ((1, 60), (8, 70), (15, 80)):
        book.add(game(day, {"rb": {"pos": "DEF", "mins": mins}, "c1": {"pos": "DEF", "mins": 90}}, lines))
    assert book.usual_role("rb", "DEF") == "FB" and book.usual_role("c1", "DEF") == "CB"
    assert book.usual_role("unknown", "FWD") == "ST"
    mins, p60 = book.minutes("rb", "FB")
    assert 60 < mins < 90  # pulled from his 70 towards the role's, which he alone makes
    assert p60 == pytest.approx(1.0)


def test_the_all_around_adds_each_stat_at_its_points_and_takes_goals_conceded_from_the_match() -> None:
    # A defender who always plays 90 and makes 3 won tackles (3 points each) and nothing else, k = 0. His side is expected to concede 1.5
    # goals (−4 each) and keep a clean sheet 25% of the time (+10 at 60 minutes): 9 − 6 + 2.5 = 5.5.
    book = allround.Book(settings(0.0))
    lines = [["gk"], ["me", "c", "d", "e"]]
    for day in (1, 8):
        book.add(game(day, {"me": {"pos": "DEF", "mins": 90, "stats": {"won_tackle": 3, "goals_conceded": 2}}}, lines))
    numbers = GameNumbers(cs=0.25, xga=1.5, xgf=1.0)
    assert allround.expected("me", "DEF", book, numbers) == pytest.approx(9 - 6 + 2.5)


def test_the_points_table_is_read_from_the_games() -> None:
    g = game(1, {"me": {"pos": "DEF", "mins": 90, "stats": {"won_tackle": 2, "duel_won": 4}}})
    table = allround.points_from([g])
    assert table["DEF"]["won_tackle"] == pytest.approx(3.0) and table["DEF"]["duel_won"] == pytest.approx(1.5)
