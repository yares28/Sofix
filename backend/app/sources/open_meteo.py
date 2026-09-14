from datetime import UTC, datetime, timedelta

import httpx

URL = "https://api.open-meteo.com/v1/forecast"
HOURLY = "temperature_2m,apparent_temperature,relative_humidity_2m,precipitation,wind_speed_10m"
FORECAST_DAYS = 16  # the free forecast horizon


async def hourly_forecast(lat, lon, client: httpx.AsyncClient | None = None) -> dict:
    """One call per location; reuse the result for every fixture at that stadium."""
    params = {"latitude": lat, "longitude": lon, "hourly": HOURLY, "timezone": "UTC", "forecast_days": FORECAST_DAYS}
    if client is None:
        async with httpx.AsyncClient(timeout=30) as c:
            r = await c.get(URL, params=params)
    else:
        r = await client.get(URL, params=params)
    r.raise_for_status()
    return r.json()


def at_kickoff(data: dict, kickoff_utc: datetime, now: datetime | None = None) -> dict | None:
    """Weather for the forecast hour closest to kickoff, or None if kickoff is beyond the forecast."""
    now = now or datetime.now(UTC)
    if kickoff_utc.tzinfo is None:  # SQLite returns naive datetimes; they are stored as UTC
        kickoff_utc = kickoff_utc.replace(tzinfo=UTC)
    hourly = data["hourly"]
    times = [datetime.fromisoformat(x).replace(tzinfo=UTC) for x in hourly["time"]]
    target = kickoff_utc.astimezone(UTC)
    if not times or target < times[0] or target > times[-1] + timedelta(minutes=59):
        return None
    i = min(range(len(times)), key=lambda j: abs((times[j] - target).total_seconds()))
    return {
        "snapshot_ts": now,
        "available_at": now,
        "forecast_lead_hours": (kickoff_utc - now).total_seconds() / 3600,
        "temperature_c": hourly["temperature_2m"][i],
        "apparent_temperature_c": hourly["apparent_temperature"][i],
        "humidity_pct": hourly["relative_humidity_2m"][i],
        "precipitation_mm": hourly["precipitation"][i],
        "wind_speed_kmh": hourly["wind_speed_10m"][i],
    }


async def forecast(lat, lon, kickoff_utc):
    return at_kickoff(await hourly_forecast(lat, lon), kickoff_utc)
