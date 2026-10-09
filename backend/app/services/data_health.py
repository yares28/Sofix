"""Cheap, dated coverage of kept data. Recorded source failures warn; quiet calendars do not."""

from datetime import datetime
from typing import Any

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models import Fixture, MatchForecast, MatchOdds, PlayerAbsence, PlayerGame, ReadModel, RefreshRun
from app.services.timeutil import as_utc

KEY = "data_health"


def iso(value: Any) -> str | None:
    return as_utc(value).isoformat() if isinstance(value, datetime) else value.isoformat() if value else None


def build(db: Session, now: datetime) -> dict[str, Any]:
    runs = db.query(RefreshRun).order_by(RefreshRun.id.desc()).limit(40).all()

    def latest(step: str, throttle: bool = False) -> dict[str, Any]:
        for run in runs:
            detail = (run.details or {}).get(step)
            if not isinstance(detail, dict):
                continue
            skipped = (detail.get("result") or {}).get("skipped", "")
            if throttle and isinstance(skipped, str) and skipped.startswith("fetched "):
                continue
            return detail
        return {}

    def unavailable(detail: dict) -> bool:
        return detail.get("status") == "failed" or bool((detail.get("result") or {}).get("skipped"))

    def row(id: str, count: int, newest: Any, last_read: Any, **extra: Any) -> dict[str, Any]:
        return dict(id=id, count=count, newest=iso(newest), lastRead=iso(last_read), warnings=[], **extra)

    games, players, read = db.query(
        func.count(PlayerGame.game_id), func.count(func.distinct(PlayerGame.player)), func.max(PlayerGame.read_at)
    ).one()
    past = db.query(func.max(PlayerGame.date)).filter(PlayerGame.date <= now, PlayerGame.read_at.isnot(None)).scalar()
    games_row = row("games", games, past, read, players=players)
    daily = db.get(ReadModel, "league_history_status")
    if daily and daily.payload.get("read", 0) < daily.payload.get("players", 0):
        games_row["warnings"].append(
            f"Last daily read reached {daily.payload.get('read', 0)} of {daily.payload['players']} players; saved games remain."
        )
    if unavailable(latest("sorare")):
        games_row["warnings"].append("Sorare unavailable on the last refresh; saved games remain.")

    odds_count, odds_read = db.query(func.count(MatchOdds.source), func.max(MatchOdds.read_at)).one()
    newest_odds = db.query(MatchOdds).order_by(MatchOdds.date.desc(), MatchOdds.read_at.desc()).first()
    odds_row = row(
        "odds",
        odds_count,
        newest_odds.date if newest_odds else None,
        odds_read,
        source=f"{newest_odds.source} ({newest_odds.which})" if newest_odds else None,
    )
    if newest_odds and newest_odds.source == "the-odds-api":
        odds_row["source"] = "The Odds API"
    prediction = latest("predict")
    history_source = (prediction.get("result") or {}).get("history_source")
    if unavailable(prediction) or history_source in {"stored matches", "cached CSV"}:
        odds_row["warnings"].append("football-data.co.uk unavailable on the last read; saved prices remain.")
    if history_source == "CSV" and (prediction.get("result") or {}).get("odds_archive_complete") is False:
        odds_row["warnings"].append("Older CSV seasons are still missing; saved prices remain.")
    if unavailable(latest("odds", throttle=True)):
        odds_row["warnings"].append("The Odds API unavailable on the last read; saved prices remain.")

    forecasts, forecast_read = db.query(func.count(MatchForecast.fixture_id), func.max(MatchForecast.frozen_at)).one()
    forecast_date = (
        db.query(func.max(Fixture.kickoff_utc)).join(MatchForecast, MatchForecast.fixture_id == Fixture.id).scalar()
    )
    forecasts_row = row("forecasts", forecasts, forecast_date, forecast_read)
    if prediction.get("status") == "failed":
        forecasts_row["warnings"].append("Last prediction step failed; earlier forecasts remain.")

    spells, seen, returned = db.query(
        func.count(PlayerAbsence.id), func.max(PlayerAbsence.last_seen), func.max(PlayerAbsence.back)
    ).one()
    seen = max((as_utc(value) for value in (seen, returned) if value is not None), default=None)
    ongoing = db.query(func.count(PlayerAbsence.id)).filter(PlayerAbsence.back.is_(None)).scalar()
    absences_row = row("absences", spells, seen, seen, ongoing=ongoing)
    feed = db.get(ReadModel, "futbolfantasy")
    if feed and (feed.payload.get("failed") or feed.payload.get("stopped")):
        absences_row["warnings"].append("Futbol Fantasy could not read every match; saved spells remain.")

    weeks, week_end, saved_at = (
        db.query(
            func.count(ReadModel.key), func.max(ReadModel.payload["end"].as_string()), func.max(ReadModel.updated_at)
        )
        .filter(ReadModel.key.like("my_week:%"))
        .one()
    )
    weeks_row = row("weeks", weeks, datetime.fromisoformat(week_end) if week_end else None, saved_at)
    return dict(
        version=1, generatedAt=now.isoformat(), datasets=[games_row, odds_row, forecasts_row, absences_row, weeks_row]
    )


def publish(db: Session, now: datetime) -> dict[str, Any]:
    from app.services.publish import put

    payload = build(db, now)
    put(db, KEY, payload, now)
    return payload
