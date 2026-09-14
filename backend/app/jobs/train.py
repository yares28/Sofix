from __future__ import annotations
import asyncio
from collections import defaultdict,deque
from datetime import datetime
from pathlib import Path
import joblib, numpy as np, pandas as pd
from sklearn.impute import SimpleImputer
from sklearn.linear_model import LogisticRegression
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler
from sklearn.metrics import log_loss
from app.sources.football_data_co_uk import download_la_liga,best_1x2_columns
from app.services.elo import update_pair
from app.services.scoring import market_probs

FEATURES=["elo_diff","team_ppg5","opp_ppg5","team_gd5","opp_gd5","team_ppg10","opp_ppg10","team_gd10","opp_gd10","rest_diff","shots_diff5","sot_diff5","season_progress","market_p_win","market_p_draw","market_p_loss"]

def pts(gf,ga): return 3 if gf>ga else 1 if gf==ga else 0
def avg(v):
    v=[x for x in v if x is not None and not pd.isna(x)]
    return sum(v)/len(v) if v else np.nan
def stats(h,n):
    z=list(h)[-n:]
    return {
      "ppg":avg([pts(x["gf"],x["ga"]) for x in z]),
      "gd":avg([x["gf"]-x["ga"] for x in z]),
      "sd":avg([x["shots"]-x["opp_shots"] for x in z if x["shots"] is not None and x["opp_shots"] is not None]),
      "sotd":avg([x["sot"]-x["opp_sot"] for x in z if x["sot"] is not None and x["opp_sot"] is not None])
    }
def parse_date(r):
    for fmt in ("%d/%m/%Y","%d/%m/%y"):
        try: return datetime.strptime(str(r["Date"]),fmt)
        except ValueError: pass
    raise ValueError(r["Date"])

def build(df,season):
    df=df.dropna(subset=["HomeTeam","AwayTeam","FTHG","FTAG"]).copy()
    df["_dt"]=df.apply(parse_date,axis=1); df=df.sort_values("_dt")
    elo=defaultdict(lambda:1500.0); hist=defaultdict(lambda:deque(maxlen=40)); last={}
    odds=best_1x2_columns(df); rows=[]
    for _,r in df.iterrows():
        h,a=str(r.HomeTeam),str(r.AwayTeam)
        h5,a5,h10,a10=stats(hist[h],5),stats(hist[a],5),stats(hist[h],10),stats(hist[a],10)
        rh=(r._dt-last[h]).days if h in last else np.nan
        ra=(r._dt-last[a]).days if a in last else np.nan
        mp=(np.nan,np.nan,np.nan)
        if odds and all(pd.notna(r.get(c)) for c in odds):
            try: mp,_=market_probs(float(r[odds[0]]),float(r[odds[1]]),float(r[odds[2]]))
            except Exception: pass
        rows.append({
          "season":season,"date":r._dt,"elo_diff":elo[h]+65-elo[a],
          "team_ppg5":h5["ppg"],"opp_ppg5":a5["ppg"],"team_gd5":h5["gd"],"opp_gd5":a5["gd"],
          "team_ppg10":h10["ppg"],"opp_ppg10":a10["ppg"],"team_gd10":h10["gd"],"opp_gd10":a10["gd"],
          "rest_diff":rh-ra if not(pd.isna(rh) or pd.isna(ra)) else np.nan,
          "shots_diff5":h5["sd"]-a5["sd"] if not(pd.isna(h5["sd"]) or pd.isna(a5["sd"])) else np.nan,
          "sot_diff5":h5["sotd"]-a5["sotd"] if not(pd.isna(h5["sotd"]) or pd.isna(a5["sotd"])) else np.nan,
          "season_progress":min(len(hist[h]),38)/38,
          "market_p_win":mp[0],"market_p_draw":mp[1],"market_p_loss":mp[2],
          "target":"W" if r.FTHG>r.FTAG else "D" if r.FTHG==r.FTAG else "L"
        })
        hg,ag=int(r.FTHG),int(r.FTAG)
        elo[h],elo[a],_=update_pair(elo[h],elo[a],hg,ag)
        hs=float(r.HS) if "HS" in df.columns and pd.notna(r.get("HS")) else None
        ass=float(r.AS) if "AS" in df.columns and pd.notna(r.get("AS")) else None
        hst=float(r.HST) if "HST" in df.columns and pd.notna(r.get("HST")) else None
        ast=float(r.AST) if "AST" in df.columns and pd.notna(r.get("AST")) else None
        hist[h].append({"gf":hg,"ga":ag,"shots":hs,"opp_shots":ass,"sot":hst,"opp_sot":ast})
        hist[a].append({"gf":ag,"ga":hg,"shots":ass,"opp_shots":hs,"sot":ast,"opp_sot":hst})
        last[h]=r._dt; last[a]=r._dt
    return rows

async def main(start=2015,end=2025):
    rows=[]
    for s in range(start,end+1):
        print("season",s)
        rows+=build(await download_la_liga(s),s)
    data=pd.DataFrame(rows).sort_values("date")
    holdout=data.season.max()
    tr=data[data.season<holdout]; va=data[data.season==holdout]
    model=Pipeline([
      ("impute",SimpleImputer(strategy="median",add_indicator=True)),
      ("scale",StandardScaler()),
      ("clf",LogisticRegression(max_iter=3000,C=.7))
    ])
    model.fit(tr[FEATURES],tr.target)
    p=model.predict_proba(va[FEATURES])
    ll=log_loss(va.target,p,labels=list(model.classes_))
    Path("artifacts").mkdir(exist_ok=True)
    joblib.dump({"version":f"logreg-fdata-{start}-{end}","features":FEATURES,"model":model,"validation":{"season":int(holdout),"log_loss":float(ll)}}, "artifacts/outcome_model.joblib")
    print("validation",holdout,"log_loss",round(ll,4))
if __name__=="__main__": asyncio.run(main())
