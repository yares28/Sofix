"""Predict every upcoming LaLiga fixture with the Dixon-Coles rating model.

    python -m app.jobs.predict

Fits on football-data.co.uk history (refreshed for the current season) plus any newer
results already synced from football-data.org, then replaces the Prediction rows (one per
team per upcoming fixture) for this model version.
"""

from __future__ import annotations

from datetime import UTC, datetime

import pandas as pd
from sqlalchemy.orm import Session

from app.backtest.data import load_history, promoted_teams
from app.config import settings
from app.db import SessionLocal
from app.modeling.dixon_coles import DixonColesModel, fit_dixon_coles
from app.models import Fixture, Prediction, Team
from app.services.rating_predictions import MODEL_VERSION, load_config, merge_recent_results, predict_both_sides
from app.services.team_registry import by_code
from app.services.timeutil import as_utc

HISTORY_SEASONS = 4  # current season plus three before it; the model only looks back two years
OPEN_STATUSES = {"SCHEDULED", "TIMED"}


def season_start_year(season_label: str) -> int:
    return int(season_label.split("/")[0])


def current_season(db: Session) -> str | None:
    return db.query(Fixture.season).order_by(Fixture.kickoff_utc.desc()).limit(1).scalar()


def recent_results_frame(db: Session, teams_by_id: dict[int, Team], season: str) -> pd.DataFrame:
    rows = []
    finished = (
        db.query(Fixture)
        .filter(
            Fixture.season == season,
            Fixture.status == "FINISHED",
            Fixture.home_goals.isnot(None),
            Fixture.away_goals.isnot(None),
        )
        .all()
    )
    for fx in finished:
        home, away = by_code(teams_by_id[fx.home_team_id].code), by_code(teams_by_id[fx.away_team_id].code)
        if home and away:
            rows.append(
                {
                    "season_start": season_start_year(season),
                    "date": pd.Timestamp(as_utc(fx.kickoff_utc).date()),
                    "home": home.history_name,
                    "away": away.history_name,
                    "hg": fx.home_goals,
                    "ag": fx.away_goals,
                }
            )
    return pd.DataFrame(rows, columns=["season_start", "date", "home", "away", "hg", "ag"])


def upcoming_fixtures(db: Session, season: str, now: datetime) -> list[Fixture]:
    """Open fixtures kicking off after `now`. Compared in Python: SQLite stores naive UTC datetimes."""
    candidates = db.query(Fixture).filter(Fixture.season == season, Fixture.status.in_(OPEN_STATUSES)).all()
    return sorted((fx for fx in candidates if as_utc(fx.kickoff_utc) > now), key=lambda fx: as_utc(fx.kickoff_utc))


def history_names(teams_by_id: dict[int, Team]) -> dict[int, str]:
    names = {}
    for team_id, team in teams_by_id.items():
        info = by_code(team.code)
        if info:
            names[team_id] = info.history_name
    return names


def replace_predictions(
    db: Session, fixtures: list[Fixture], model: DixonColesModel, names: dict[int, str], now: datetime
) -> int:
    """Swap this model version's predictions for the given fixtures in one transaction."""
    fixture_ids = [fx.id for fx in fixtures]
    db.query(Prediction).filter(
        Prediction.fixture_id.in_(fixture_ids or [-1]), Prediction.model_version == MODEL_VERSION
    ).delete(synchronize_session=False)
    written = 0
    for fx in fixtures:
        home_pred, away_pred = predict_both_sides(model, names[fx.home_team_id], names[fx.away_team_id])
        for team_id, pred in ((fx.home_team_id, home_pred), (fx.away_team_id, away_pred)):
            db.add(
                Prediction(
                    fixture_id=fx.id,
                    perspective_team_id=team_id,
                    prediction_ts=now,
                    model_version=MODEL_VERSION,
                    p_win=pred.p_win,
                    p_draw=pred.p_draw,
                    p_loss=pred.p_loss,
                    expected_points=pred.expected_points,
                    difficulty_score=pred.difficulty_score,
                    difficulty_label=pred.difficulty_label,
                    p_clean_sheet=pred.p_clean_sheet,
                    xg_for=pred.xg_for,
                    xg_against=pred.xg_against,
                    explanation=pred.explanation,
                )
            )
            written += 1
    db.commit()
    return written


def main() -> None:
    db = SessionLocal()
    now = datetime.now(UTC)
    try:
        season = current_season(db)
        if season is None:
            raise SystemExit("no fixtures in the database; run python -m app.jobs.seed_and_sync first")
        start = season_start_year(season)
        teams_by_id = {team.id: team for team in db.query(Team).all()}
        names = history_names(teams_by_id)

        history = load_history(
            range(start - HISTORY_SEASONS + 1, start + 1), settings.history_cache_dir, refresh_latest=True
        )
        history = merge_recent_results(history, recent_results_frame(db, teams_by_id, season))

        upcoming = upcoming_fixtures(db, season, now)
        season_teams = sorted({names[fx.home_team_id] for fx in upcoming} | {names[fx.away_team_id] for fx in upcoming})

        config = load_config(settings.dixon_coles_config_path)
        model = fit_dixon_coles(
            history,
            pd.Timestamp(now.date()),
            teams=season_teams,
            promoted=promoted_teams(history, start),
            config=config,
        )
        print(
            f"fitted on {len(history)} matches through {history['date'].max():%Y-%m-%d}; "
            f"home advantage {model.home_adv:+.3f}; config {config}"
        )

        written = replace_predictions(db, upcoming, model, names, now)
        print(f"predictions {written} for {len(upcoming)} upcoming fixtures")
    finally:
        db.close()


if __name__ == "__main__":
    main()
