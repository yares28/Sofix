"""Sync LaLiga fixtures and results from football-data.org into the database.

python -m app.jobs.seed_and_sync
"""

from __future__ import annotations

import asyncio
import logging
from dataclasses import dataclass, field
from datetime import UTC, datetime

from sqlalchemy.orm import Session

from app.db import SessionLocal
from app.logging_config import configure_logging
from app.models import Competition, Fixture, SourceEntityMap, Stadium, Team
from app.services.crests import safe_crest_url
from app.services.team_registry import TeamInfo, by_code
from app.services.timeutil import as_utc
from app.sources.football_data_org import FootballDataOrg, MatchPayload, TeamRef, parse_matches

COMP_KEY = "PD"
SOURCE = "football-data.org"
UNKNOWN_TEAM_COLOR = "#8e8e93"
logger = logging.getLogger(__name__)

KNOWN_STATUSES = {
    "SCHEDULED",
    "TIMED",
    "IN_PLAY",
    "PAUSED",
    "LIVE",
    "FINISHED",
    "POSTPONED",
    "SUSPENDED",
    "CANCELLED",
    "AWARDED",
}


@dataclass
class SyncResult:
    fixtures: int = 0
    created: int = 0
    changed: int = 0
    skipped: int = 0
    unknown_statuses: int = 0
    unknown_teams: set[str] = field(default_factory=set)
    missing_fixtures: list[str] = field(default_factory=list)  # in the DB for this season, gone from the API
    source_last_updated: str | None = None  # newest football-data.org `lastUpdated` in the payload (ISO, UTC)


def get_or_create_comp(db: Session) -> Competition:
    comp = db.query(Competition).filter_by(source_key=COMP_KEY).first()
    if not comp:
        comp = Competition(source_key=COMP_KEY, name="La Liga", country="Spain", tier=1)
        db.add(comp)
        db.flush()
    return comp


def get_or_create_stadium(db: Session, info: TeamInfo) -> Stadium:
    stadium = db.query(Stadium).filter_by(name=info.stadium).first()
    if not stadium:
        stadium = Stadium(name=info.stadium, latitude=info.latitude, longitude=info.longitude)
        db.add(stadium)
        db.flush()
    return stadium


def season_label(match: MatchPayload) -> str:
    start = match.season.startDate
    return f"{start.year}/{str(start.year + 1)[-2:]}" if start else "unknown"


def clean_status(raw: str | None) -> str:
    """football-data.org status, validated. Some payloads carry the kickoff time in `status`;
    those matches have a fixed time, which is what TIMED means."""
    status = str(raw or "SCHEDULED").upper()
    return status if status in KNOWN_STATUSES else "TIMED"


def resolve_team(
    db: Session,
    ref: TeamRef | dict,
    cache: dict[str, Team] | None = None,
    unknown: set[str] | None = None,
) -> Team:
    """Find or create the team for a football-data.org team, keyed by source id, then code (tla).

    Clubs missing from the team registry (e.g. newly promoted) are created with neutral defaults
    instead of aborting the sync; add them to app/services/team_registry.py afterwards.
    """
    ref = ref if isinstance(ref, TeamRef) else TeamRef.model_validate(ref)
    if ref.id is None:
        raise ValueError("team without an id")
    source_id = str(ref.id)
    if cache is not None and source_id in cache:
        return cache[source_id]

    info = by_code(ref.tla)
    code = info.code if info else (ref.tla.upper() if ref.tla and len(ref.tla) == 3 else None)
    display_name = info.name if info else (ref.name or ref.shortName or f"Team {source_id}")
    mapping = db.query(SourceEntityMap).filter_by(entity_type="team", source=SOURCE, source_id=source_id).first()
    team = db.get(Team, mapping.internal_id) if mapping else None
    if team is None and code:
        team = db.query(Team).filter_by(code=code).first()
    if team is None:
        team = Team(canonical_name=display_name)
        db.add(team)

    team.short_name = ref.shortName or display_name
    team.code = code
    team.crest_url = safe_crest_url(ref.crest) or team.crest_url  # keep a known crest if the payload omits it
    if info:
        team.color = info.color
        team.stadium_id = get_or_create_stadium(db, info).id
    else:
        team.color = team.color or UNKNOWN_TEAM_COLOR
        label = f"{display_name} ({ref.tla or 'no code'})"
        if unknown is not None and label not in unknown:
            logger.warning("club %s is not in the team registry; created with defaults", label)
        if unknown is not None:
            unknown.add(label)
    db.flush()

    if not mapping:
        db.add(
            SourceEntityMap(
                entity_type="team",
                internal_id=team.id,
                source=SOURCE,
                source_id=source_id,
                source_name=ref.name or display_name,
            )
        )
    if cache is not None:
        cache[source_id] = team
    return team


def upsert_fixture(
    db: Session,
    comp: Competition,
    payload: MatchPayload | dict,
    teams: dict[str, Team] | None = None,
    existing: dict[str, Fixture] | None = None,
    unknown: set[str] | None = None,
    result: SyncResult | None = None,
) -> Fixture:
    """Insert or update one match; untouched rows are not rewritten.

    Pass shared `teams`/`existing` dicts to avoid per-match lookups.
    """
    match = payload if isinstance(payload, MatchPayload) else MatchPayload.model_validate(payload)
    home = resolve_team(db, match.homeTeam, teams, unknown)
    away = resolve_team(db, match.awayTeam, teams, unknown)
    source_id = str(match.id)
    fx = (
        existing.get(source_id)
        if existing is not None
        else db.query(Fixture).filter_by(source_fixture_id=source_id).first()
    )
    kickoff = as_utc(match.utcDate)
    season = season_label(match)
    status = clean_status(match.status)
    goals = match.score.fullTime
    if not fx:
        fx = Fixture(
            source_fixture_id=source_id,
            competition_id=comp.id,
            season=season,
            matchday=match.matchday,
            kickoff_utc=kickoff,
            home_team_id=home.id,
            away_team_id=away.id,
            stadium_id=home.stadium_id,
            status=status,
            home_goals=goals.home,
            away_goals=goals.away,
            source_updated_at=datetime.now(UTC),
        )
        db.add(fx)
        if existing is not None:
            existing[source_id] = fx
        if result is not None:
            result.created += 1
        return fx

    kickoff_moved = as_utc(fx.kickoff_utc) != kickoff
    updates = {
        "matchday": match.matchday,
        "status": status,
        "home_goals": goals.home,
        "away_goals": goals.away,
        "stadium_id": home.stadium_id,
    }
    changed_fields = {name: value for name, value in updates.items() if getattr(fx, name) != value}
    if kickoff_moved or changed_fields:
        for name, value in changed_fields.items():
            setattr(fx, name, value)
        if kickoff_moved:
            fx.kickoff_utc = kickoff
            fx.schedule_version += 1
        fx.source_updated_at = datetime.now(UTC)
        if result is not None:
            result.changed += 1
    return fx


async def main() -> SyncResult:
    payload = await FootballDataOrg().matches()
    return sync(payload)


def sync(payload: dict, session_factory=SessionLocal) -> SyncResult:
    matches, skipped = parse_matches(payload)
    result = SyncResult(skipped=skipped)
    if skipped:
        logger.warning("skipped %d matches with invalid data or undecided teams", skipped)
    db = session_factory()
    try:
        comp = get_or_create_comp(db)
        source_ids = [str(m.id) for m in matches]
        existing = {
            fx.source_fixture_id: fx for fx in db.query(Fixture).filter(Fixture.source_fixture_id.in_(source_ids)).all()
        }
        result.unknown_statuses = sum(1 for m in matches if str(m.status or "").upper() not in KNOWN_STATUSES)
        if result.unknown_statuses:
            logger.warning("%d matches had an unrecognised status; stored as TIMED", result.unknown_statuses)
        teams: dict[str, Team] = {}
        for match in matches:
            upsert_fixture(db, comp, match, teams, existing, result.unknown_teams, result)

        seasons = {season_label(m) for m in matches}
        if seasons:
            gone = (
                db.query(Fixture.source_fixture_id)
                .filter(Fixture.season.in_(seasons), Fixture.source_fixture_id.notin_(source_ids))
                .all()
            )
            result.missing_fixtures = sorted(str(row[0]) for row in gone)
            if result.missing_fixtures:
                logger.warning(
                    "%d fixtures in the database are no longer in the API: %s",
                    len(result.missing_fixtures),
                    ", ".join(result.missing_fixtures[:10]),
                )
        db.commit()
        result.fixtures = len(matches)
        updated = [as_utc(m.lastUpdated) for m in matches if m.lastUpdated]
        result.source_last_updated = max(updated).isoformat() if updated else None
        logger.info("synced %d fixtures (%d new, %d changed)", result.fixtures, result.created, result.changed)
        return result
    finally:
        db.close()


if __name__ == "__main__":
    configure_logging()
    asyncio.run(main())
