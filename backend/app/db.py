import atexit
import json
import logging
from typing import Any

import certifi
import psycopg
from sqlalchemy import create_engine
from sqlalchemy.engine import make_url
from sqlalchemy.orm import DeclarativeBase, sessionmaker

from app.config import settings

NEON_HOST_SUFFIX = ".neon.tech"
logger = logging.getLogger(__name__)


def database_target(url: str) -> str:
    """Where a URL points, safe to log: backend, user, host and database, never the password."""
    parsed = make_url(url)
    if parsed.get_backend_name() == "sqlite":
        return f"sqlite:{parsed.database or 'memory'}"
    return f"{parsed.get_backend_name()}://{parsed.username}@{parsed.host}/{parsed.database}"


def engine_options(url: str) -> dict[str, Any]:
    if url.startswith("sqlite"):
        return {"connect_args": {"check_same_thread": False}}
    connect_args: dict[str, Any] = {
        # Neon's pooler runs PgBouncer in transaction mode: no server-side prepared statements.
        "prepare_threshold": None,
    }
    host = make_url(url).host or ""
    if host.endswith(NEON_HOST_SUFFIX):
        # Verify Neon's certificate and hostname. `sslrootcert=system` doesn't find the Windows
        # store with psycopg's bundled OpenSSL, so use the certifi bundle on every platform.
        connect_args |= {"sslmode": "verify-full", "sslrootcert": certifi.where()}
    return {
        # Neon scales to zero after 5 idle minutes; drop connections before the server does.
        "pool_recycle": 300,
        "connect_args": connect_args,
    }


def _size(value: Any) -> int:
    if isinstance(value, dict | list):
        return len(json.dumps(value, default=str))
    return 0 if value is None else len(str(value))


class CountingCursor(psycopg.Cursor[Any]):
    """Adds up roughly how many bytes Neon sends this process (its free plan sends 5 GB a month): `neon_bytes()`."""

    total = 0

    def _count(self, rows: Any) -> Any:
        for row in rows:
            CountingCursor.total += sum(_size(v) for v in row)
        return rows

    def fetchone(self) -> Any:
        row = super().fetchone()
        if row is not None:
            self._count([row])
        return row

    def fetchmany(self, size: int = 0) -> Any:
        return self._count(super().fetchmany(size))

    def fetchall(self) -> Any:
        return self._count(super().fetchall())


def neon_bytes() -> int:
    return CountingCursor.total


def _options(url: str) -> dict[str, Any]:
    options = engine_options(url)
    if not url.startswith("sqlite"):
        options["connect_args"] = {**options["connect_args"], "cursor_factory": CountingCursor}
        atexit.register(lambda: logger.info("Neon sent this job about %.1f MB", neon_bytes() / 1e6))
    return options


engine = create_engine(settings.postgres_url, pool_pre_ping=True, **_options(settings.postgres_url))
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)


class Base(DeclarativeBase):
    pass


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
