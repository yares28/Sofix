from datetime import UTC, datetime

import pandas as pd
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

import app.models  # noqa: F401  (register tables)
from app.db import Base, get_db
from app.jobs.predict import replace_predictions, upcoming_fixtures
from app.jobs.seed_and_sync import clean_status, get_or_create_comp, resolve_team, sync, upsert_fixture
from app.jobs.sync_weather import forecastable
from app.main import app as fastapi_app
from app.modeling.dixon_coles import DixonColesConfig, fit_dixon_coles
from app.models import Fixture, Prediction, WeatherSnapshot
from app.services.fixture_grid import (
    build_fixture_grid,
    date_confirmed,
    matchday_window,
    normalize_status,
    quantile_scale,
)
from app.services.rating_predictions import load_config, merge_recent_results, predict_both_sides
from app.services.scoring import LABEL_THRESHOLDS, label_bucket
from app.services.team_registry import TEAMS, by_code, by_history_name, require_code
from app.sources.open_meteo import at_kickoff
from tests.conftest import simulate_league

# ---------------------------------------------------------------- registry


def test_registry_codes_and_history_names_are_unique():
    assert len({t.code for t in TEAMS}) == len(TEAMS)
    assert len({t.history_name for t in TEAMS}) == len(TEAMS)
    assert by_code("atl").history_name == "Ath Madrid"
    assert by_history_name("La Coruna").code == "DEP"
    with pytest.raises(KeyError, match="team_registry"):
        require_code("XXX", "Mystery FC")


# ---------------------------------------------------------------- predictions


def test_load_config_requires_the_tuned_file(tmp_path):
    with pytest.raises(FileNotFoundError, match="app.jobs.backtest"):
        load_config(tmp_path / "missing.json")
    assert load_config(tmp_path / "missing.json", allow_defaults=True) == DixonColesConfig()
    path = tmp_path / "config.json"
    path.write_text('{"model": "dixon-coles", "xi": 0.004, "ridge": 3.0}', encoding="utf-8")
    config = load_config(path)
    assert (config.xi, config.ridge) == (0.004, 3.0)


def test_merge_recent_results_adds_only_missing_matches():
    history = pd.DataFrame(
        {
            "season_start": [2026],
            "date": [pd.Timestamp("2026-09-06")],
            "home": ["Betis"],
            "away": ["Sevilla"],
            "hg": [1],
            "ag": [0],
            "hst": [5.0],
            "ast": [2.0],
        }
    )
    recent = pd.DataFrame(
        {
            "season_start": [2026, 2026],
            "date": [pd.Timestamp("2026-09-07"), pd.Timestamp("2026-09-13")],
            "home": ["Betis", "Getafe"],
            "away": ["Sevilla", "Elche"],
            "hg": [1, 2],
            "ag": [0, 2],
        }
    )
    merged = merge_recent_results(history, recent)
    assert len(merged) == 2  # Betis–Sevilla is the same match a day apart (UTC vs local date)
    assert merged.iloc[-1][["home", "away"]].tolist() == ["Getafe", "Elche"]
    assert merge_recent_results(history, recent.iloc[0:0]) is history


def test_predict_both_sides_mirrors_the_match():
    league = simulate_league()
    model = fit_dixon_coles(league, league["date"].max() + pd.Timedelta(days=1), config=DixonColesConfig(xi=0.0))
    home, away = predict_both_sides(model, "Strong", "Poor")
    assert home.p_win == pytest.approx(away.p_loss)
    assert home.xg_for == pytest.approx(away.xg_against)
    assert home.difficulty_score < away.difficulty_score
    assert home.difficulty_label in {"Easy", "Easy-ish"} and away.difficulty_label in {"Hard-ish", "Hard"}
    assert home.explanation["venue"] == "H" and "opponent_attack" in away.explanation


# ---------------------------------------------------------------- weather


def test_at_kickoff_picks_nearest_hour_and_handles_naive_datetimes():
    data = {
        "hourly": {
            "time": ["2026-09-16T18:00", "2026-09-16T19:00", "2026-09-16T20:00"],
            "temperature_2m": [22, 21, 20],
            "apparent_temperature": [22, 21, 20],
            "relative_humidity_2m": [50, 55, 60],
            "precipitation": [0, 0.4, 1.2],
            "wind_speed_10m": [8, 9, 10],
        }
    }
    now = datetime(2026, 9, 14, tzinfo=UTC)
    row = at_kickoff(data, datetime(2026, 9, 16, 19, 45), now)  # naive, as SQLite returns it
    assert row["temperature_c"] == 20 and row["forecast_lead_hours"] == pytest.approx(67.75)  # 20:00 is nearest
    assert at_kickoff(data, datetime(2026, 9, 16, 19, 10), now)["temperature_c"] == 21
    assert at_kickoff(data, datetime(2026, 9, 30, 19, tzinfo=UTC), now) is None


# ---------------------------------------------------------------- grid + API

SOURCE_IDS = {"FCB": 81, "RMA": 86, "SEV": 559, "BET": 90, "ATL": 78, "VAL": 95}


def fdo_match(match_id, matchday, kickoff, home, away, status="TIMED", score=(None, None)):
    team = lambda code: {
        "id": SOURCE_IDS[code],
        "tla": code,
        "name": by_code(code).name,
        "shortName": by_code(code).name,
    }
    return {
        "id": match_id,
        "matchday": matchday,
        "utcDate": kickoff,
        "status": status,
        "homeTeam": team(home),
        "awayTeam": team(away),
        "season": {"startDate": "2026-08-16"},
        "score": {"fullTime": {"home": score[0], "away": score[1]}},
    }


@pytest.fixture()
def db():
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(engine)
    session = sessionmaker(bind=engine)()
    yield session
    session.close()


@pytest.fixture()
def seeded(db):
    comp = get_or_create_comp(db)
    for payload in [
        fdo_match(1, 1, "2026-08-16T19:00:00Z", "FCB", "RMA", "FINISHED", (2, 1)),
        fdo_match(2, 1, "2026-08-17T19:00:00Z", "SEV", "BET", "FINISHED", (0, 0)),
        fdo_match(3, 2, "2026-09-20T19:00:00Z", "RMA", "SEV", "TIMED"),
        fdo_match(4, 2, "2026-09-20T15:00:00Z", "BET", "FCB", "SCHEDULED"),
        fdo_match(5, 1, "2026-10-01T19:00:00Z", "ATL", "VAL", "TIMED"),  # matchday 1 game moved to October
    ]:
        upsert_fixture(db, comp, payload)
    db.commit()
    fx = db.query(Fixture).filter_by(source_fixture_id="3").one()
    for team_id, p_win in ((fx.home_team_id, 0.6), (fx.away_team_id, 0.2)):
        db.add(
            Prediction(
                fixture_id=fx.id,
                perspective_team_id=team_id,
                prediction_ts=datetime.now(UTC),
                model_version="dixon-coles-v1",
                p_win=p_win,
                p_draw=0.2,
                p_loss=0.8 - p_win,
                expected_points=3 * p_win + 0.2,
                difficulty_score=40.0,
                difficulty_label="Easy-ish",
                p_clean_sheet=0.3,
                xg_for=1.7,
                xg_against=0.9,
            )
        )
    db.add(
        WeatherSnapshot(
            fixture_id=fx.id,
            snapshot_ts=datetime.now(UTC),
            available_at=datetime.now(UTC),
            temperature_c=24.0,
            precipitation_mm=0.0,
            wind_speed_kmh=7.0,
        )
    )
    db.commit()
    return db


def test_resolve_team_uses_registry_and_is_idempotent(db):
    payload = {"id": 86, "tla": "RMA", "name": "Real Madrid CF", "shortName": "Real Madrid"}
    first = resolve_team(db, payload)
    second = resolve_team(db, payload)
    assert first.id == second.id and first.code == "RMA" and first.color == by_code("RMA").color
    assert first.stadium_id is not None


def test_grid_shape_results_predictions_and_badges(seeded):
    grid = build_fixture_grid(seeded)
    assert grid.season == "2026/27" and [md.number for md in grid.matchdays] == [1, 2]
    assert grid.matchdays[0].finished  # its only unplayed game was moved to October
    assert grid.current_matchday == 2
    teams = {team.code: team for team in grid.teams}
    assert set(teams) == {"FCB", "RMA", "SEV", "BET", "ATL", "VAL"}

    barca_md1 = teams["FCB"].cells[0][0]
    assert barca_md1.status == "finished" and barca_md1.result.outcome == "W" and barca_md1.prediction is None
    madrid_md1 = teams["RMA"].cells[0][0]
    assert madrid_md1.result.outcome == "L" and madrid_md1.venue == "A"

    madrid_md2 = teams["RMA"].cells[1][0]
    assert madrid_md2.prediction.probabilities.win == 0.6 and madrid_md2.weather.temperature_c == 24.0
    assert madrid_md2.kickoff_utc.tzinfo is not None
    assert teams["FCB"].cells[1][0].date_confirmed is False  # SCHEDULED = kickoff not set yet
    assert teams["ATL"].cells[0][0].rescheduled is True
    assert teams["ATL"].cells[1] == []  # no game on matchday 2


def test_bucket_always_matches_label_even_on_rounding_boundaries(seeded):
    # 48.64 rounds to 48.6 (<= Easy-ish threshold) but its label is "Normal": the bucket must follow the label.
    fx = seeded.query(Fixture).filter_by(source_fixture_id="3").one()
    pred = seeded.query(Prediction).filter_by(fixture_id=fx.id, perspective_team_id=fx.home_team_id).one()
    pred.difficulty_score, pred.difficulty_label = 48.64, "Normal"
    seeded.commit()
    grid = build_fixture_grid(seeded)
    cell = next(t for t in grid.teams if t.code == "RMA").cells[1][0]
    assert cell.prediction.difficulty == 48.6 and cell.prediction.label == "Normal" and cell.prediction.bucket == 3
    for team in grid.teams:
        for column in team.cells:
            for c in column:
                if c.prediction:
                    assert c.prediction.bucket == label_bucket(c.prediction.label)


def test_lens_scales_shape(seeded):
    scales = build_fixture_grid(seeded).lens_scales
    assert scales.overall.cuts == list(LABEL_THRESHOLDS) and scales.overall.higher_is_easier is False
    assert scales.attack.higher_is_easier and scales.defence.higher_is_easier


def test_quantile_scale_gives_label_shares():
    values = [i / 100 for i in range(100)]
    scale = quantile_scale(values)
    cuts = scale.cuts
    assert cuts == sorted(cuts, reverse=True)
    bucket = lambda v: 1 + sum(v < c for c in cuts)
    counts = [sum(1 for v in values if bucket(v) == b) for b in range(1, 6)]
    assert counts == [15, 20, 30, 20, 15]
    assert quantile_scale([]).cuts == [0.0, 0.0, 0.0, 0.0]


def test_postponed_games_lose_their_forecast(seeded):
    fx = seeded.query(Fixture).filter_by(source_fixture_id="3").one()
    fx.status = "POSTPONED"
    seeded.commit()
    madrid = next(t for t in build_fixture_grid(seeded).teams if t.code == "RMA")
    cell = madrid.cells[1][0]
    assert cell.status == "postponed" and cell.prediction is None and cell.weather is None


def test_grid_reads_only_the_latest_model_version(seeded):
    fx = seeded.query(Fixture).filter_by(source_fixture_id="3").one()
    seeded.add(
        Prediction(
            fixture_id=fx.id,
            perspective_team_id=fx.home_team_id,
            model_version="old-model",
            prediction_ts=datetime(2026, 1, 1, tzinfo=UTC),
            p_win=0.1,
            p_draw=0.1,
            p_loss=0.8,
            expected_points=0.4,
            difficulty_score=90.0,
            difficulty_label="Hard",
        )
    )
    seeded.commit()
    grid = build_fixture_grid(seeded)
    assert grid.model_version == "dixon-coles-v1"
    madrid = next(t for t in grid.teams if t.code == "RMA")
    assert madrid.cells[1][0].prediction.probabilities.win == 0.6


def test_resync_in_new_session_keeps_schedule_version(db):
    payload = {"matches": [fdo_match(9, 3, "2026-09-27T19:00:00Z", "FCB", "SEV")]}
    for _ in range(3):
        sync(payload, session_factory=lambda: _reopen(db))
    fx = db.query(Fixture).filter_by(source_fixture_id="9").one()
    assert fx.schedule_version == 1
    moved = {"matches": [fdo_match(9, 3, "2026-09-28T19:00:00Z", "FCB", "SEV")]}
    sync(moved, session_factory=lambda: _reopen(db))
    db.expire_all()
    assert db.query(Fixture).filter_by(source_fixture_id="9").one().schedule_version == 2


def _reopen(db):
    """A new session on the same engine, so datetimes come back from SQLite without a timezone."""
    return sessionmaker(bind=db.get_bind())()


def test_clean_status_and_status_helpers():
    assert clean_status("TIMED") == "TIMED" and clean_status(None) == "SCHEDULED"
    assert clean_status("2026-09-14 19:00:00Z") == "TIMED"


def test_replace_predictions_does_not_pile_up(seeded):
    league = simulate_league()
    model = fit_dixon_coles(league, league["date"].max() + pd.Timedelta(days=1), config=DixonColesConfig(xi=0.0))
    fixtures = seeded.query(Fixture).filter(Fixture.source_fixture_id.in_(["3", "4"])).all()
    teams = {fx.home_team_id for fx in fixtures} | {fx.away_team_id for fx in fixtures}
    names = dict(zip(sorted(teams), ["Strong", "Good", "Mid A", "Weak"], strict=True))
    now = datetime.now(UTC)
    assert replace_predictions(seeded, fixtures, model, names, now, "dixon-coles-v1+aaaaaaaa") == 4
    assert replace_predictions(seeded, fixtures, model, names, now, "dixon-coles-v1+aaaaaaaa") == 4
    # A retuned model replaces the old version's rows instead of adding a second set.
    assert replace_predictions(seeded, fixtures, model, names, now, "dixon-coles-v1+bbbbbbbb") == 4
    rows = seeded.query(Prediction).filter(Prediction.fixture_id.in_([fx.id for fx in fixtures])).all()
    assert len(rows) == 4 and {r.model_version for r in rows} == {"dixon-coles-v1+bbbbbbbb"}


def test_upcoming_fixtures_compares_in_utc(seeded):
    now = datetime(2026, 9, 20, 16, 0, tzinfo=UTC)  # after BET–FCB (15:00), before RMA–SEV (19:00)
    seeded.query(Fixture).filter_by(source_fixture_id="4").one().status = "TIMED"
    seeded.commit()
    upcoming = upcoming_fixtures(_reopen(seeded), "2026/27", now)
    assert [fx.source_fixture_id for fx in upcoming] == ["3", "5"]


def test_weather_only_for_confirmed_kickoffs_inside_horizon(seeded):
    now = datetime(2026, 9, 14, tzinfo=UTC)
    grouped = forecastable(seeded.query(Fixture).all(), now)
    ids = sorted(fx.source_fixture_id for fxs in grouped.values() for fx in fxs)
    assert ids == ["3"]  # 4 is SCHEDULED (time TBC), 5 is beyond 14 days, 1–2 are finished


def test_status_helpers_and_matchday_window():
    assert [normalize_status(s) for s in ("FINISHED", "AWARDED", "IN_PLAY", "POSTPONED", "TIMED", None)] == [
        "finished",
        "finished",
        "live",
        "postponed",
        "scheduled",
        "scheduled",
    ]
    assert date_confirmed("TIMED") and not date_confirmed("SCHEDULED")
    kickoffs = [datetime(2026, 9, d, 19) for d in (19, 20, 21)] + [datetime(2026, 10, 30, 19)]
    start, end, _ = matchday_window(kickoffs)
    assert (start.day, end.day) == (19, 21) and start.tzinfo is UTC


def test_fixture_grid_endpoint(seeded):
    fastapi_app.dependency_overrides[get_db] = lambda: seeded
    try:
        client = TestClient(fastapi_app)
        body = client.get("/api/fixture-grid").json()
        assert body["success"] is True and len(body["data"]["teams"]) == 6
        assert body["meta"]["last_predicted_at"].endswith("Z")
    finally:
        fastapi_app.dependency_overrides.clear()


def test_fixture_grid_endpoint_without_data(db):
    fastapi_app.dependency_overrides[get_db] = lambda: db
    try:
        body = TestClient(fastapi_app).get("/api/fixture-grid").json()
        assert body == {
            "success": False,
            "data": None,
            "error": "No fixtures yet.",
            "meta": None,
        }
    finally:
        fastapi_app.dependency_overrides.clear()
