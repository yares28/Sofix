# ruff: noqa  -- a one-off diagnostic kept as run, for the record (plans/laliga-accuracy-evidence.md)
import collections
import glob
import json

import numpy as np

B = "C:/Users/Yaya/Desktop/PROJECTS/FixtureDiff/frontend/.blocks/"
live = collections.defaultdict(dict)
for f in sorted(glob.glob(B + "score_record%3A*.json")):
    d = json.load(open(f, encoding="utf-8"))["payload"]
    for slug, pl in d["players"].items():
        for g in pl["games"]:
            if g["competition"] == "laliga-es" and g.get("sofix") is not None:
                live[pl["pos"]][(g["id"], slug)] = (g["sofix"], g.get("sofixOn"), g.get("scoreSource"))
G = "C:/Users/Yaya/Desktop/PROJECTS/FixtureDiff/backend/data/raw/sorare_games.jsonl"
games = [json.loads(l) for l in open(G, encoding="utf-8") if l.strip()]
S = collections.defaultdict(list)
Bn = collections.defaultdict(list)
S26 = collections.defaultdict(list)
for g in games:
    for p, r in g["players"].items():
        if r["played"] is True and r["score"] is not None:
            (S if r["started"] else Bn)[r["pos"]].append(r["score"])
            if r["started"] and g["date"] >= "2026-07-01":
                S26[r["pos"]].append(r["score"])
q = lambda x: " ".join(f"{np.quantile(x, t):.1f}" for t in (0.1, 0.25, 0.5, 0.75, 0.9))
print(
    "pos | LIVE old-formula start-score (n, mean, p10 p25 p50 p75 p90) | TRAIN actual starter score | TRAIN actual 2026/27 starters | live sofixOn (sub) mean | TRAIN actual subs mean"
)
for pos in ("GK", "DEF", "MID", "FWD"):
    L = np.array([v[0] for v in live[pos].values()])
    On = np.array([v[1] for v in live[pos].values() if v[1] is not None])
    print(
        pos,
        len(L),
        f"{L.mean():.1f}",
        q(L),
        "|",
        len(S[pos]),
        f"{np.mean(S[pos]):.1f}",
        q(S[pos]),
        "|",
        f"{np.mean(S26[pos]):.1f}",
        "|",
        f"{On.mean():.1f}" if len(On) else "-",
        "|",
        f"{np.mean(Bn[pos]):.1f}",
    )
print(collections.Counter(v[2] for p in live.values() for v in p.values()))
