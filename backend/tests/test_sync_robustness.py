"""Sync must keep going when football-data.org sends surprises (unknown clubs, bad rows, rate limits)."""

import asyncio

import httpx
import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

import app.models  # noqa: F401  (register tables)
from app.config import settings
from app.db import Base, database_target
from app.jobs.predict import history_names
from app.jobs.seed_and_sync import UNKNOWN_TEAM_COLOR, sync
from app.modeling.dixon_coles import DixonColesConfig
from app.models import Fixture, Team
from app.services.rating_predictions import model_version
from app.sources.football_data_org import FootballDataOrg, parse_matches, retry_after


def team(team_id, tla, name):
    return {"id": team_id, "tla": tla, "name": name, "shortName": name}


def match(match_id, home, away, **extra):
    return {
        "id": match_id,
        "utcDate": "2027-08-15T19:00:00Z",
        "status": "TIMED",
        "matchday": 1,
        "homeTeam": home,
        "awayTeam": away,
        "season": {"startDate": "2027-08-13"},
        "score": {"fullTime": {"home": None, "away": None}},
        **extra,
    }


@pytest.fixture()
def session_factory():
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(engine)
    return sessionmaker(bind=engine)


REAL_MADRID = team(86, "RMA", "Real Madrid CF")
BARCELONA = team(81, "FCB", "FC Barcelona")
NEWCOMER = team(9001, "ZAR", "Real Zaragoza")  # promoted club missing from the registry


def test_unknown_club_is_created_and_sync_continues(session_factory):
    payload = {"matches": [match(1, REAL_MADRID, NEWCOMER), match(2, BARCELONA, REAL_MADRID)]}
    result = sync(payload, session_factory=session_factory)

    assert result.fixtures == 2 and result.unknown_teams == {"Real Zaragoza (ZAR)"}
    db = session_factory()
    newcomer = db.query(Team).filter_by(code="ZAR").one()
    assert newcomer.color == UNKNOWN_TEAM_COLOR and newcomer.stadium_id is None
    assert db.query(Fixture).count() == 2
    # The model still gets a name for it (no history yet, so it is rated from the prior).
    assert history_names({newcomer.id: newcomer})[newcomer.id] == "Real Zaragoza"


def test_unknown_club_without_code_and_second_sync_reuses_it(session_factory):
    nameless = {"id": 9100, "tla": None, "name": "Club Nuevo", "shortName": None}
    sync({"matches": [match(1, nameless, BARCELONA)]}, session_factory=session_factory)
    sync({"matches": [match(1, nameless, BARCELONA)]}, session_factory=session_factory)
    db = session_factory()
    assert db.query(Team).filter_by(canonical_name="Club Nuevo").count() == 1


def test_invalid_rows_and_undecided_teams_are_skipped():
    payload = {
        "matches": [
            match(1, REAL_MADRID, BARCELONA),
            match(2, {"id": None, "name": None}, BARCELONA),  # knockout slot not decided yet
            {"id": "not-a-number", "utcDate": "garbage"},
        ]
    }
    matches, skipped = parse_matches(payload)
    assert [m.id for m in matches] == [1] and skipped == 2


def test_sync_reports_skipped_rows(session_factory):
    result = sync({"matches": [match(1, REAL_MADRID, BARCELONA), {"id": 3}]}, session_factory=session_factory)
    assert result.fixtures == 1 and result.skipped == 1


def fake_api(responses):
    calls = []

    def handler(request: httpx.Request) -> httpx.Response:
        calls.append(request)
        status, headers, body = responses[min(len(calls), len(responses)) - 1]
        return httpx.Response(status, headers=headers, json=body)

    return httpx.AsyncClient(transport=httpx.MockTransport(handler)), calls


def test_rate_limit_is_retried_after_the_reset_header():
    client, calls = fake_api([(429, {"X-RequestCounter-Reset": "7"}, {}), (200, {}, {"matches": []})])
    waits: list[float] = []

    async def record_sleep(seconds):
        waits.append(seconds)

    api = FootballDataOrg(token="test", client=client, sleep=record_sleep)
    assert asyncio.run(api.matches()) == {"matches": []}
    assert len(calls) == 2 and waits == [7.0]
    assert calls[0].headers["X-Auth-Token"] == "test"


def test_gives_up_after_three_attempts():
    client, calls = fake_api([(503, {}, {})])

    async def no_sleep(_):
        return None

    api = FootballDataOrg(token="test", client=client, sleep=no_sleep)
    with pytest.raises(httpx.HTTPStatusError):
        asyncio.run(api.matches())
    assert len(calls) == 3  # stays well inside 10 requests/minute


def test_client_errors_are_not_retried():
    client, calls = fake_api([(403, {}, {"message": "bad token"})])
    api = FootballDataOrg(token="test", client=client)
    with pytest.raises(httpx.HTTPStatusError):
        asyncio.run(api.matches())
    assert len(calls) == 1


def test_retry_after_caps_the_wait():
    assert retry_after(httpx.Response(429, headers={"X-RequestCounter-Reset": "600"}), 1) == 65
    assert retry_after(httpx.Response(503), 2) == 4.0


def test_missing_token_fails_loudly(monkeypatch):
    monkeypatch.setattr(settings, "football_data_org_token", "")
    with pytest.raises(RuntimeError, match="FOOTBALL_DATA_ORG_TOKEN"):
        FootballDataOrg()


def test_model_version_changes_with_settings():
    tuned = model_version(DixonColesConfig(xi=0.001, goals_weight=0.7, ridge=1.0, promoted_prior=0.0))
    assert tuned.startswith("dixon-coles-v1+") and len(tuned) == len("dixon-coles-v1+") + 8
    assert tuned == model_version(DixonColesConfig(xi=0.001, goals_weight=0.7, ridge=1.0, promoted_prior=0.0))
    assert tuned != model_version(DixonColesConfig(xi=0.002, goals_weight=0.7, ridge=1.0, promoted_prior=0.0))


def test_database_target_never_contains_the_password():
    url = "postgresql+psycopg://fdr_app:s3cret-pass@ep-x-pooler.c-5.eu-central-1.aws.neon.tech/neondb?sslmode=require"
    target = database_target(url)
    assert target == "postgresql://fdr_app@ep-x-pooler.c-5.eu-central-1.aws.neon.tech/neondb"
    assert "s3cret" not in target
    assert database_target("sqlite://") == "sqlite:memory"
