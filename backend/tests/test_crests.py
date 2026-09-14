"""Crest URLs: allowlisted host only, stored by the sync, exposed on the grid."""

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

import app.models  # noqa: F401  (register tables)
from app.db import Base
from app.jobs.seed_and_sync import sync
from app.models import Team
from app.services.crests import safe_crest_url
from app.services.fixture_grid import build_fixture_grid


@pytest.mark.parametrize(
    "url",
    [
        "https://crests.football-data.org/81.svg",
        "https://crests.football-data.org/86.png",
        "https://crests.football-data.org/745_large.png",
    ],
)
def test_football_data_crests_are_allowed(url):
    assert safe_crest_url(url) == url


@pytest.mark.parametrize(
    "url",
    [
        None,
        "",
        "http://crests.football-data.org/81.svg",  # not https
        "https://crests.football-data.org.evil.example/81.svg",
        "https://evil.example/crests.football-data.org/81.svg",
        "https://user:pass@crests.football-data.org/81.svg",
        "https://crests.football-data.org:8443/81.svg",
        "https://crests.football-data.org/81.svg?x=1",
        "https://crests.football-data.org/../81.svg",
        'https://crests.football-data.org/81.svg" onerror="alert(1)',
        "javascript:alert(1)",
        "https://crests.football-data.org/" + "a" * 300 + ".svg",
    ],
)
def test_anything_else_is_dropped(url):
    assert safe_crest_url(url) is None


def test_sync_stores_crests_and_the_grid_exposes_them():
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(engine)
    factory = sessionmaker(bind=engine)
    fcb = {"id": 81, "tla": "FCB", "name": "FC Barcelona", "crest": "https://crests.football-data.org/81.svg"}
    rma = {"id": 86, "tla": "RMA", "name": "Real Madrid CF", "crest": "https://evil.example/86.png"}
    match = {
        "id": 1,
        "utcDate": "2099-08-15T19:00:00Z",
        "status": "TIMED",
        "matchday": 1,
        "homeTeam": fcb,
        "awayTeam": rma,
        "season": {"startDate": "2099-08-13"},
        "score": {"fullTime": {"home": None, "away": None}},
    }
    sync({"matches": [match]}, session_factory=factory)

    db = factory()
    crests = {team.code: team.crest_url for team in db.query(Team).all()}
    assert crests == {"FCB": "https://crests.football-data.org/81.svg", "RMA": None}

    # A later payload without a crest keeps the stored one.
    sync({"matches": [{**match, "homeTeam": {**fcb, "crest": None}}]}, session_factory=factory)
    db.expire_all()
    assert db.query(Team).filter_by(code="FCB").one().crest_url == "https://crests.football-data.org/81.svg"

    grid = build_fixture_grid(db)
    assert grid is not None
    assert {team.code: team.crest_url for team in grid.teams} == crests
