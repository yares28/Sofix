"""Refresh both validated European boards from one pooled fit and shared cached source reads."""

from datetime import UTC, datetime

from app.db import SessionLocal
from app.research.european_model import fit
from app.services import board_checks, european_fdr, european_sources
from app.services.conference_forecast import ConferenceForecast
from app.services.publish import put


def run() -> dict:
    now = datetime.now(UTC)
    start = european_sources.season_at(now)
    calendars = european_sources.calendars(now)
    clubs = {c: european_sources.current_clubs(c, start) for c in european_fdr.SUPPORTED}
    history = european_sources.history(calendars)
    model = fit(history, now, teams={t for group in clubs.values() for t in group})
    db = SessionLocal()
    try:
        bodies = {}
        for code in european_fdr.SUPPORTED:
            previous = board_checks.previous(db, f"grid:{code}")
            bodies[code] = european_fdr.build_grid(
                code,
                start,
                calendars[code][start],
                ConferenceForecast(model, history, now) if code == "CONF" else model,
                now,
                previous,
                clubs=clubs[code],
            )
        for code, body in bodies.items():
            put(db, f"grid:{code}", body.model_dump(mode="json"), now)
        board_checks.record(db, list(bodies), now)
        return {
            code: {"teams": len(body.data.teams), "model_version": body.data.model_version}
            for code, body in bodies.items()
            if body.data is not None
        }
    finally:
        db.close()
