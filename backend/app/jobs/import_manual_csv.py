import argparse
from datetime import datetime
import pandas as pd
from app.db import SessionLocal
from app.models import AvailabilitySnapshot,Player,TeamMatchStats

def dt(v): return pd.to_datetime(v,utc=True).to_pydatetime() if pd.notna(v) else None

def import_availability(path):
    df=pd.read_csv(path); db=SessionLocal()
    try:
        for _,r in df.iterrows():
            db.add(AvailabilitySnapshot(
              fixture_id=int(r.fixture_id),player_id=int(r.player_id),snapshot_ts=dt(r.snapshot_ts),available_at=dt(r.available_at),
              status=str(r.status),absence_reason=None if pd.isna(r.get("absence_reason")) else str(r.absence_reason),
              injury_type=None if pd.isna(r.get("injury_type")) else str(r.injury_type),
              p_available=None if pd.isna(r.get("p_available")) else float(r.p_available),
              p_start_if_available=None if pd.isna(r.get("p_start_if_available")) else float(r.p_start_if_available),
              source=str(r.source),source_confidence=None if pd.isna(r.get("source_confidence")) else float(r.source_confidence)
            ))
        db.commit()
    finally: db.close()

def import_xg(path):
    df=pd.read_csv(path); db=SessionLocal()
    try:
        for _,r in df.iterrows():
            x=db.query(TeamMatchStats).filter_by(fixture_id=int(r.fixture_id),team_id=int(r.team_id)).first()
            if not x: continue
            for k in ("xg_for","xg_against","npxg_for","npxg_against","xpts","ppda","pressures"):
                if k in df.columns and pd.notna(r.get(k)): setattr(x,k,float(r[k]))
        db.commit()
    finally: db.close()

if __name__=="__main__":
    p=argparse.ArgumentParser(); p.add_argument("kind",choices=["availability","xg"]); p.add_argument("csv")
    a=p.parse_args()
    import_availability(a.csv) if a.kind=="availability" else import_xg(a.csv)
