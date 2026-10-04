"""How much do scores in one game move together? (plans/xscore.md P9 X6; roadmap 10.6)

Research script. The correlation, by pair of positions and side, of how far each starter's score landed from the number the keeper (`keeper.py`) and
outfield (`outfield.py`) models gave before the game (walk-forward), over every start of the games export: the table `app/sorare/links.py` quotes.

    cd backend
    python reports/experiments/linked_scores.py data/raw/sorare_history.json   # a history file, for Sorare's gameweeks
"""

import json
import sys
from collections import defaultdict
from datetime import UTC, datetime
from itertools import combinations
from pathlib import Path

import numpy as np

sys.path.insert(0, ".")
from app.sorare import gamedata, keeper, outfield  # noqa: E402

joined, _, _ = gamedata.load_joined()
fixtures = json.loads(Path(sys.argv[1]).read_text("utf-8")).get("fixtures") or []
ks = keeper.starts_from_games(joined, fixtures)
os_ = outfield.starts_from_games(joined, fixtures)
resid = {}
for w in keeper.walk_forward(ks):
    resid[(w.player, w.date)] = ("GK", w.score - w.said.start)
for w in outfield.walk_forward(os_):
    resid[(w.player, w.date)] = (w.pos, w.score - w.said)
sd = defaultdict(list)
for pos, r in resid.values():
    sd[pos].append(r)
sd = {p: float(np.std(v)) for p, v in sd.items()}
print("residual sd", {p: round(v, 1) for p, v in sd.items()})
acc = defaultdict(lambda: [0.0, 0])
season = lambda d: 1 if d >= datetime(2026, 7, 1, tzinfo=UTC) else 0
for g in joined:
    d = datetime.fromisoformat(g["date"].replace("Z", "+00:00")).astimezone(UTC)
    rows = []
    for slug, p in g["players"].items():
        k = (slug, d)
        if k in resid and p["started"]:
            pos, r = resid[k]
            rows.append((pos, p["team"], r / sd[pos]))
    for (pa, ta, ra), (pb, tb, rb) in combinations(rows, 2):
        same = ta == tb
        a, b = sorted((pa, pb))
        key = (a, b, "same" if same else "opp", season(d))
        acc[key][0] += ra * rb
        acc[key][1] += 1
print("pair type (pos, pos, side) | pairs | correlation")
for key, (s, n) in sorted(acc.items()):
    if n >= 150:
        print(key, n, round(s / n, 3), "se", round(1 / np.sqrt(n), 3))
