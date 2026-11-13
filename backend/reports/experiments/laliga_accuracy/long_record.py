"""Does a longer player record help Sofix v1? Same trees, plus his all-earlier starts (settled 48 h before lock)."""

import json
import sys
from collections import defaultdict
from datetime import datetime
from pathlib import Path

import numpy as np

WT = Path("C:/Users/Yaya/.codex/worktrees/7cef/FixtureDiff/backend")
sys.path.insert(0, str(WT))
sys.path.insert(0, str(WT / "data/raw/formula-packages"))
from sklearn.ensemble import ExtraTreesRegressor  # noqa: E402

from app.research import sofix_v1_release as rel  # noqa: E402
from app.sorare import sofix_v1  # noqa: E402

GAMES = Path("C:/Users/Yaya/Desktop/PROJECTS/FixtureDiff/backend/data/raw/sorare_games.jsonl")
games = [json.loads(x) for x in GAMES.read_bytes().splitlines() if x.strip()]
ctx = json.loads((WT / "data/raw/score-foundation/football.json").read_bytes())["context"]
rows = rel.cases(games, ctx)

# every earlier v7 appearance per player, in the same order rel.cases walks them
hist: dict[str, list] = defaultdict(list)
extra = []
for game in sorted(games, key=lambda g: (g["date"], g["id"])):
    when = datetime.fromisoformat(game["date"].replace("Z", "+00:00"))
    lock = rel.cutoff_for(when)
    for player, row in game["players"].items():
        if (
            row.get("played") is not True
            or type(row.get("started")) is not bool
            or row.get("score") is None
            or row.get("ver") != 7
            or row.get("pos") not in sofix_v1.POSITIONS
        ):
            continue
        old = [h for h in hist[player] if h[0] + sofix_v1.DELAY < lock and h[1]]
        s = np.array([h[2] for h in old])
        plain = np.array([h[2] for h in old if h[3] == 35])
        extra.append(
            [
                len(s),
                np.median(s) if len(s) else -1,
                np.mean(s) if len(s) else -1,
                np.median(plain) if len(plain) else -1,
                np.std(plain) if len(plain) > 1 else -1,
                (s >= 60).mean() if len(s) else -1,
                np.median(s[-10:]) if len(s) else -1,
            ]
        )
        hist[player].append((when, row["started"], float(row["score"]), float(row.get("level") or 0)))
assert len(extra) == len(rows)


def run(phase, use_extra, depth=5, leaf=30, trees=36):
    start, end = rel.PHASES[phase]
    idx = {id(r): i for i, r in enumerate(rows)}
    first = min(r.lock for r in rows if start <= r.when.date().isoformat() < end)
    out = {}
    for role in ("start", "bench"):

        def X(group):
            return np.array(
                [
                    sofix_v1.features(r.pos, r.home, r.numbers, r.past) + (extra[idx[id(r)]] if use_extra else [])
                    for r in group
                ]
            )

        tr = [r for r in rows if r.when + sofix_v1.DELAY < first and r.role == role and r.numbers]
        te = [r for r in rows if start <= r.when.date().isoformat() < end and r.role == role and r.numbers]
        y = np.array([r.score for r in tr])
        f = ExtraTreesRegressor(
            n_estimators=trees, max_depth=depth, min_samples_leaf=leaf, random_state=26, n_jobs=4
        ).fit(X(tr), y)
        ybin = np.rint(y).astype(int)
        xt = X(te)
        mass = np.zeros((len(te), 101))
        ltr = f.apply(X(tr))
        lte = f.apply(xt)
        for t in range(trees):
            for leaf_id in np.unique(lte[:, t]):
                h = np.bincount(ybin[ltr[:, t] == leaf_id], minlength=101).astype(float)
                mass[lte[:, t] == leaf_id] += h / h.sum()
        win = np.array([np.convolve(np.pad(m, 7), np.ones(15), mode="valid") for m in mass])
        point = win.argmax(1)
        actual = np.array([r.score for r in te])
        out[role] = (int((abs(point - actual) <= 7 + 1e-9).sum()), len(te))
    return out


for phase in (2, 3):
    for name, kw in (
        ("v1", dict(use_extra=False)),
        ("v1+long record", dict(use_extra=True)),
        ("deeper", dict(use_extra=False, depth=8, leaf=20, trees=100)),
        ("deeper+long", dict(use_extra=True, depth=8, leaf=20, trees=100)),
    ):
        print(rel.PHASES[phase][0], name, run(phase, **kw), flush=True)
