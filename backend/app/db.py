import atexit
import json
import logging
import os
from collections import defaultdict
from collections.abc import Mapping
from typing import Any

import certifi
import psycopg
from sqlalchemy import create_engine, event
from sqlalchemy.engine import make_url
from sqlalchemy.orm import DeclarativeBase, sessionmaker

from app.config import settings
from app.services import neon_ledger

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
    by_label: dict[str, int] = defaultdict(int)  # the same bytes by reader (`neon_ledger.label_of`)
    label = "other"

    def _count(self, rows: Any) -> Any:
        for row in rows:
            size = sum(_size(v) for v in row)
            CountingCursor.total += size
            CountingCursor.by_label[CountingCursor.label] += size
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
    return options


def _at_exit() -> None:
    logger.info("Neon sent this job about %.1f MB", neon_bytes() / 1e6)
    neon_ledger.write(engine, neon_bytes(), CountingCursor.by_label)


engine = create_engine(settings.postgres_url, pool_pre_ping=True, **_options(settings.postgres_url))
if not settings.postgres_url.startswith("sqlite"):  # once the engine exists: its exit writes the ledger row
    atexit.register(_at_exit)


def production_allowed(env: Mapping[str, str] = os.environ) -> bool:
    """Only GitHub's jobs reach production Neon on their own. A local run (an agent's script, a job started by hand)
    must say so with SOFIX_PRODUCTION=1, so nothing local reads production by accident (plans/neon-write-mostly.md)."""
    return bool(env.get("GITHUB_ACTIONS")) or env.get("SOFIX_PRODUCTION") == "1"


@event.listens_for(engine, "do_connect")
def _refuse_production_locally(dialect: Any, conn_rec: Any, cargs: Any, cparams: Any) -> None:
    if not settings.postgres_url.startswith("sqlite") and not production_allowed():
        raise RuntimeError(
            "Local runs do not reach production Neon: read the local copy (npm run blocks), or set SOFIX_PRODUCTION=1 "
            "for one deliberate read (plans/neon-write-mostly.md)."
        )


@event.listens_for(engine, "before_cursor_execute")
def _name_the_read(conn: Any, cursor: Any, statement: str, parameters: Any, context: Any, executemany: bool) -> None:
    CountingCursor.label = neon_ledger.label_of(statement, parameters)


SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)


class Base(DeclarativeBase):
    pass


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
