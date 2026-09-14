from fastapi.testclient import TestClient
from sqlalchemy.exc import OperationalError

from app.config import Settings
from app.db import get_db
from app.main import create_app


def failing_db():
    raise OperationalError("SELECT 1", {}, Exception("compute suspended"))
    yield  # pragma: no cover


def test_database_outage_returns_503_envelope_without_details():
    app = create_app(Settings(app_env="dev"))
    app.dependency_overrides[get_db] = failing_db
    response = TestClient(app, raise_server_exceptions=False).get("/api/fixture-grid")
    assert response.status_code == 503
    assert response.json() == {
        "success": False,
        "data": None,
        "error": "Fixture data is temporarily unavailable.",
        "meta": None,
    }
    assert "compute suspended" not in response.text


def test_unexpected_errors_return_500_envelope():
    def broken_db():
        raise RuntimeError("secret internal detail")
        yield  # pragma: no cover

    app = create_app(Settings(app_env="dev"))
    app.dependency_overrides[get_db] = broken_db
    response = TestClient(app, raise_server_exceptions=False).get("/api/fixture-grid")
    assert response.status_code == 500
    assert response.json()["error"] == "Something went wrong."
    assert "secret internal detail" not in response.text


def test_docs_only_in_dev():
    dev = TestClient(create_app(Settings(app_env="dev")))
    prod = TestClient(create_app(Settings(app_env="prod")))
    assert dev.get("/openapi.json").status_code == 200
    for path in ("/docs", "/redoc", "/openapi.json"):
        assert prod.get(path).status_code == 404


def test_health_is_database_free():
    app = create_app(Settings(app_env="prod"))
    app.dependency_overrides[get_db] = failing_db
    assert TestClient(app).get("/api/health").json() == {"ok": True}


def test_cors_allows_only_get_from_the_frontend():
    client = TestClient(create_app(Settings(app_env="prod")))
    preflight = client.options(
        "/api/fixture-grid",
        headers={"Origin": "http://localhost:3000", "Access-Control-Request-Method": "POST"},
    )
    assert preflight.status_code == 400
    other_origin = client.options(
        "/api/fixture-grid",
        headers={"Origin": "https://evil.example", "Access-Control-Request-Method": "GET"},
    )
    assert other_origin.status_code == 400
