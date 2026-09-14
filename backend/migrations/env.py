from logging.config import fileConfig

from alembic import context
from sqlalchemy import create_engine

import app.models  # noqa: F401  (register tables on Base.metadata)
from app.config import settings
from app.db import Base, engine_options
from app.migrate import ensure_same_database

config = context.config
# From the alembic CLI, use alembic.ini's logging. From code (app.migrate), keep the app's logging:
# fileConfig would reset the root logger to WARNING and hide the job logs that follow.
if config.config_file_name is not None and config.attributes.get("configure_logger", True):
    fileConfig(config.config_file_name, disable_existing_loggers=False)

target_metadata = Base.metadata


def database_url() -> str:
    """An explicit URL passed from code (e.g. tests) wins; otherwise the direct URL, then the app URL."""
    explicit = config.attributes.get("database_url") or config.get_main_option("sqlalchemy.url")
    if explicit:
        return explicit
    ensure_same_database(settings.postgres_url, settings.postgres_migration_url)
    return settings.postgres_migration_url or settings.postgres_url


def run_migrations_offline() -> None:
    url = database_url()
    context.configure(
        url=url, target_metadata=target_metadata, literal_binds=True, render_as_batch=url.startswith("sqlite")
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    url = database_url()
    connectable = create_engine(url, pool_pre_ping=True, **engine_options(url))
    with connectable.connect() as connection:
        # SQLite can't ALTER most things in place; batch mode rebuilds tables instead.
        context.configure(
            connection=connection, target_metadata=target_metadata, render_as_batch=url.startswith("sqlite")
        )
        with context.begin_transaction():
            context.run_migrations()
    connectable.dispose()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
