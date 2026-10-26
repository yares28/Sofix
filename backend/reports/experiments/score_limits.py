"""How close can one number get to a Sorare score, and does the opponent move each stat? (plans/score-engine.md §2)

Research script, read only, on the local games export (`app.jobs.export_games`). Prints:

1. whether every start's score is its decisive level plus its all-around points (with the floor from level 1 up);
2. the typical miss and the share within 7 points of numbers that see the future: his whole-season average or median, and
   numbers that know one of the two parts exactly, per position;
3. how much a player's all-around points move from game to game, and how much of that follows the minutes and the result;
4. the stats that carry the all-around points' movement, per position;
5. what each club gives an opposing position in three stats, against those players' own usual rates (raw, not shrunk).

    cd backend
    python reports/experiments/score_limits.py [data/raw/sorare_games.jsonl]
"""

import json
import sys
from collections import defaultdict
from pathlib import Path

import numpy as np

POSITIONS = ("GK", "DEF", "MID", "FWD")
path = Path(sys.argv[1]) if len(sys.argv) > 1 else Path("data/raw/sorare_games.jsonl")
games = [json.loads(line) for line in path.read_text("utf-8").splitlines() if line.strip()]

starts = []
for g in games:
    for slug, r in g["players"].items():
        if r.get("started") and r["pos"] in POSITIONS and r.get("score") is not None:
            home = r["team"] == g["home"]["slug"]
            starts.append(
                {
                    "p": slug,
                    "pos": r["pos"],
                    "s": float(r["score"]),
                    "lv": float(r.get("level") or 0),
                    "aa": float(r.get("aa") or 0),
                    "mins": r.get("mins") or 0,
                    "against": g["awayGoals"] if home else g["homeGoals"],
                    "for": g["homeGoals"] if home else g["awayGoals"],
                    "stats": r.get("stats") or {},
                }
            )


def sorare(level: float, aa: float) -> float:
    return min(100.0, max(level if level >= 60 else 0.0, level + aa))


rebuilt = sum(abs(sorare(r["lv"], r["aa"]) - r["s"]) <= 0.15 for r in starts)
print(f"1. score = level + all-around (floor from level 1 up): {rebuilt} of {len(starts)} starts")

by = defaultdict(list)
for r in starts:
    by[(r["pos"], r["p"])].append(r)
mean = {k: np.mean([x["s"] for x in v]) for k, v in by.items()}
median = {k: np.median([x["s"] for x in v]) for k, v in by.items()}
mean_aa = {k: np.mean([x["aa"] for x in v]) for k, v in by.items()}
mean_lv = {k: np.mean([x["lv"] for x in v]) for k, v in by.items()}


def line(name, said) -> None:
    cells = []
    for pos in POSITIONS:
        miss = np.array([said(r) - r["s"] for r in starts if r["pos"] == pos])
        cells.append(f"{pos} {np.mean(np.abs(miss)):.1f} / {np.mean(np.abs(miss) <= 7):.0%}")
    print(f"   {name:56s} " + " | ".join(cells))


print("2. typical miss / within ±7, per position:")
line("A his whole-season average, seen in advance", lambda r: mean[(r["pos"], r["p"])])
line("B his whole-season median, seen in advance", lambda r: median[(r["pos"], r["p"])])
line("C knows the level, his average all-around", lambda r: sorare(r["lv"], mean_aa[(r["pos"], r["p"])]))
line("D knows the all-around, his average level", lambda r: min(100.0, mean_lv[(r["pos"], r["p"])] + r["aa"]))
line("E knows the all-around, no decisive action (35)", lambda r: min(100.0, 35 + r["aa"]))

print(
    "3. a regular's all-around points from game to game (15+ starts): SD, and the share that follows minutes and result"
)
for pos in POSITIONS:
    regulars = [v for k, v in by.items() if k[0] == pos and len(v) >= 15]
    x, y = [], []
    for v in regulars:
        centre = [np.mean([g[c] for g in v]) for c in ("mins", "against", "for", "aa")]
        for g in v:
            x.append([g["mins"] - centre[0], g["against"] - centre[1], g["for"] - centre[2]])
            y.append(g["aa"] - centre[3])
    xa, ya = np.array(x), np.array(y)
    beta, *_ = np.linalg.lstsq(xa, ya, rcond=None)
    share = 1 - np.var(ya - xa @ beta) / np.var(ya)
    sd = np.median([np.std([g["aa"] for g in v]) for v in regulars])
    print(
        f"   {pos}: {len(regulars)} players, SD {sd:.1f}, {share:.0%} follows the game "
        f"(a goal against {beta[1]:+.1f}, a goal for {beta[2]:+.1f}, 10 minutes {beta[0] * 10:+.1f})"
    )

print("4. stats carrying the all-around movement (share of its variance):")
for pos in POSITIONS:
    mine = [r for r in starts if r["pos"] == pos]
    names = sorted({n for r in mine for n in r["stats"]})
    points = np.array([[r["stats"].get(n, [0, 0])[1] for n in names] for r in mine])
    total = points.sum(1)
    shares = sorted(((np.cov(points[:, i], total)[0, 1] / np.var(total), n) for i, n in enumerate(names)), reverse=True)
    print(f"   {pos}: " + ", ".join(f"{n} {s:.0%}" for s, n in shares[:6]))

own: dict[tuple[str, str], list[float]] = defaultdict(lambda: [0.0, 0.0])
seen = []
for g in games:
    for side, other in (("home", "away"), ("away", "home")):
        for slug, r in g["players"].items():
            if r.get("played") and r.get("mins") and r["team"] == g[side]["slug"]:
                seen.append((g[other]["name"], r["pos"], slug, r["mins"], r.get("stats") or {}))
                for n, (count, _) in (r.get("stats") or {}).items():
                    own[(slug, n)][0] += count
                for n in ("won_tackle", "ontarget_scoring_att", "saves"):
                    own[(slug, n)][1] += r["mins"]

print("5. what each club gives the opposing position, against those players' own rates (60+ minutes, raw):")
for stat, pos in (("won_tackle", "MID"), ("ontarget_scoring_att", "FWD"), ("saves", "GK")):
    got: dict[str, list[float]] = defaultdict(lambda: [0.0, 0.0])
    for club, p, slug, mins, stats in seen:
        count, minutes = own[(slug, stat)]
        if p == pos and mins >= 60 and minutes >= 600:
            got[club][0] += stats.get(stat, [0, 0])[0]
            got[club][1] += mins * count / minutes
    ranked = sorted(((v[0] / v[1] - 1, k) for k, v in got.items() if v[1] > 20), reverse=True)
    print(f"   {stat} by {pos}: most " + ", ".join(f"{k} {x:+.0%}" for x, k in ranked[:3]))
    print(f"   {' ' * len(stat)}        least " + ", ".join(f"{k} {x:+.0%}" for x, k in ranked[-3:]))
