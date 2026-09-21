"""Build the season's pre-season projection, once.

    python -m app.jobs.opening_projection            # writes backend/artifacts/opening_projection.json
    python -m app.jobs.opening_projection --check    # exit 1 if the committed file is missing or stale

The model is fitted only on matches played before the season's first kickoff, then run over every fixture,
so the result is what the board would have said in August. It cannot change during the season, so it is an
artifact that gets committed, not something the refresh recomputes (see services/opening_projection.py).

Run it at the yearly rollover, after the new season's fixtures have been synced and the registry knows every
promoted club, then commit the file.
"""

from __future__ import annotations

import argparse
import logging
import sys

import pandas as pd
from sqlalchemy.orm import Session

from app.backtest.data import load_history, promoted_from_fixtures
from app.config import settings
from app.db import SessionLocal
from app.jobs.predict import HISTORY_SEASONS, current_season, history_names, season_start_year
from app.logging_config import configure_logging
from app.modeling.dixon_coles import fit_dixon_coles
from app.models import Fixture, Team
from app.services.calibration import load_clean_sheet_calibration
from app.services.opening_projection import (
    OpeningFixture,
    OpeningProjection,
    build_opening_projection,
    load_opening_projection,
    save_opening_projection,
)
from app.services.rating_predictions import load_config, model_version
from app.services.team_registry import by_code
from app.services.timeutil import as_utc

logger = logging.getLogger(__name__)


def project_season(db: Session) -> OpeningProjection:
    season = current_season(db)
    if season is None:
        raise RuntimeError("no fixtures in the database; run python -m app.jobs.seed_and_sync first")
    start = season_start_year(season)
    teams_by_id = {team.id: team for team in db.query(Team).all()}
    names = history_names(teams_by_id)
    codes = {
        names[team_id]: (by_code(team.code).code if by_code(team.code) else team.code)
        for team_id, team in teams_by_id.items()
    }

    fixtures = db.query(Fixture).filter(Fixture.season == season, Fixture.matchday.isnot(None)).all()
    if not fixtures:
        raise RuntimeError(f"no fixtures with a matchday for {season}")
    cutoff = pd.Timestamp(min(as_utc(fixture.kickoff_utc) for fixture in fixtures).date())

    history = load_history(
        range(start - HISTORY_SEASONS + 1, start + 1), settings.history_cache_dir, refresh_latest=False
    )
    season_teams = sorted({names[fx.home_team_id] for fx in fixtures} | {names[fx.away_team_id] for fx in fixtures})
    promoted = promoted_from_fixtures(season_teams, history, start)
    config = load_config(settings.dixon_coles_config_path)
    model = fit_dixon_coles(history, cutoff, teams=season_teams, promoted=promoted, config=config)
    logger.info(
        "fitted on %d matches before %s; promoted (no history, rated from the prior): %s",
        len(history[history["date"] < cutoff]),
        cutoff.date(),
        ", ".join(sorted(promoted)) or "none",
    )

    planned = [
        OpeningFixture(matchday=fx.matchday, home=names[fx.home_team_id], away=names[fx.away_team_id])
        for fx in fixtures
        if fx.matchday is not None
    ]
    version = model_version(config, load_clean_sheet_calibration(settings.clean_sheet_calibration_path))
    return build_opening_projection(model, planned, codes, season, cutoff, version)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--check", action="store_true", help="fail if the committed projection is missing or stale")
    args = parser.parse_args(argv)

    db = SessionLocal()
    try:
        projection = project_season(db)
    finally:
        db.close()

    path = settings.opening_projection_path
    if args.check:
        saved = load_opening_projection(path, projection.season)
        if saved is None or saved.positions != projection.positions:
            print(f"{path} is out of date: run python -m app.jobs.opening_projection", file=sys.stderr)
            return 1
        return 0

    save_opening_projection(path, projection)
    table = sorted(projection.points.items(), key=lambda item: -item[1])
    logger.info("projected %s from %s (%d clubs)", projection.season, projection.cutoff, len(table))
    for place, (code, points) in enumerate(table, start=1):
        logger.info("%2d %-4s %5.1f", place, code, points)
    return 0


if __name__ == "__main__":
    configure_logging()
    raise SystemExit(main())
