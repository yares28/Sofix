"""Refresh both validated European boards from one pooled fit and shared cached source reads."""

from datetime import UTC, datetime

from app.db import SessionLocal
from app.models import ReadModel
from app.research.european_model import fit
from app.schemas import ApiResponse, FixtureGrid
from app.services import european_fdr, european_sources
from app.services.publish import put


def run() -> dict:
    now = datetime.now(UTC)
    start = european_sources.season_at(now)
    calendars = european_sources.calendars(now)
    clubs = {c: european_sources.current_clubs(c, start) for c in european_fdr.VALIDATED}
    model = fit(european_sources.history(calendars), now, teams={t for group in clubs.values() for t in group})
    db = SessionLocal()
    try:
        bodies = {}
        for code in european_fdr.VALIDATED:
            kept = db.get(ReadModel, f"grid:{code}")
            previous = ApiResponse[FixtureGrid].model_validate(kept.payload) if kept else None
            bodies[code] = european_fdr.build_grid(
                code, start, calendars[code][start], model, now, previous, clubs=clubs[code]
            )
        for code, body in bodies.items():
            put(db, f"grid:{code}", body.model_dump(mode="json"), now)
        return {
            code: {"teams": len(body.data.teams), "model_version": body.data.model_version}
            for code, body in bodies.items()
            if body.data is not None
        }
    finally:
        db.close()
