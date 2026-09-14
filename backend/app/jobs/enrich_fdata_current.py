from __future__ import annotations
import asyncio
from datetime import datetime, timezone, timedelta
import pandas as pd
from app.db import SessionLocal
from app.models import Team, Fixture, TeamMatchStats, OddsSnapshot
from app.sources.football_data_co_uk import download_la_liga,best_1x2_columns
from app.services.entity_resolver import norm
from app.services.team_registry import by_code
from app.services.scoring import market_probs

def parse_date(v):
    for fmt in ("%d/%m/%Y","%d/%m/%y"):
        try: return datetime.strptime(str(v),fmt).replace(tzinfo=timezone.utc)
        except ValueError: pass
    return None

def team_map(db):
    out={}
    for t in db.query(Team).all():
        out[norm(t.canonical_name)]=t.id
        if t.short_name: out[norm(t.short_name)]=t.id
        info=by_code(t.code)
        if info: out[norm(info.history_name)]=t.id  # football-data.co.uk spelling, e.g. "Ath Madrid"
    return out

async def main(season_start=2026):
    df=await download_la_liga(season_start)
    odds_cols=best_1x2_columns(df)
    db=SessionLocal()
    try:
        tm=team_map(db)
        matched=0
        for _,r in df.iterrows():
            hid=tm.get(norm(str(r.HomeTeam))); aid=tm.get(norm(str(r.AwayTeam)))
            dt=parse_date(r.Date)
            if not hid or not aid or not dt: continue
            lo=dt-timedelta(days=1); hi=dt+timedelta(days=1)
            fx=(db.query(Fixture).filter(Fixture.home_team_id==hid,Fixture.away_team_id==aid,Fixture.kickoff_utc>=lo,Fixture.kickoff_utc<=hi).first())
            if not fx: continue
            matched+=1
            hs=db.query(TeamMatchStats).filter_by(fixture_id=fx.id,team_id=hid).first()
            aw=db.query(TeamMatchStats).filter_by(fixture_id=fx.id,team_id=aid).first()
            if hs and aw:
                pairs=[("HS","shots"),("HST","shots_on_target"),("HC","corners"),("HF","fouls"),("HY","yellow_cards"),("HR","red_cards")]
                for col,attr in pairs:
                    if col in df.columns and pd.notna(r.get(col)): setattr(hs,attr,float(r[col]))
                pairs=[("AS","shots"),("AST","shots_on_target"),("AC","corners"),("AF","fouls"),("AY","yellow_cards"),("AR","red_cards")]
                for col,attr in pairs:
                    if col in df.columns and pd.notna(r.get(col)): setattr(aw,attr,float(r[col]))
            if odds_cols and all(pd.notna(r.get(c)) for c in odds_cols):
                try:
                    o=(float(r[odds_cols[0]]),float(r[odds_cols[1]]),float(r[odds_cols[2]]))
                    p,over=market_probs(*o)
                    exists=db.query(OddsSnapshot).filter_by(fixture_id=fx.id,bookmaker="Football-Data.co.uk consensus").first()
                    snap=exists or OddsSnapshot(fixture_id=fx.id,bookmaker="Football-Data.co.uk consensus",source="football-data.co.uk",snapshot_ts=datetime.now(timezone.utc),available_at=datetime.now(timezone.utc))
                    snap.home_decimal,snap.draw_decimal,snap.away_decimal=o
                    snap.home_prob,snap.draw_prob,snap.away_prob=p
                    snap.overround=over
                    if not exists: db.add(snap)
                except Exception: pass
        db.commit()
        print("matched/enriched",matched,"rows")
    finally:
        db.close()

if __name__=="__main__": asyncio.run(main())
