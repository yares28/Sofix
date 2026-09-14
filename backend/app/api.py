from datetime import datetime,timezone
from fastapi import APIRouter,Depends
from sqlalchemy.orm import Session
from sqlalchemy import or_
from app.db import get_db
from app.models import Fixture,Team,Prediction
from app.schemas import ApiResponse,FixtureDifficultyOut,FixtureGrid,Prob
from app.services.fixture_grid import build_fixture_grid,grid_meta
router=APIRouter(prefix="/api")

@router.get("/health")
def health(): return {"ok":True}

@router.get("/fixture-grid",response_model=ApiResponse[FixtureGrid])
def fixture_grid(db:Session=Depends(get_db)):
    grid=build_fixture_grid(db)
    if grid is None:
        return ApiResponse[FixtureGrid](success=False,error="No fixtures yet. Run python -m app.jobs.refresh.")
    return ApiResponse[FixtureGrid](success=True,data=grid,meta=grid_meta(db))

@router.get("/difficulty",response_model=list[FixtureDifficultyOut])
def difficulty(team_id:int|None=None,db:Session=Depends(get_db)):
    q=db.query(Fixture).filter(Fixture.kickoff_utc>=datetime.now(timezone.utc)).order_by(Fixture.kickoff_utc)
    if team_id: q=q.filter(or_(Fixture.home_team_id==team_id,Fixture.away_team_id==team_id))
    out=[]
    for fx in q.limit(120).all():
        ps=[fx.home_team_id,fx.away_team_id] if team_id is None else [team_id]
        for pid in ps:
            pred=(db.query(Prediction).filter(Prediction.fixture_id==fx.id,Prediction.perspective_team_id==pid).order_by(Prediction.prediction_ts.desc()).first())
            if not pred: continue
            t=db.get(Team,pid); oid=fx.away_team_id if pid==fx.home_team_id else fx.home_team_id; o=db.get(Team,oid)
            out.append(FixtureDifficultyOut(
              fixture_id=fx.id,kickoff_utc=fx.kickoff_utc,matchday=fx.matchday,team_id=pid,team_name=t.canonical_name,
              opponent_id=oid,opponent_name=o.canonical_name,venue="H" if pid==fx.home_team_id else "A",
              probabilities=Prob(win=pred.p_win,draw=pred.p_draw,loss=pred.p_loss),expected_points=pred.expected_points,
              difficulty_score=pred.difficulty_score,difficulty_label=pred.difficulty_label,explanation=pred.explanation or {}
            ))
    return out
