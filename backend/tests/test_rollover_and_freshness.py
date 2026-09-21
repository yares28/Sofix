"""Season rollover, history download fallbacks, change-only sync writes, and stale-data cleanup."""

import json
import os
from datetime import UTC, date, datetime, timedelta

import httpx
import numpy as np
import pandas as pd
import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

import app.models  # noqa: F401  (register tables)
from app.backtest.data import current_season_start, load_history, promoted_from_fixtures
from app.db import Base
from app.jobs.backtest import season_plan
from app.jobs.predict import name_problems, predict_upcoming
from app.jobs.seed_and_sync import sync
from app.models import Fixture, Prediction, RefreshRun
from app.services.fixture_grid import grid_meta
from app.sources.football_data_co_uk import cached_path, fetch_season_csv

CLUBS = {  # football-data.org team -> football-data.co.uk history name
    "FCB": ({"id": 81, "tla": "FCB", "name": "FC Barcelona"}, "Barcelona"),
    "RMA": ({"id": 86, "tla": "RMA", "name": "Real Madrid CF"}, "Real Madrid"),
    "ATL": ({"id": 78, "tla": "ATL", "name": "Club Atlético de Madrid"}, "Ath Madrid"),
    "BET": ({"id": 90, "tla": "BET", "name": "Real Betis Balompié"}, "Betis"),
}
PROMOTED = {"id": 9001, "tla": "ZAR", "name": "Real Zaragoza"}  # not in the registry, no LaLiga history


def raw_season(year: int, teams: list[str], seed: int = 3) -> pd.DataFrame:
    """A football-data.co.uk-shaped CSV frame: double round robin from mid-August."""
    rng = np.random.default_rng(seed + year)
    rows, day = [], pd.Timestamp(f"{year}-08-15")
    for home in teams:
        for away in teams:
            if home != away:
                hg, ag = rng.poisson(1.5), rng.poisson(1.1)
                rows.append(
                    {
                        "Date": day.strftime("%d/%m/%Y"),
                        "HomeTeam": home,
                        "AwayTeam": away,
                        "FTHG": hg,
                        "FTAG": ag,
                        "HST": hg + 3,
                        "AST": ag + 2,
                    }
                )
                day += pd.Timedelta(days=4)
    return pd.DataFrame(rows)


def not_found(year: int) -> httpx.HTTPStatusError:
    request = httpx.Request("GET", f"https://www.football-data.co.uk/mmz4281/{year}/SP1.csv")
    return httpx.HTTPStatusError("404", request=request, response=httpx.Response(404, request=request))


# ---------------------------------------------------------------- history loading


def test_newest_season_without_csv_is_skipped(tmp_path):
    history_names = [name for _, name in CLUBS.values()]

    def fetch(year, cache_dir, refresh=False):
        if year == 2027:
            raise not_found(year)
        return raw_season(year, history_names)

    history = load_history(range(2025, 2028), tmp_path, refresh_latest=True, fetch=fetch)
    assert sorted(history["season_start"].unique()) == [2025, 2026]


def test_failed_download_falls_back_to_cache(tmp_path):
    cached_path(2026, tmp_path).parent.mkdir(parents=True, exist_ok=True)
    cached_path(2026, tmp_path).write_text("cached")
    calls = []

    def fetch(year, cache_dir, refresh=False):
        calls.append((year, refresh))
        if refresh:
            raise httpx.ConnectError("offline")
        return raw_season(year, ["Barcelona", "Betis"])

    history = load_history([2026], tmp_path, refresh_latest=True, fetch=fetch)
    assert len(history) == 2 and calls == [(2026, True), (2026, False)]


def test_failed_download_without_cache_raises(tmp_path):
    def fetch(year, cache_dir, refresh=False):
        raise httpx.ConnectError("offline")

    with pytest.raises(httpx.ConnectError):
        load_history([2026], tmp_path, refresh_latest=True, fetch=fetch)


def test_no_history_at_all_is_an_error(tmp_path):
    def fetch(year, cache_dir, refresh=False):
        raise not_found(year)

    with pytest.raises(RuntimeError, match="no match history"):
        load_history([2027], tmp_path, refresh_latest=True, fetch=fetch)


def test_refresh_is_conditional_and_304_keeps_the_cache(tmp_path):
    path = cached_path(2026, tmp_path)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(b"Date,HomeTeam,AwayTeam,FTHG,FTAG\n15/08/2026,Betis,Sevilla,1,0\n")
    old = datetime(2026, 9, 10, tzinfo=UTC).timestamp()
    os.utime(path, (old, old))
    seen = []

    def handler(request):
        seen.append(request.headers.get("If-Modified-Since"))
        return httpx.Response(304)

    frame = fetch_season_csv(2026, tmp_path, refresh=True, client=httpx.Client(transport=httpx.MockTransport(handler)))
    assert seen == ["Thu, 10 Sep 2026 00:00:00 GMT"]
    assert frame.loc[0, "HomeTeam"] == "Betis"


# ---------------------------------------------------------------- calendar helpers


def test_season_calendar_helpers():
    assert current_season_start(date(2026, 9, 14)) == 2026
    assert current_season_start(date(2027, 3, 1)) == 2026
    assert current_season_start(date(2027, 7, 1)) == 2027
    assert season_plan(2026) == (2016, [2019, 2020, 2021, 2022], [2023, 2024, 2025])
    assert season_plan(2027) == (2017, [2020, 2021, 2022, 2023], [2024, 2025, 2026])


def test_promoted_from_fixtures_and_name_problems():
    history = pd.concat(
        [
            pd.DataFrame({"season_start": 2026, "home": ["Barcelona", "Betis"], "away": ["Betis", "Elche"]}),
            pd.DataFrame(
                {"season_start": 2027, "home": ["Barcelona", "Mystery CF"], "away": ["Real Zaragoza", "Betis"]}
            ),
        ]
    )
    promoted = promoted_from_fixtures(["Barcelona", "Betis", "Real Zaragoza"], history, 2027)
    assert promoted == {"Real Zaragoza"}
    assert promoted_from_fixtures(["Barcelona"], history, 2026) == frozenset()  # 2025 not loaded

    problems = name_problems(history, 2027, ["Barcelona", "Ghost FC"], promoted)
    assert problems["unresolved_history_names"] == ["Mystery CF", "Real Zaragoza"]
    assert problems["teams_without_history"] == ["Ghost FC"]


# ---------------------------------------------------------------- database-backed flows


@pytest.fixture()
def session_factory():
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(engine)
    return sessionmaker(bind=engine)


def fdo_match(match_id, home, away, kickoff, status="TIMED", score=(None, None), season="2027-08-13"):
    return {
        "id": match_id,
        "utcDate": kickoff,
        "status": status,
        "matchday": 1,
        "homeTeam": home,
        "awayTeam": away,
        "season": {"startDate": season},
        "score": {"fullTime": {"home": score[0], "away": score[1]}},
    }


def test_rollover_predicts_the_new_season_before_its_csv_exists(session_factory, tmp_path):
    fcb, rma, atl, bet = (CLUBS[c][0] for c in ("FCB", "RMA", "ATL", "BET"))
    sync(
        {
            "matches": [
                fdo_match(1, fcb, PROMOTED, "2027-08-15T19:00:00Z"),
                fdo_match(2, rma, atl, "2027-08-16T19:00:00Z"),
                fdo_match(3, bet, fcb, "2027-08-22T19:00:00Z"),
            ]
        },
        session_factory=session_factory,
    )
    config_path = tmp_path / "dixon_coles.json"
    config_path.write_text(json.dumps({"xi": 0.001, "goals_weight": 0.7, "ridge": 1.0, "promoted_prior": -0.2}))
    history_names = [name for _, name in CLUBS.values()]

    def fetch(year, cache_dir, refresh=False):
        if year == 2027:
            raise not_found(year)  # the new season's CSV appears only around matchday 1
        return raw_season(year, history_names)

    def load(seasons, cache_dir, refresh_latest=False):
        return load_history(seasons, cache_dir, refresh_latest, fetch=fetch)

    db = session_factory()
    result = predict_upcoming(
        db, datetime(2027, 8, 1, tzinfo=UTC), load=load, config_path=str(config_path), cache_dir=str(tmp_path)
    )

    assert result["fixtures"] == 3 and result["predictions"] == 6
    assert result["promoted"] == ["Real Zaragoza"]
    assert result["teams_without_history"] == []  # a known promotion, not a naming problem
    zaragoza_side = (
        db.query(Prediction)
        .join(Fixture, Fixture.id == Prediction.fixture_id)
        .filter(Fixture.source_fixture_id == "1", Prediction.perspective_team_id == Fixture.away_team_id)
        .one()
    )
    assert zaragoza_side.p_loss > zaragoza_side.p_win  # promoted prior vs Barcelona at home


def test_resync_writes_only_what_changed_and_reports_missing(session_factory):
    fcb, rma, atl, bet = (CLUBS[c][0] for c in ("FCB", "RMA", "ATL", "BET"))
    first = [fdo_match(1, fcb, rma, "2027-08-15T19:00:00Z"), fdo_match(2, atl, bet, "2027-08-16T19:00:00Z")]
    assert sync({"matches": first}, session_factory=session_factory).created == 2

    db = session_factory()
    stamp = db.query(Fixture).filter_by(source_fixture_id="1").one().source_updated_at
    db.close()

    again = sync({"matches": first}, session_factory=session_factory)
    assert (again.created, again.changed, again.missing_fixtures) == (0, 0, [])
    db = session_factory()
    assert db.query(Fixture).filter_by(source_fixture_id="1").one().source_updated_at == stamp
    db.close()

    played = [fdo_match(1, fcb, rma, "2027-08-15T19:00:00Z", status="FINISHED", score=(2, 1))]
    later = sync({"matches": played}, session_factory=session_factory)
    assert later.changed == 1 and later.missing_fixtures == ["2"]


def test_last_synced_comes_from_the_run_history(session_factory):
    db = session_factory()
    finished = datetime(2027, 8, 10, 9, 30, tzinfo=UTC)
    db.add_all(
        [
            RefreshRun(
                trigger="cli",
                status="succeeded",
                started_at=finished - timedelta(minutes=1),
                finished_at=finished,
                details={"sync": {"status": "succeeded"}},
            ),
            RefreshRun(
                trigger="cli",
                status="failed",
                started_at=finished + timedelta(hours=1),
                finished_at=finished + timedelta(hours=1),
                details={"sync": {"status": "failed"}},
            ),
        ]
    )
    db.commit()
    assert grid_meta(db).last_synced_at == finished
