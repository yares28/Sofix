from pathlib import Path
import joblib, numpy as np
from app.config import settings
from app.services.poisson import outcome_probs
from app.services.scoring import normalize_probs

class OutcomeModel:
    def __init__(self):
        self.bundle = joblib.load(Path(settings.model_path)) if Path(settings.model_path).exists() else None

    @property
    def version(self):
        return self.bundle.get("version","trained-v1") if self.bundle else "elo-fallback-v1"

    def ml_probs(self, f):
        if not self.bundle:
            x=np.clip(float(f.get("elo_diff",0))/400,-2,2)
            return normalize_probs(.33+.22*x,.34-.05*abs(x),.33-.22*x)
        cols=self.bundle["features"]
        X=np.array([[float(f.get(c,0.0)) for c in cols]])
        p=self.bundle["model"].predict_proba(X)[0]
        m=dict(zip(self.bundle["model"].classes_,map(float,p)))
        return normalize_probs(m.get("W",0),m.get("D",0),m.get("L",0))

    def predict(self, f):
        parts=[(self.ml_probs(f),settings.weight_model)]
        egf,ega=f.get("expected_goals_for"),f.get("expected_goals_against")
        if egf and ega:
            if f.get("is_home",0)>=.5:
                pp=outcome_probs(egf,ega)
            else:
                ph,pd,pa=outcome_probs(ega,egf); pp=(pa,pd,ph)
            parts.append((pp,settings.weight_poisson))
        if all(f.get(k) is not None for k in ("market_p_win","market_p_draw","market_p_loss")):
            parts.append((normalize_probs(f["market_p_win"],f["market_p_draw"],f["market_p_loss"]),settings.weight_market))
        sw=sum(w for _,w in parts)
        return normalize_probs(*[sum(p[i]*w for p,w in parts)/sw for i in range(3)])
