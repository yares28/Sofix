"""Apply database migrations from code (used by the refresh job).

python -m app.migrate
"""

import logging

from alembic import command
from alembic.config import Config
from sqlalchemy.engine import make_url

from app.config import BACKEND_DIR
from app.logging_config import configure_logging

logger = logging.getLogger(__name__)


class MigrationTargetMismatch(RuntimeError):
    pass


def database_host(url: str) -> str | None:
    """Host of a database URL, treating Neon's pooled and direct hosts as the same database."""
    host = make_url(url).host
    return host.replace("-pooler.", ".", 1) if host else None


def ensure_same_database(app_url: str, migration_url: str | None) -> None:
    """Refuse to migrate a different database from the one the app uses.

    Guards against e.g. a container that points the app at a local Postgres but still
    inherits a production POSTGRES_MIGRATION_URL.
    """
    if not migration_url:
        return
    app, target = make_url(app_url), make_url(migration_url)
    if (
        app.get_backend_name() != target.get_backend_name()
        or database_host(app_url) != database_host(migration_url)
        or app.database != target.database
    ):
        raise MigrationTargetMismatch(
            f"POSTGRES_MIGRATION_URL ({target.get_backend_name()}://{target.host}/{target.database}) does not match "
            f"POSTGRES_URL ({app.get_backend_name()}://{app.host}/{app.database}); refusing to migrate"
        )


def alembic_config(url: str | None = None) -> Config:
    config = Config(str(BACKEND_DIR / "alembic.ini"))
    config.set_main_option("script_location", str(BACKEND_DIR / "migrations"))
    config.attributes["configure_logger"] = False  # keep the caller's logging setup
    if url:
        # attributes, not set_main_option: configparser chokes on '%' in URL-encoded passwords
        config.attributes["database_url"] = url
    return config


def upgrade_to_head(url: str | None = None) -> None:
    command.upgrade(alembic_config(url), "head")


if __name__ == "__main__":
    configure_logging()
    upgrade_to_head()
    logger.info("database schema is up to date")
