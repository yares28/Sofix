import pytest
from alembic.autogenerate import compare_metadata
from alembic.runtime.migration import MigrationContext
from sqlalchemy import create_engine, inspect, text
from sqlalchemy.exc import IntegrityError

import app.models  # noqa: F401  (register tables)
from app.db import Base
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
    assert tables == {
        "alembic_version",
        "competitions",
        "stadiums",
        "teams",
        "source_entity_map",
        "fixtures",
        "weather_snapshots",
        "predictions",
        "refresh_runs",
    }
    upgrade_to_head(url)  # idempotent at head


def test_models_and_migrations_do_not_drift(tmp_path):
    """Fails when models.py changes without a migration (the CI equivalent of `alembic check`)."""
    url = f"sqlite:///{(tmp_path / 'drift.db').as_posix()}"
    upgrade_to_head(url)
    engine = create_engine(url)
    with engine.connect() as connection:
        context = MigrationContext.configure(connection, opts={"render_as_batch": True})
        diff = compare_metadata(context, Base.metadata)
    assert diff == []


def test_fixture_and_weather_uniqueness_is_enforced(tmp_path):
    url = f"sqlite:///{(tmp_path / 'unique.db').as_posix()}"
    upgrade_to_head(url)
    engine = create_engine(url)
    with engine.begin() as connection:
        connection.execute(
            text(
                "INSERT INTO competitions (id, source_key, name, country, tier) VALUES (1, 'PD', 'La Liga', 'Spain', 1)"
            )
        )
        connection.execute(text("INSERT INTO teams (id, canonical_name) VALUES (1, 'A'), (2, 'B')"))
        insert = text(
            "INSERT INTO fixtures (source_fixture_id, competition_id, season, kickoff_utc, home_team_id, away_team_id, status, schedule_version) "
            "VALUES ('42', 1, '2026/27', '2026-09-20 19:00:00', 1, 2, 'TIMED', 1)"
        )
        connection.execute(insert)
    with pytest.raises(IntegrityError), engine.begin() as connection:
        connection.execute(insert)
