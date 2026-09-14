from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker

from app.config import settings


def engine_options(url: str) -> dict:
    if url.startswith("sqlite"):
        return {"connect_args": {"check_same_thread": False}}
    return {
        # Neon scales to zero after 5 idle minutes; drop connections before the server does.
        "pool_recycle": 300,
        # Neon's pooler runs PgBouncer in transaction mode: no server-side prepared statements.
        "connect_args": {"prepare_threshold": None},
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
