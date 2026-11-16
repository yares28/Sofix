"""The score engine's E2 (the opponent's style, home or away, the game state) and E4 (decisive actions by kind), plans/score-engine.md §7."""

from __future__ import annotations

import math

import numpy as np
import pytest

from app.sorare.engine import allround, decisive, style, walk
from app.sorare.engine.allround import STATS

S = STATS.index


def test_a_clubs_factor_is_made_over_expected_pulled_towards_one_by_m_games() -> None:
    # Against one club, CMs made 12 tackles where their own rates said 8, over 4 games. With m = 4 games' worth of "no effect" (8 × 4/4 =
    # 8 expected tackles at 1): (12 + 8) / (8 + 8) = 1.25. With no pull it is 1.5; with a huge pull it is 1.
    found = style._Sum()
    made, expected = np.zeros(len(STATS)), np.zeros(len(STATS))
    made[S("won_tackle")], expected[S("won_tackle")] = 3.0, 2.0
    for _ in range(4):
        found.add(0.0, made, expected)
    tackle = S("won_tackle")
    assert found.factor(0.0, np.full(len(STATS), 4.0))[tackle] == pytest.approx(1.25)
    assert found.factor(0.0, np.zeros(len(STATS)))[tackle] == pytest.approx(1.5)
    assert found.factor(0.0, np.full(len(STATS), 1e9))[tackle] == pytest.approx(1.0)


def test_goals_conceded_and_the_clean_sheet_never_take_a_style_or_a_game_state() -> None:
    settings = style.StyleSettings(
        m_club=np.zeros(len(STATS)), m_venue=np.zeros(len(STATS)), state={"DEF": np.full((2, len(STATS)), 0.5)}
    )
    f = style.Style(settings).state("DEF", 1.0, 1.0)
    assert f[S("goals_conceded")] == 1.0 and f[S("clean_sheet_60")] == 1.0
    assert f[S("won_tackle")] == pytest.approx(math.exp(1.0))


def test_the_game_state_fit_finds_a_known_effect_and_none_where_there_is_none() -> None:
    rng = np.random.default_rng(7)
    x = rng.normal(0.0, 0.6, size=(6000, 2))
    offset = np.full((6000, 2), 3.0)
    y = np.column_stack([rng.poisson(3.0 * np.exp(0.3 * x[:, 0])), rng.poisson(3.0, 6000)])
    b = style.fit_state(x, offset, y, ridge=1.0)
    assert b[0, 0] == pytest.approx(0.3, abs=0.03) and abs(b[1, 0]) < 0.03
    assert abs(b[0, 1]) < 0.03 and abs(b[1, 1]) < 0.03


def counts(**kinds: float) -> np.ndarray:
    out = np.zeros(len(STATS))
    for name, value in kinds.items():
        out[S(name)] = value
    return out


def test_a_forwards_chance_of_a_decisive_action_is_one_minus_no_goal_and_no_assist() -> None:
    level = decisive.level_of(counts(goals=0.4, goal_assist=0.2))
    assert level.p_decisive == pytest.approx(1 - math.exp(-0.6), abs=1e-6)
    assert level.kinds["goals"] == pytest.approx(1 - math.exp(-0.4))
    assert sum(level.pmf.values()) == pytest.approx(1.0)


def test_a_keepers_clean_sheet_is_a_coin_on_top_of_his_other_kinds() -> None:
    level = decisive.level_of(counts(penalty_save=0.0), clean_sheet=0.3)
    assert level.pmf[1] == pytest.approx(0.3) and level.pmf[0] == pytest.approx(0.7)
    assert level.kinds["clean_sheet"] == 0.3


def test_the_expected_score_follows_sorares_formula_with_its_floor() -> None:
    # Half the time level 1 (60, floor 60), half level 0 (35). All-around −10: 0.5 × max(60, 50) + 0.5 × 25 = 42.5.
    level = decisive.Level({1: 0.5, 0: 0.5}, {})
    assert level.score(-10.0) == pytest.approx(0.5 * 60 + 0.5 * 25)
    assert level.score(80.0) == pytest.approx(0.5 * 100 + 0.5 * 100)  # never above 100


def test_a_negative_action_takes_a_level_off() -> None:
    level = decisive.level_of(counts(red_card=0.1))
    assert level.p_negative == pytest.approx(1 - math.exp(-0.1), abs=1e-6)
    assert level.pmf[-1] == pytest.approx(0.1 * math.exp(-0.1), abs=1e-6)


def test_the_decisive_scale_makes_the_chance_honest() -> None:
    # Starts said 0.25 positive actions (a 22% chance), but 25% had one: the scale lifts the counts to −ln(0.75) / 0.25 ≈ 1.15 times.
    levels = [(0.25, 0.0)] * 400
    hit = [i % 4 == 0 for i in range(400)]
    assert decisive.fit_scale(levels, hit) == pytest.approx(-math.log(0.75) / 0.25, abs=0.02)


def _game(day: int, goals: int, home_goals: int = 1) -> dict[str, object]:
    return {
        "id": f"g{day}",
        "date": f"2025-09-{day:02d}T18:00:00Z",
        "home": {"slug": "home"},
        "away": {"slug": "away"},
        "homeGoals": home_goals,
        "awayGoals": 0,
        "xi": {"home": {"start": [["k"], ["a", "b", "c", "d"], ["m1", "m2"], ["s"]]}, "away": {"start": []}},
        "ctx": {"forecast": {"cs_h": 0.4, "cs_a": 0.2, "lam_h": 1.5, "lam_a": 1.0}, "ou": None},
        "players": {
            "s": {
                "pos": "FWD",
                "team": "home",
                "played": True,
                "started": True,
                "mins": 90,
                "score": 60.0 if goals else 40.0,
                "aa": 5.0,
                "level": 60.0 if goals else 35.0,
                "stats": {"goals": [float(goals), 0.0]} if goals else {},
            }
        },
    }


def test_the_walk_never_reads_a_game_before_it_is_played() -> None:
    settings = walk.EngineSettings(
        rates=allround.Settings(k=np.full(len(STATS), 1.0), tau=np.full(len(STATS), math.inf)), style=style.neutral()
    )
    early = [_game(1, 1), _game(8, 0), _game(15, 1)]
    one = walk.walk(early + [_game(22, 0)], settings, "2025-09-15")
    other = walk.walk(early + [_game(22, 5)], settings, "2025-09-15")
    assert one[0].said == other[0].said  # the 15th is told the same whatever happens on the 22nd
    assert one[1].said["e4"] == other[1].said["e4"]
    # and the 22nd has learned from the 15th's goal: a higher chance than the 15th had before it
    assert one[1].p_decisive > one[0].p_decisive


def test_engine_settings_survive_a_round_trip() -> None:
    settings = walk.EngineSettings(
        rates=allround.Settings(k=np.arange(len(STATS), dtype=float), tau=np.full(len(STATS), math.inf)),
        style=style.neutral(),
        clean_sheet=(0.1, 1.2),
        scale={"DEF": 0.9},
    )
    back = walk.EngineSettings.from_json(settings.to_json())
    assert np.allclose(back.rates.k, settings.rates.k) and np.isinf(back.rates.tau).all()
    assert back.clean_sheet == (0.1, 1.2) and back.scale == {"DEF": 0.9}
