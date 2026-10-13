"""The strategy replay runs the production strategies on pools of real starts; checked here on invented ones."""

import random

from app.jobs import lineup_backtest
from app.sorare.keeper import Outcome


def _week(seed: int) -> list[dict]:
    rng = random.Random(seed)
    rows = []
    for pos, count in {"GK": 5, "DEF": 12, "MID": 12, "FWD": 12}.items():
        for i in range(count):
            said = rng.uniform(30, 60)
            rows.append(
                {
                    "player": f"{pos}{seed}{i}",
                    "pos": pos,
                    "score": said + rng.uniform(-25, 25),
                    "proj": said + 2,
                    "said": said,
                    "shape": Outcome(0.3, 0.3, said + 15, said - 6, said, said - 20, said + 25),
                    "club": f"club{i % 5}",
                    "game": f"g{seed}{i % 6}",
                    "venue": "H" if i % 2 else "A",
                    "odds": {"win": 0.5, "draw": 0.3, "loss": 0.2},
                }
            )
    return rows


def test_every_strategy_is_replayed_and_none_beats_hindsight_or_loses_to_chance_by_construction():
    found = lineup_backtest.replay({"w1": _week(1), "w2": _week(2)}, pools=12, seed=1)
    table = found["table"]
    assert "surest" not in table and {"xscore", "random", "hindsight", "keeper-defender", "favourites"} <= set(table)
    assert all(row["mean"] <= table["hindsight"]["mean"] + 1e-9 for row in table.values())  # hindsight is the ceiling
    assert table["xscore"]["mean"] > table["random"]["mean"]
    assert found["good"] < found["great"]
    assert "| xScore |" in lineup_backtest.render(found)
