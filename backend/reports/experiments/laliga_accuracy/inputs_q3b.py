# ruff: noqa  -- a one-off diagnostic kept as run, for the record (plans/laliga-accuracy-evidence.md)
import json

import numpy as np

B = "C:/Users/Yaya/Desktop/PROJECTS/FixtureDiff/frontend/.blocks/"
A, Bb = -0.15420588119799478, 0.9321588119702582


def raw(p):
    p = min(max(p, 1e-4), 1 - 1e-4)
    return 1 / (1 + np.exp(-((np.log(p / (1 - p)) - A) / Bb)))


d = json.load(open(B + "grid.json", encoding="utf-8"))
p = d["payload"]["data"]
print("grid updatedAt", d["updatedAt"], p["model_version"])
rows = []
for t in p["teams"]:
    for row in t["cells"]:
        for c in row:
            if c.get("prediction") and c["status"] != "finished":
                pr = c["prediction"]
                rows.append((c["kickoff_utc"], c["venue"], pr["clean_sheet"], pr["xg_for"], pr["xg_against"]))
print(len(rows), min(r[0] for r in rows), max(r[0] for r in rows))


def q(x):
    return " ".join(f"{np.quantile(x, t):.3f}" for t in (0, 0.1, 0.25, 0.5, 0.75, 0.9, 1))


def show(name, R):
    X = np.array([(raw(r[2]), r[2], r[3], r[4]) for r in R])
    print(f"\n{name} n={len(X)}")
    for i, nm in enumerate(("raw cs (inverted)", "shown cs", "xgf", "xga")):
        print(f"  {nm}: {q(X[:, i])} | mean {X[:, i].mean():.3f} sd {X[:, i].std():.3f}")


show("LIVE grid, all scheduled LaLiga sides", rows)
show("LIVE grid, next 3 weeks (kickoff<2026-12-05)", [r for r in rows if r[0] < "2026-12-05"])
show("LIVE grid home", [r for r in rows if r[1] == "H"])
show("LIVE grid away", [r for r in rows if r[1] == "A"])
G = "C:/Users/Yaya/Desktop/PROJECTS/FixtureDiff/backend/data/raw/sorare_games.jsonl"
C = "C:/Users/Yaya/.codex/worktrees/7cef/FixtureDiff/backend/data/raw/score-foundation/football.json"
games = [json.loads(l) for l in open(G, encoding="utf-8") if l.strip()]
ctx = json.load(open(C))["context"]
T = []
for g in games:
    c = ctx[g["id"]]
    T.append((g["date"][:10], "H", None, c["lam_h"], c["lam_a"], c["cs_h"]))
    T.append((g["date"][:10], "A", None, c["lam_a"], c["lam_h"], c["cs_a"]))


def tshow(name, R):
    X = np.array([(r[5], r[3], r[4]) for r in R])
    print(f"\n{name} n={len(X)}")
    for i, nm in enumerate(("raw cs", "xgf", "xga")):
        print(f"  {nm}: {q(X[:, i])} | mean {X[:, i].mean():.3f} sd {X[:, i].std():.3f}")


tshow("TRAIN all", T)
tshow("TRAIN 2025/26", [r for r in T if "2025-07-01" <= r[0] < "2026-07-01"])
tshow("TRAIN 2026/27 so far", [r for r in T if r[0] >= "2026-07-01"])
tshow("TRAIN home", [r for r in T if r[1] == "H"])
tshow("TRAIN away", [r for r in T if r[1] == "A"])
# also: training 'before' lock minus game date gap (how stale data)
import datetime

gaps = []
for g in games:
    b = datetime.datetime.fromisoformat(ctx[g["id"]]["before"])
    w = datetime.datetime.fromisoformat(g["date"].replace("Z", "+00:00"))
    gaps.append((w - b).total_seconds() / 86400)
print(
    "\ntrain lock->game gap days: mean %.2f quantiles %s"
    % (np.mean(gaps), np.quantile(gaps, [0, 0.25, 0.5, 0.75, 1]).round(2))
)
