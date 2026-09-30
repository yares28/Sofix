from typing import Any

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import ReadModel
from app.schemas import ApiResponse, FixtureGrid
from app.services.fixture_grid import build_fixture_grid, grid_meta
from app.sorare.ff_lineups import LINEUPS_KEY
from app.sorare.publish import AHEAD_PREFIX, ARCHIVE_PREFIX

router = APIRouter(prefix="/api")


@router.get("/health")
def health():
    # Deliberately DB-free: monitors hitting this must not keep Neon awake.
    return {"ok": True}


@router.get("/fixture-grid", response_model=ApiResponse[FixtureGrid])
def fixture_grid(db: Session = Depends(get_db)):
    grid = build_fixture_grid(db)
    if grid is None:
        return ApiResponse[FixtureGrid](success=False, error="No fixtures yet.")
    return ApiResponse[FixtureGrid](success=True, data=grid, meta=grid_meta(db))


@router.get("/sorare", response_model=ApiResponse[dict[str, Any]])
def sorare(db: Session = Depends(get_db)):
    """The Sorare gameweek the job published. Local development only: on Vercel the app reads Neon itself."""
    row = db.get(ReadModel, "sorare")
    if row is None:
        return ApiResponse[dict[str, Any]](success=False, error="Sorare has not been synced yet.")
    return ApiResponse[dict[str, Any]](success=True, data=row.payload)


@router.get("/sorare/week/{slug}", response_model=ApiResponse[dict[str, Any]])
def sorare_week(slug: str, db: Session = Depends(get_db)):
    """One finished gameweek the job kept whole, by its Sorare slug. Local development only, like /sorare."""
    row = db.get(ReadModel, f"{ARCHIVE_PREFIX}{slug}")
    if row is None:
        return ApiResponse[dict[str, Any]](success=False, error="Sofix did not keep this gameweek.")
    return ApiResponse[dict[str, Any]](success=True, data=row.payload)


@router.get("/sorare/ahead/{round}", response_model=ApiResponse[dict[str, Any]])
def sorare_ahead(round: int, db: Session = Depends(get_db)):
    """The early plan the job made for a LaLiga round Sorare has not opened. Local development only, like /sorare."""
    row = db.get(ReadModel, f"{AHEAD_PREFIX}{round}")
    if row is None:
        return ApiResponse[dict[str, Any]](success=False, error="There is no early plan for this round.")
    return ApiResponse[dict[str, Any]](success=True, data=row.payload)


@router.get("/lineups", response_model=ApiResponse[dict[str, Any]])
def lineups(db: Session = Depends(get_db)):
    """Futbol Fantasy's lineups as the Lineups page draws them. Local development only, like /sorare."""
    row = db.get(ReadModel, LINEUPS_KEY)
    if row is None:
        return ApiResponse[dict[str, Any]](success=False, error="Futbol Fantasy's lineups have not been read yet.")
    return ApiResponse[dict[str, Any]](success=True, data=row.payload)
