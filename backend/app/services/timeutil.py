from datetime import UTC, datetime


def as_utc(value: datetime) -> datetime:
    """SQLite hands datetimes back without a timezone; they are stored as UTC."""
    return value.replace(tzinfo=UTC) if value.tzinfo is None else value.astimezone(UTC)
