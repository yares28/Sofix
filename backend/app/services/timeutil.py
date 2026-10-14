import time
from datetime import UTC, datetime


def as_utc(value: datetime) -> datetime:
    """SQLite hands datetimes back without a timezone; they are stored as UTC."""
    return value.replace(tzinfo=UTC) if value.tzinfo is None else value.astimezone(UTC)


class Laps(dict[str, float]):
    """Seconds each part of a job took, for its summary: `laps("part")` closes the part that just ran."""

    def __init__(self) -> None:
        super().__init__()
        self._at = time.perf_counter()

    def __call__(self, part: str) -> None:
        now = time.perf_counter()
        self[part] = round(self.get(part, 0.0) + now - self._at, 1)
        self._at = now
