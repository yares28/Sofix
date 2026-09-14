"""Kickoff weather for fixtures in the next 14 days, from Open-Meteo (no API key).

    python -m app.jobs.sync_weather

Context only: shown in the match tooltip, not used by the rating model. Only fixtures with a
confirmed kickoff time get a forecast, and each run replaces the previous forecast.
"""

import asyncio
from datetime import UTC, datetime, timedelta

import httpx

from app.db import SessionLocal
from app.models import Fixture, Stadium, WeatherSnapshot
from app.services.timeutil import as_utc
from app.sources.open_meteo import at_kickoff, hourly_forecast

HORIZON_DAYS = 14


def forecastable(fixtures: list[Fixture], now: datetime) -> dict[int, list[Fixture]]:
    """Confirmed-time fixtures inside the horizon, grouped by stadium (one API call each)."""
    by_stadium: dict[int, list[Fixture]] = {}
    for fx in fixtures:
        kickoff = as_utc(fx.kickoff_utc)
        if fx.stadium_id is None or fx.status != "TIMED" or not now <= kickoff <= now + timedelta(days=HORIZON_DAYS):
            continue
        by_stadium.setdefault(fx.stadium_id, []).append(fx)
    return by_stadium


async def main(session_factory=SessionLocal, client: httpx.AsyncClient | None = None):
    db = session_factory()
    try:
        now = datetime.now(UTC)
        by_stadium = forecastable(db.query(Fixture).filter(Fixture.status == "TIMED").all(), now)
        written = 0
        http = client or httpx.AsyncClient(timeout=30)
        try:
            for stadium_id, stadium_fixtures in by_stadium.items():
                stadium = db.get(Stadium, stadium_id)
                if stadium is None or stadium.latitude is None or stadium.longitude is None:
                    continue
                try:
                    data = await hourly_forecast(stadium.latitude, stadium.longitude, http)
                except httpx.HTTPError as exc:
                    print("weather failed", stadium.name, repr(exc))
                    continue
                for fx in stadium_fixtures:
                    row = at_kickoff(data, fx.kickoff_utc, now)
                    if row:
                        db.query(WeatherSnapshot).filter(WeatherSnapshot.fixture_id == fx.id).delete(
                            synchronize_session=False
                        )
                        db.add(WeatherSnapshot(fixture_id=fx.id, **row))
                        written += 1
        finally:
            if client is None:
                await http.aclose()
        db.commit()
        print("weather rows", written, "for", len(by_stadium), "stadiums")
    finally:
        db.close()


if __name__ == "__main__":
    asyncio.run(main())
