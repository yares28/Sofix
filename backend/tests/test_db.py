import certifi

from app.db import engine_options


def test_sqlite_options():
    assert engine_options("sqlite://") == {"connect_args": {"check_same_thread": False}}


def test_neon_connections_verify_certificates():
    options = engine_options(
        "postgresql+psycopg://u:p@ep-cool-1-pooler.c-5.eu-central-1.aws.neon.tech/neondb?sslmode=require"
    )
    assert options["pool_recycle"] == 300
    assert options["connect_args"] == {
        "prepare_threshold": None,
        "sslmode": "verify-full",
        "sslrootcert": certifi.where(),
    }


def test_local_postgres_keeps_default_tls_settings():
    options = engine_options("postgresql+psycopg://fixture:fixture@postgres:5432/fixture")
    assert options["connect_args"] == {"prepare_threshold": None}
