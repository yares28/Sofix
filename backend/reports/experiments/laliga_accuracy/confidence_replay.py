# ruff: noqa  -- a one-off diagnostic kept as run, for the record (plans/laliga-accuracy-evidence.md)
"""Confidence tiers for Sofix v1: replay Jan-Oct 2026 from earlier fits, keep each forecast's mass inside its own window."""

import json
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

ctx = json.loads((WT / "data/raw/score-foundation/football.json").read_bytes())["context"]
rows = rel.cases([json.loads(x) for x in GAMES.read_bytes().splitlines() if x.strip()], ctx)
start, end = rel.PHASES[-1]
first = min(r.lock for r in rows if start <= r.when.date().isoformat() < end)
train = [r for r in rows if r.when + sofix_v1.DELAY < first]
test = [r for r in rows if start <= r.when.date().isoformat() < end]
model = rel.fit(train)
out = []
for r in test:
    if r.numbers is None:
        continue
    row = sofix_v1.features(r.pos, r.home, r.numbers, r.past)
    hist = np.zeros(202)
    for tree in model.trees[r.role]:
        i = 0
        while len(tree[i]) == 4:
            f, t, a, b = tree[i]
            i = a if row[f] <= t else b
        bins, counts = tree[i]
        w = np.asarray(counts, float)
        hist[bins] += w / w.sum()
    hist = hist.reshape(2, 101) / len(model.trees[r.role])
    s = sofix_v1.from_distribution(hist, r.numbers.cs)
    mass = hist.sum(0)
    lo, hi = int(max(0, s.point - 7)), int(min(100, s.point + 7))
    out.append(
        [
            r.role == "start",
            ["GK", "DEF", "MID", "FWD"].index(r.pos),
            s.point,
            mass[lo : hi + 1].sum(),
            float(hist[1].sum()),
            r.score,
            len(r.past),
            r.when.timestamp(),
        ]
    )
np.save(OUT, np.array(out))
print(len(test), len(out))
