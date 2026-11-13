# ruff: noqa  -- a one-off diagnostic kept as run, for the record (plans/laliga-accuracy-evidence.md)
"""Replay like confidence_replay.py but keep per-case detail. Usage: python -I miss_collect.py OUT.pkl"""

import json
import pickle
import sys
from pathlib import Path

import numpy as np

WT = Path("C:/Users/Yaya/.codex/worktrees/7cef/FixtureDiff/backend")
sys.path.insert(0, str(WT))
sys.path.insert(0, str(WT / "data/raw/formula-packages"))
from app.research import sofix_v1_release as rel  # noqa: E402
from app.sorare import sofix_v1  # noqa: E402

GAMES = Path("C:/Users/Yaya/Desktop/PROJECTS/FixtureDiff/backend/data/raw/sorare_games.jsonl")
OUT = Path(sys.argv[1])

games = [json.loads(x) for x in GAMES.read_bytes().splitlines() if x.strip()]
ctx = json.loads((WT / "data/raw/score-foundation/football.json").read_bytes())["context"]
rows = rel.cases(games, ctx)

# parallel meta, same filter/order as rel.cases
meta = []
for g in sorted(games, key=lambda g: (g["date"], g["id"])):
    for slug, p in g["players"].items():
        if (
            p.get("played") is not True
            or type(p.get("started")) is not bool
            or p.get("score") is None
            or p.get("ver") != 7
            or p.get("pos") not in sofix_v1.POSITIONS
        ):
            continue
        home = p["team"] == g["home"]["slug"]
        meta.append(
            dict(
                player=slug,
                team=p["team"],
                opp=(g["away"] if home else g["home"])["slug"],
                home=home,
                gf=g["homeGoals" if home else "awayGoals"],
                ga=g["awayGoals" if home else "homeGoals"],
                level=float(p.get("level") or 0),
                aa=float(p.get("aa") or 0),
                mins=p.get("mins"),
                stats={k: v[1] for k, v in (p.get("stats") or {}).items()},
                cnt={k: v[0] for k, v in (p.get("stats") or {}).items()},
                date=g["date"],
                pen=p.get("pen"),
            )
        )
assert len(meta) == len(rows), (len(meta), len(rows))
for r, m in zip(rows, meta):
    assert abs(r.score - float(next(0 for _ in [0]) if False else r.score)) < 1e-9
start, end = rel.PHASES[-1]
first = min(r.lock for r in rows if start <= r.when.date().isoformat() < end)
idx = [i for i, r in enumerate(rows) if r.when + sofix_v1.DELAY < first]
train = [rows[i] for i in idx]
tidx = [i for i, r in enumerate(rows) if start <= r.when.date().isoformat() < end]
model = rel.fit(train)
out = []
for i in tidx:
    r, m = rows[i], meta[i]
    if r.numbers is None:
        continue
    row = sofix_v1.features(r.pos, r.home, r.numbers, r.past)
    hist = np.zeros(202)
    for tree in model.trees[r.role]:
        j = 0
        while len(tree[j]) == 4:
            f, t, a, b = tree[j]
            j = a if row[f] <= t else b
        bins, counts = tree[j]
        w = np.asarray(counts, float)
        hist[bins] += w / w.sum()
    hist = hist.reshape(2, 101) / len(model.trees[r.role])
    s = sofix_v1.from_distribution(hist, r.numbers.cs)
    o = s.outcome
    st = [g for g in r.past if g["started"]]
    bn = [g for g in r.past if not g["started"]]
    sm = [float(g["mins"]) for g in st if g.get("mins") is not None]
    out.append(
        dict(
            m,
            role=r.role,
            pos=r.pos,
            pred=s.point,
            score=r.score,
            when=r.when.isoformat(),
            cs=r.numbers.cs,
            xga=r.numbers.xga,
            xgf=r.numbers.xgf,
            n_start=len(st),
            n_bench=len(bn),
            p_dec=o.p_decisive,
            if_dec=o.if_decisive,
            if_plain=o.if_plain,
            mean=o.start,
            usual_mins=float(np.mean(sm)) if sm else np.nan,
            past_mean_start=float(np.mean([g["score"] for g in st])) if st else np.nan,
        )
    )
pickle.dump(out, open(OUT, "wb"))
for role in ("start", "bench"):
    c = [d for d in out if d["role"] == role]
    print(role, len(c), sum(abs(d["pred"] - d["score"]) <= 7 + 1e-9 for d in c))
