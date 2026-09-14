from math import radians, sin, cos, asin, sqrt
import math
from app.services.feature_schema import ALL_FEATURES

def haversine_km(lat1,lon1,lat2,lon2):
    if None in (lat1,lon1,lat2,lon2): return None
    r=6371.0088
    p1,p2=radians(lat1),radians(lat2)
    dp=radians(lat2-lat1); dl=radians(lon2-lon1)
    a=sin(dp/2)**2+cos(p1)*cos(p2)*sin(dl/2)**2
    return 2*r*asin(sqrt(a))

def shrink(observed,n,prior,k=6.0):
    if observed is None: return prior
    return (n/(n+k))*observed+(k/(n+k))*prior

def complete_missing(features):
    out=dict(features)
    for name in ALL_FEATURES:
        v=out.get(name)
        missing = v is None or (isinstance(v,float) and math.isnan(v))
        out[f"{name}_missing"]=1.0 if missing else 0.0
        if missing: out[name]=0.0
    return out

def absence_strength(rows):
    score=0.0
    for r in rows:
        pa=1.0 if r.get("p_available") is None else float(r["p_available"])
        ps=0.5 if r.get("p_start_if_available") is None else float(r["p_start_if_available"])
        score+=(1-pa)*ps*float(r.get("contribution",0.0))
    return score
