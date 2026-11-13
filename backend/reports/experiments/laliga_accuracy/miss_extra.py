# ruff: noqa  -- a one-off diagnostic kept as run, for the record (plans/laliga-accuracy-evidence.md)
import numpy as np
import pandas as pd

S = "SCRATCH/"
df = pd.read_csv(S + "miss_cases.csv")
s = df[df.role == "start"].copy()
c = {"GK": -5, "DEF": -4, "MID": -2, "FWD": 0}
exp_c = s.pos.map(c) * s.xga + np.where(s.pos == "DEF", 10 * s.cs, 0)
act_c = s.conc_pts + s.cs_pts
fl = lambda p: np.where(s.level > 35, np.maximum(p, s.level), p)
h = lambda p: np.abs(np.clip(p, 0, 100) - s.score) <= 7 + 1e-9
s["a1"] = h(fl(s.pred + s.level - 35))
s["c1"] = h(s.pred + act_c - exp_c)
s["ac"] = h(fl(s.pred + s.level - 35 + act_c - exp_c))
t = s.groupby("pos").agg(
    n=("hit", "size"), base=("hit", "sum"), a1=("a1", "sum"), c1=("c1", "sum"), a1_c1=("ac", "sum")
)
dd = s[(s.pos == "DEF")]
t2 = dd.groupby("conc" if False else dd.ga.clip(upper=3)).agg(n=("hit", "size"), base=("hit", "sum"), c1=("c1", "sum"))
md = (
    "\n\n## Addendum: hindsight hits by position (starters)\n\n"
    + t.to_string()
    + "\n\nDEF by goals conceded (3=3+): baseline vs c1\n\n"
    + t2.to_string()
    + "\n"
)
# DEF pred by clean sheet
md += (
    "\nDEF mean model prediction when his side kept a clean sheet (60+ min) vs conceded: "
    + f"{dd[(dd.ga == 0) & (dd.mins >= 60)].pred.mean():.1f} vs {dd[dd.ga > 0].pred.mean():.1f}; mean real score {dd[(dd.ga == 0) & (dd.mins >= 60)].score.mean():.1f} vs {dd[dd.ga > 0].score.mean():.1f}; mean model cs chance {dd.cs.mean():.2f}, real clean-sheet share {(dd.ga == 0).mean():.2f}\n"
)
print(md)
open(S + "miss_report.md", "a", encoding="utf-8").write(md)
