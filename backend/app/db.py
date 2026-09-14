from typing import Any

import certifi
from sqlalchemy import create_engine
from sqlalchemy.engine import make_url
from sqlalchemy.orm import DeclarativeBase, sessionmaker

from app.config import settings

NEON_HOST_SUFFIX = ".neon.tech"


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


engine = create_engine(settings.postgres_url, pool_pre_ping=True, **engine_options(settings.postgres_url))
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)


class Base(DeclarativeBase):
    pass


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
