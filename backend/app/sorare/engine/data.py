"""The games the engine learns from: the whole LaLiga export (2023/24 on) joined to the football model's forecast from the Monday before
each match, the shots and the over/under prices (`app.sorare.gamedata`). The shipped lines join only 2025/26 on; the engine's per-stat
rates, styles and shares are tuned on 2023/24 and 2024/25, so it joins those seasons too (the football model's settings were tuned on
2019/20 to 2022/23, so these forecasts are out of sample)."""

from __future__ import annotations

from pathlib import Path
from typing import Any

import pandas as pd

from app.sorare import gamedata

SEASONS = (2023, 2024, 2025, 2026)
TUNE_UNTIL = "2025-08-01"  # rates, styles and shares are fitted on the games before this; the shipped lines' walk-forward starts here


def load(
    games: Path = gamedata.DEFAULT_GAMES, cache: Path = gamedata.DEFAULT_CACHE
) -> tuple[list[dict[str, Any]], pd.Timestamp]:
    """Every game of the export with `ctx` (see `gamedata.join`), oldest first, and the newest football-data match day."""
    from app.backtest.data import load_history

    matches = load_history(range(2016, 2027), cache, refresh_latest=False)
    joined, _ = gamedata.join(
        gamedata.read_games(games),
        gamedata.forecasts_ahead(matches, SEASONS),
        gamedata.read_extras(cache, SEASONS),
    )
    return joined, matches["date"].max()
