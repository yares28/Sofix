"""The six foreign boards change only when something in them changed (plans/multi-competition-review.md B3).

Each refresh refits every board, and the fit moves its numbers in the fifth decimal (the European fit weighs games by
their age to the second). Stamping each run's time on every upcoming game and on the board rewrote ~4.2 MB a refresh to
Neon and R2 and rebuilt every board page for nothing. So a game keeps its old forecast and time while its numbers stay
within `TOLERANCE`, the board keeps its old times while nothing in it moved, and the one thing written every run is the
tiny `board_checks` block: {competition: when its board was last checked}, which the Sorare step and the pill read.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any

from sqlalchemy.orm import Session

from app.schemas import ApiResponse, CellPrediction, FixtureGrid
from app.services import kept_blocks
from app.services.fixture_grid import lens_scales

KEY = "board_checks"
TOLERANCE = 5e-4  # a twentieth of a percentage point: far below anything a page shows or an xScore feels


def _close(old: CellPrediction, new: CellPrediction) -> bool:
    def flat(value: Any, prefix: str = "") -> dict[str, Any]:
        if isinstance(value, dict):
            return {k: v for key, item in value.items() for k, v in flat(item, f"{prefix}{key}.").items()}
        return {prefix: value}

    a, b = flat(old.model_dump()), flat(new.model_dump())
    if a.keys() != b.keys():
        return False
    for key, x in a.items():
        y = b[key]
        numbers = isinstance(x, float | int) and isinstance(y, float | int) and not isinstance(x, bool)
        if not (abs(x - y) <= TOLERANCE if numbers else x == y):
            return False
    return True


def _numbers(data: dict[str, Any]) -> list[Any]:
    cells = [c for t in data["teams"] for col in t["cells"] for c in col]
    return [data["lens_scales"], *((c["prediction"], c["forecast_at"]) for c in cells)]


def _fixtures(data: dict[str, Any]) -> dict[str, Any]:
    teams = [
        {**t, "cells": [[{**c, "prediction": None, "forecast_at": None} for c in col] for col in t["cells"]]}
        for t in data["teams"]
    ]
    return {**data, "teams": teams, "lens_scales": None}


def settle(
    body: ApiResponse[FixtureGrid], previous: ApiResponse[FixtureGrid] | None, now: datetime
) -> ApiResponse[FixtureGrid]:
    """`body` with the previous board's forecasts and times wherever nothing moved; same object, changed in place."""
    if previous is None or previous.data is None or body.data is None or body.meta is None:
        return body
    old = {(t.code, c.fixture_id, c.venue): c for t in previous.data.teams for col in t.cells for c in col}
    cells = [c for t in body.data.teams for col in t.cells for c in col]
    for team in body.data.teams:
        for col in team.cells:
            for cell in col:
                prior = old.get((team.code, cell.fixture_id, cell.venue))
                if (
                    cell.prediction is not None
                    and cell.forecast_at == now
                    and prior is not None
                    and prior.prediction is not None
                    and prior.forecast_at is not None
                    and prior.forecast_at < cell.kickoff_utc  # still a forecast saved before kickoff
                    and _close(prior.prediction, cell.prediction)
                ):
                    cell.prediction, cell.forecast_at = prior.prediction, prior.forecast_at
    body.data.lens_scales = lens_scales(cells)
    if previous.meta is not None:
        new, kept = body.data.model_dump(mode="json"), previous.data.model_dump(mode="json")
        if _numbers(new) == _numbers(kept):
            body.meta.last_predicted_at = previous.meta.last_predicted_at
        if _fixtures(new) == _fixtures(kept):
            body.meta.last_synced_at = previous.meta.last_synced_at
    return body


def previous(db: Session, key: str) -> ApiResponse[FixtureGrid] | None:
    """The board as last published, read the way jobs read blocks (R2 first, kept in GitHub's cache), never `db.get`."""
    row = kept_blocks.read(db, key)
    return ApiResponse[FixtureGrid].model_validate(row.payload) if row else None


def read(db: Session) -> dict[str, str]:
    row = kept_blocks.read(db, KEY)
    return dict(row.payload) if row and isinstance(row.payload, dict) else {}


def record(db: Session, codes: list[str], now: datetime) -> None:
    """Mark these boards checked now (built and published, changed or not)."""
    from app.services.publish import put

    put(db, KEY, {**read(db), **{code: now.isoformat() for code in codes}}, now)
