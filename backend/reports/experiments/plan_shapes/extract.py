# ruff: noqa  -- a one-off replay kept as run, for the record
"""Every LaLiga appearance of Jan-Oct 2026 with each model's full forecast, fitted only on earlier games."""

import json
import os
import sys
from pathlib import Path

import numpy as np

WT = Path(__file__).resolve().parents[3]
RES = Path(os.environ["SCORE_RESEARCH_BACKEND"])  # the folder holding data/raw/score-foundation and formula-packages
sys.path[:0] = [str(WT), str(RES / "data/raw/formula-packages")]
from app.research import sofix_v1_release as rel  # noqa: E402
from app.sorare import outfield, sofix_v1  # noqa: E402

GAMES = WT / "data/raw/sorare_games.jsonl"
OUT = Path(sys.argv[1])

ctx = json.loads((RES / "data/raw/score-foundation/football.json").read_bytes())["context"]
games = [json.loads(x) for x in GAMES.read_bytes().splitlines() if x.strip()]
rows = rel.cases(games, ctx)

# the same walk as rel.cases, to know each case's game, side and player
ids = []
for g in sorted(games, key=lambda g: (g["date"], g["id"])):
    for player, r in g["players"].items():
        if (
            r.get("played") is True
            and type(r.get("started")) is bool
            and r.get("score") is not None
            and r.get("ver") == 7
            and r.get("pos") in sofix_v1.POSITIONS
        ):
            ids.append((g["id"], "H" if r["team"] == g["home"]["slug"] else "A", player))
assert len(ids) == len(rows)

start, end = rel.PHASES[-1]
test_idx = [i for i, r in enumerate(rows) if start <= r.when.date().isoformat() < end and rows[i].numbers is not None]
first = min(rows[i].lock for i in test_idx)
train = [r for r in rows if r.when + sofix_v1.DELAY < first]
print("train", len(train), "test", len(test_idx), flush=True)
model = rel.fit(train)
gks, field = rel.previous(train)

mass, meta, v0 = [], [], []
for i in test_idx:
    r = rows[i]
    hist = model._hist(model.trees[r.role], sofix_v1.features(r.pos, r.home, r.numbers, r.past))
    s = sofix_v1.from_distribution(hist, r.numbers.cs)
    o = None
    if r.role == "start":
        if r.pos == "GK" and gks:
            o = gks.predict(r.numbers)
        elif r.pos in field:
            d, m = outfield.own_record([p["score"] for p in r.past if p["started"]])
            o = field[r.pos].outcome(r.numbers, r.home, d, m)
    mass.append(hist.astype(np.float32))
    meta.append(
        (
            r.role == "start",
            sofix_v1.POSITIONS.index(r.pos),
            r.lock.timestamp(),
            r.score,
            r.decisive,
            s.outcome.start,
            s.point,
        )
    )
    v0.append((o.start, o.p_decisive, o.if_decisive, o.if_plain, o.sd_decisive, o.sd_plain) if o else (np.nan,) * 6)

np.savez_compressed(
    OUT,
    hist=np.array(mass),
    meta=np.array(meta, float),
    v0=np.array(v0, float),
    game=np.array([ids[i][0] for i in test_idx]),
    side=np.array([ids[i][1] for i in test_idx]),
    player=np.array([ids[i][2] for i in test_idx]),
)
print("saved", len(mass))
