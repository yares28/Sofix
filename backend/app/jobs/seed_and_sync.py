from __future__ import annotations
import asyncio
from datetime import datetime, timezone
from sqlalchemy.orm import Session
from app.db import SessionLocal
from app.models import Competition, Team, SourceEntityMap, Fixture, Stadium
from app.sources.football_data_org import FootballDataOrg
from app.services.team_registry import require_code
from app.services.timeutil import as_utc

COMP_KEY="PD"

def get_or_create_comp(db:Session):
    c=db.query(Competition).filter_by(source_key=COMP_KEY).first()
    if not c:
        c=Competition(source_key=COMP_KEY,name="La Liga",country="Spain",tier=1)
        db.add(c); db.flush()
    return c

def get_or_create_stadium(db:Session, info):
    stadium=db.query(Stadium).filter_by(name=info.stadium).first()
    if not stadium:
        stadium=Stadium(name=info.stadium,latitude=info.latitude,longitude=info.longitude)
        db.add(stadium); db.flush()
    return stadium

KNOWN_STATUSES={"SCHEDULED","TIMED","IN_PLAY","PAUSED","LIVE","FINISHED","POSTPONED","SUSPENDED","CANCELLED","AWARDED"}

def clean_status(raw)->str:
    """football-data.org status, validated. Some payloads carry the kickoff time in `status`;
    those matches have a fixed time, which is what TIMED means."""
    status=str(raw or "SCHEDULED").upper()
    return status if status in KNOWN_STATUSES else "TIMED"

def resolve_team(db:Session, payload_team:dict, cache:dict|None=None):
    """Find or create the team for a football-data.org team object, keyed by its code (tla)."""
    source_id=str(payload_team["id"]); source_name=payload_team["name"]
    if cache is not None and source_id in cache:
        return cache[source_id]
    info=require_code(payload_team.get("tla"),source_name)
    sm=db.query(SourceEntityMap).filter_by(entity_type="team",source="football-data.org",source_id=source_id).first()
    team=db.get(Team,sm.internal_id) if sm else db.query(Team).filter_by(code=info.code).first()
    if not team:
        team=Team(canonical_name=info.name)
        db.add(team)
    team.short_name=payload_team.get("shortName") or info.name
    team.code=info.code; team.color=info.color
    team.stadium_id=get_or_create_stadium(db,info).id
    db.flush()
    if not sm:
        db.add(SourceEntityMap(entity_type="team",internal_id=team.id,source="football-data.org",source_id=source_id,source_name=source_name))
    if cache is not None:
        cache[source_id]=team
    return team

def upsert_fixture(db,comp,payload,teams:dict|None=None,existing:dict|None=None):
    """Insert or update one match. Pass shared `teams`/`existing` dicts to avoid per-match lookups."""
    h=resolve_team(db,payload["homeTeam"],teams)
    a=resolve_team(db,payload["awayTeam"],teams)
    source_id=str(payload["id"])
    fx=existing.get(source_id) if existing is not None else db.query(Fixture).filter_by(source_fixture_id=source_id).first()
    kickoff=datetime.fromisoformat(payload["utcDate"].replace("Z","+00:00"))
    season_start=str(payload.get("season",{}).get("startDate",""))[:4]
    season=f"{season_start}/{str(int(season_start)+1)[-2:]}" if season_start else "unknown"
    full=payload.get("score",{}).get("fullTime",{})
    status=clean_status(payload.get("status"))
    if not fx:
        fx=Fixture(
          source_fixture_id=source_id,competition_id=comp.id,season=season,matchday=payload.get("matchday"),
          kickoff_utc=kickoff,home_team_id=h.id,away_team_id=a.id,stadium_id=h.stadium_id,status=status,
          home_goals=full.get("home"),away_goals=full.get("away"),source_updated_at=datetime.now(timezone.utc)
        )
        db.add(fx)
        if existing is not None: existing[source_id]=fx
    else:
        changed=as_utc(fx.kickoff_utc)!=kickoff
        fx.kickoff_utc=kickoff; fx.matchday=payload.get("matchday"); fx.status=status
        fx.home_goals=full.get("home"); fx.away_goals=full.get("away")
        fx.source_updated_at=datetime.now(timezone.utc)
        fx.stadium_id=h.stadium_id
        if changed: fx.schedule_version+=1
    return fx

async def main():
    src=FootballDataOrg()
    payload=await src.matches()
    sync(payload)

def sync(payload:dict, session_factory=SessionLocal):
    db=session_factory()
    try:
        comp=get_or_create_comp(db)
        matches=payload.get("matches",[])
        source_ids=[str(m["id"]) for m in matches]
        existing={fx.source_fixture_id:fx for fx in db.query(Fixture).filter(Fixture.source_fixture_id.in_(source_ids)).all()}
        unknown=sum(1 for m in matches if str(m.get("status","")).upper() not in KNOWN_STATUSES)
        if unknown: print(f"warning: {unknown} matches had an unrecognised status; stored as TIMED")
        teams:dict={}
        for m in matches: upsert_fixture(db,comp,m,teams,existing)
        db.commit()
        print("synced",len(payload.get("matches",[])),"fixtures")
    finally:
        db.close()

if __name__=="__main__": asyncio.run(main())
