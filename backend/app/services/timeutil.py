from datetime import datetime, timezone


def as_utc(value: datetime) -> datetime:
    """SQLite hands datetimes back without a timezone; they are stored as UTC."""
    return value.replace(tzinfo=timezone.utc) if value.tzinfo is None else value.astimezone(timezone.utc)
