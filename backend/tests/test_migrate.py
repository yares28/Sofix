import pytest
from sqlalchemy import create_engine, inspect

from app.migrate import MigrationTargetMismatch, database_host, ensure_same_database, upgrade_to_head

NEON_POOLED = "postgresql+psycopg://u:p@ep-cool-1-pooler.c-5.eu-central-1.aws.neon.tech/neondb?sslmode=require"
NEON_DIRECT = "postgresql+psycopg://u:p@ep-cool-1.c-5.eu-central-1.aws.neon.tech/neondb?sslmode=require"
LOCAL = "postgresql+psycopg://fixture:fixture@postgres:5432/fixture"


def test_pooled_and_direct_neon_hosts_are_the_same_database():
    assert database_host(NEON_POOLED) == database_host(NEON_DIRECT)
    ensure_same_database(NEON_POOLED, NEON_DIRECT)  # no error


def test_refuses_to_migrate_another_database():
    # e.g. a container whose app points at local Postgres but inherited the production migration URL
    with pytest.raises(MigrationTargetMismatch, match="refusing to migrate"):
        ensure_same_database(LOCAL, NEON_DIRECT)
    with pytest.raises(MigrationTargetMismatch):
        ensure_same_database(NEON_POOLED, NEON_DIRECT.replace("/neondb", "/otherdb"))
    with pytest.raises(MigrationTargetMismatch):
        ensure_same_database("sqlite:///local.db", NEON_DIRECT)


def test_no_migration_url_means_nothing_to_compare():
    ensure_same_database(LOCAL, "")
    ensure_same_database(LOCAL, None)


def test_error_message_does_not_leak_passwords():
    with pytest.raises(MigrationTargetMismatch) as err:
        ensure_same_database(LOCAL, NEON_DIRECT)
    assert "fixture:fixture" not in str(err.value) and "u:p" not in str(err.value)


def test_upgrade_to_head_builds_the_schema(tmp_path):
    url = f"sqlite:///{(tmp_path / 'migrated.db').as_posix()}"
    upgrade_to_head(url)
    tables = set(inspect(create_engine(url)).get_table_names())
    assert {"fixtures", "teams", "predictions", "weather_snapshots", "alembic_version"} <= tables
    upgrade_to_head(url)  # idempotent at head
