"""Permanent match readings. CSV prices take priority; no forecast is reconstructed after kick-off."""

from __future__ import annotations

import logging
from datetime import datetime, timedelta
from io import StringIO
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd
from sqlalchemy.orm import Session

from app.backtest.data import MATCH_COLUMNS, normalize_season
from app.backtest.metrics import outcome_index, ranked_probability_score
from app.models import Fixture, MarketOdds, MatchForecast, MatchOdds, Team
from app.services.team_registry import by_code, by_history_name
from app.services.timeutil import as_utc
from app.sources.football_data_co_uk import decode_csv

CSV = "football-data.co.uk"
API = "the-odds-api"
PRICES = ["odds_h", "odds_d", "odds_a"]
logger = logging.getLogger(__name__)


def code(name: str) -> str:
    info = by_history_name(name)
    return info.code if info else name


def history_name(name: str) -> str:
    info = by_code(name)
    return info.history_name if info else name


def cached_history(cache_dir: str) -> pd.DataFrame:
    """Bootstrap every cached season, without spending a request on older seasons."""
    frames = []
    for path in sorted(Path(cache_dir).glob("SP1_*.csv")):
        label = path.stem.removeprefix("SP1_")
        if len(label) != 4 or not label.isdigit():
            continue
        try:
            frames.append(normalize_season(pd.read_csv(StringIO(decode_csv(path.read_bytes()))), 2000 + int(label[:2])))
        except (OSError, ValueError, pd.errors.ParserError):
            logger.warning("unreadable cached season %s; keeping saved matches", label)
    return pd.concat(frames, ignore_index=True) if frames else pd.DataFrame(columns=MATCH_COLUMNS)


def valid_prices(values: Any) -> bool:
    return all(value is not None and np.isfinite(value) and value > 1 for value in values)


def fixture_index(db: Session) -> dict[tuple[str, str, str], list[Fixture]]:
    teams = {team.id: team.code for team in db.query(Team).all()}
    index: dict[tuple[str, str, str], list[Fixture]] = {}
    for fx in db.query(Fixture).all():
        index.setdefault((fx.season, teams[fx.home_team_id], teams[fx.away_team_id]), []).append(fx)
    return index


def keep_history(db: Session, matches: pd.DataFrame, now: datetime) -> None:
    existing = {(r.season, r.date, r.home, r.away, r.source): r for r in db.query(MatchOdds).all()}
    fixtures = fixture_index(db)
    for item in matches.to_dict("records"):
        if not valid_prices([item.get(c) for c in PRICES]):
            continue
        start = int(item["season_start"])
        season, day = f"{start}/{(start + 1) % 100:02}", pd.Timestamp(item["date"]).date()
        home, away = code(item["home"]), code(item["away"])
        key = (season, day, home, away, CSV)
        row = existing.get(key)
        if row is None:
            row = MatchOdds(season=season, date=day, home=home, away=away, source=CSV)
            db.add(row)
            existing[key] = row
        # CSVs give local dates, fixtures UTC: allow midnight's one-day difference.
        fx = next(
            (
                f
                for f in fixtures.get((season, home, away), [])
                if abs(as_utc(f.kickoff_utc).date() - day) <= timedelta(days=1)
            ),
            None,
        )
        row.fixture_id = fx.id if fx else None
        row.hg, row.ag = int(item["hg"]), int(item["ag"])
        row.which = str(item.get("odds_which") or "CSV")
        for column in [*PRICES, "odds_pre_h", "odds_pre_d", "odds_pre_a"]:
            value = item.get(column)
            if value is not None and pd.notna(value):
                setattr(row, column, float(value))
        row.read_at = now
    db.commit()


def archive_market(db: Session, now: datetime) -> None:
    teams = {team.id: team.code for team in db.query(Team).all()}
    for odds, fx in db.query(MarketOdds, Fixture).join(Fixture, MarketOdds.fixture_id == Fixture.id).all():
        kickoff = as_utc(fx.kickoff_utc)
        if as_utc(odds.fetched_at) >= kickoff or as_utc(odds.fetched_at) > now:
            continue
        key = (fx.season, kickoff.date(), teams[fx.home_team_id], teams[fx.away_team_id], API)
        row = db.get(MatchOdds, key)
        if row is not None and as_utc(row.read_at) > as_utc(odds.fetched_at):
            continue
        if not valid_prices([1 / p if p > 0 else None for p in (odds.p_home, odds.p_draw, odds.p_away)]):
            continue
        if row is None:
            row = MatchOdds(season=key[0], date=key[1], home=key[2], away=key[3], source=API)
            db.add(row)
        row.fixture_id, row.hg, row.ag = fx.id, fx.home_goals, fx.away_goals
        row.odds_h, row.odds_d, row.odds_a = (1 / p for p in (odds.p_home, odds.p_draw, odds.p_away))
        row.over_2_5, row.which, row.read_at = odds.p_over_2_5, API, odds.fetched_at
    db.commit()


def fill_history(db: Session, matches: pd.DataFrame) -> pd.DataFrame:
    """Fill only missing CSV prices/results. Each match counts once, even when both sources read it."""
    rows = matches.to_dict("records")
    index: dict[tuple[int, str, str], list[dict]] = {}
    for item in rows:
        index.setdefault((int(item["season_start"]), code(item["home"]), code(item["away"])), []).append(item)
    saved = sorted(db.query(MatchOdds).all(), key=lambda r: (r.source != CSV, -as_utc(r.read_at).timestamp()))
    fixtures = {fx.id: fx for fx in db.query(Fixture).all()}
    counted: set[int] = set()
    for row in saved:
        fx = fixtures.get(row.fixture_id) if row.fixture_id else None
        if row.fixture_id in counted:
            continue
        hg, ag = (fx.home_goals, fx.away_goals) if fx and fx.status == "FINISHED" else (row.hg, row.ag)
        if hg is None or ag is None or not valid_prices([row.odds_h, row.odds_d, row.odds_a]):
            continue
        if fx and row.source == API and as_utc(row.read_at) >= as_utc(fx.kickoff_utc):
            continue
        if row.fixture_id:
            counted.add(row.fixture_id)
        key = (int(row.season.split("/")[0]), row.home, row.away)
        item = next(
            (r for r in index.get(key, []) if abs(pd.Timestamp(r["date"]).date() - row.date) <= timedelta(days=1)), None
        )
        if item is not None and valid_prices([item.get(c) for c in PRICES]):
            continue
        if item is None:
            item = dict(
                season_start=key[0],
                date=pd.Timestamp(row.date),
                home=history_name(row.home),
                away=history_name(row.away),
                hg=hg,
                ag=ag,
            )
            rows.append(item)
            index.setdefault(key, []).append(item)
        for column in [*PRICES, "odds_pre_h", "odds_pre_d", "odds_pre_a"]:
            item[column] = getattr(row, column)
        item["odds_which"] = row.which
    return pd.DataFrame(rows).reindex(columns=MATCH_COLUMNS)


def save_forecast(db: Session, fx: Fixture, now: datetime, version: str, **values: float) -> None:
    if as_utc(fx.kickoff_utc) <= now:
        return
    row = db.get(MatchForecast, fx.id)
    if row is not None and as_utc(row.frozen_at) > now:
        return
    if row is None:
        row = MatchForecast(fixture_id=fx.id)
        db.add(row)
    row.model_version, row.frozen_at = version, now
    for name, value in values.items():
        setattr(row, name, value)


def match_audit(db: Session, now: datetime, floor: int = 100) -> dict[str, Any]:
    saved = db.query(MatchOdds).all()
    by_fixture: dict[int, MatchOdds] = {}
    for row in sorted(saved, key=lambda r: (r.source != CSV, -as_utc(r.read_at).timestamp())):
        if row.fixture_id and valid_prices([row.odds_h, row.odds_d, row.odds_a]):
            by_fixture.setdefault(row.fixture_id, row)
    forecasts, prices, outcomes = [], [], []
    recorded = db.query(MatchForecast).count()
    for forecast, fx in db.query(MatchForecast, Fixture).join(Fixture, MatchForecast.fixture_id == Fixture.id).all():
        odds = by_fixture.get(fx.id)
        if (
            odds is None
            or fx.status != "FINISHED"
            or fx.home_goals is None
            or fx.away_goals is None
            or as_utc(forecast.frozen_at) >= as_utc(fx.kickoff_utc)
            or (odds.source == API and as_utc(odds.read_at) >= as_utc(fx.kickoff_utc))
            or as_utc(fx.kickoff_utc) > now
        ):
            continue
        forecasts.append([forecast.p_home, forecast.p_draw, forecast.p_away])
        implied = 1 / np.array([odds.odds_h, odds.odds_d, odds.odds_a], dtype=float)
        prices.append(implied / implied.sum())
        outcomes.append(int(outcome_index(np.array([fx.home_goals]), np.array([fx.away_goals]))[0]))
    enough = len(outcomes) >= floor
    through = max((r.date for r in saved), default=None)
    return dict(
        recorded=recorded,
        checked=len(outcomes),
        floor=floor,
        sofix=ranked_probability_score(np.array(forecasts), np.array(outcomes)) if enough else None,
        bookmakers=ranked_probability_score(np.array(prices), np.array(outcomes)) if enough else None,
        oddsThrough=through.isoformat() if through else None,
        generatedAt=now.isoformat(),
    )
