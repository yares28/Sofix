import time
from datetime import UTC, datetime


def as_utc(value: datetime) -> datetime:
    """SQLite hands datetimes back without a timezone; they are stored as UTC."""
    return value.replace(tzinfo=UTC) if value.tzinfo is None else value.astimezone(UTC)


class Laps(dict[str, float]):
    """Seconds each part of a job took, for its summary: `laps("part")` closes the part that just ran."""

    def __init__(self) -> None:
        from app.db import neon_bytes  # the jobs' Neon byte count (5 GB a month free), part by part in `neon`

        super().__init__()
        self._bytes = neon_bytes
        self._at, self._sent = time.perf_counter(), neon_bytes()
        self.neon: dict[str, float] = {}

    def __call__(self, part: str) -> None:
        now, sent = time.perf_counter(), self._bytes()
        self[part] = round(self.get(part, 0.0) + now - self._at, 1)
        self.neon[part] = round(self.neon.get(part, 0.0) + (sent - self._sent) / 1e6, 2)
        self._at, self._sent = now, sent
