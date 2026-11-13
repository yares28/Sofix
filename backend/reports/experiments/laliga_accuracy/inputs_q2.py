# ruff: noqa  -- a one-off diagnostic kept as run, for the record (plans/laliga-accuracy-evidence.md)
import json

import numpy as np

G = "C:/Users/Yaya/Desktop/PROJECTS/FixtureDiff/backend/data/raw/sorare_games.jsonl"
C = "C:/Users/Yaya/.codex/worktrees/7cef/FixtureDiff/backend/data/raw/score-foundation/football.json"
games = [json.loads(l) for l in open(G, encoding="utf-8") if l.strip()]
ctx = json.load(open(C))["context"]
P0 = [
    ("2023 H2", "2023-07-01", "2024-01-01"),
    ("2024 H1", "2024-01-01", "2024-07-01"),
    ("2024/25", "2024-07-01", "2025-07-01"),
    ("2025 H2", "2025-07-01", "2026-01-01"),
    ("2026", "2026-01-01", "2026-11-01"),
    ("2026 Jan-Jun", "2026-01-01", "2026-07-01"),
    ("2026 Jul-Oct", "2026-07-01", "2026-11-01"),
]
P = P0
rows = []  # period, cs, xgf, xga, gf, ga, home
for g in games:
    c = ctx[g["id"]]
    d = g["date"][:10]
    for side in ("h", "a"):
        o, t = ("h", "a") if side == "h" else ("a", "h")
        gf = g["homeGoals"] if side == "h" else g["awayGoals"]
        ga = g["awayGoals"] if side == "h" else g["homeGoals"]
        rows.append((d, c["cs_" + o], c["lam_" + o], c["lam_" + t], gf, ga, side == "h"))


def per(a, b):
    return [r for r in rows if a <= r[0] < b]


out = []


def rep(name, R):
    R = np.array([(r[1], r[2], r[3], r[4], r[5], r[6]) for r in R], float)
    cs, xgf, xga, gf, ga, h = R.T
    y = (ga == 0).astype(float)
    n = len(y)
    base = y.mean()
    brier = ((cs - y) ** 2).mean()
    bb = base * (1 - base)
    # also brier vs base from all-time? use period base (hindsight) and fixed global
    line = f"| {name} | {n // 2} | {cs.mean():.3f} | {y.mean():.3f} | {brier:.4f} | {bb:.4f} | {1 - brier / bb:+.3f} | {xgf.mean():.3f} | {gf.mean():.3f} | {np.corrcoef(xgf, gf)[0, 1]:.3f} | {xga.mean():.3f} | {ga.mean():.3f} | {np.corrcoef(xga, ga)[0, 1]:.3f} | {np.corrcoef(cs, y)[0, 1]:.3f} |"
    out.append(line)
    # slope of logistic? simple: regress y on cs
    A = np.vstack([cs, np.ones(n)]).T
    sl, ic = np.linalg.lstsq(A, y, rcond=None)[0]
    return sl, ic


out.append(
    "| period | games | mean cs said | cs rate happened | Brier cs | Brier base rate | skill (1-B/Bbase) | mean xGF | goals for | corr xGF-goals | mean xGA | goals against | corr xGA-goals | corr cs-CS |"
)
out.append("|---|---|---|---|---|---|---|---|---|---|---|---|---|---|")
slopes = {}
for n, a, b in P:
    slopes[n] = rep(n, per(a, b))
rep("all", rows)
print("\n".join(out))
print("OLS y~cs slope,intercept:", {k: (round(v[0], 2), round(v[1], 3)) for k, v in slopes.items()})
# bands
bands = [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 1.01]
print()
for n, a, b in P + [("all", "0", "9")]:
    R = np.array([(r[1], r[5]) for r in per(a, b)], float)
    cs = R[:, 0]
    y = R[:, 1] == 0
    cells = []
    for lo, hi in zip(bands[:-1], bands[1:]):
        m = (cs >= lo) & (cs < hi)
        cells.append(
            f"{lo:.1f}-{min(hi, 1):.1f}: n={m.sum()}, said {cs[m].mean():.3f}, happened {y[m].mean():.3f}"
            if m.sum()
            else f"{lo:.1f}: n=0"
        )
    print(n, "\n  " + "\n  ".join(cells))
# xG calibration bands for goals for
print()
for n, a, b in P:
    R = np.array([(r[2], r[4]) for r in per(a, b)], float)
    xs = R[:, 0]
    g = R[:, 1]
    qs = np.quantile(xs, [0, 0.25, 0.5, 0.75, 1])
    cells = []
    for lo, hi in zip(qs[:-1], qs[1:]):
        m = (xs >= lo) & (xs <= hi) if hi == qs[-1] else (xs >= lo) & (xs < hi)
        cells.append(f"xGF {xs[m].mean():.2f} -> goals {g[m].mean():.2f} (n={m.sum()})")
    print(n, "; ".join(cells))
# home/away split
print()
for n, a, b in P:
    for hh in (True, False):
        R = [r for r in per(a, b) if r[6] == hh]
        print(
            n,
            "home" if hh else "away",
            f"xGF {np.mean([r[2] for r in R]):.2f} goals {np.mean([r[4] for r in R]):.2f} cs said {np.mean([r[1] for r in R]):.3f} happened {np.mean([r[5] == 0 for r in R]):.3f}",
        )
# std of cs and xg per period
print()
for n, a, b in P:
    R = per(a, b)
    print(
        n,
        "sd cs",
        round(np.std([r[1] for r in R]), 3),
        "sd xgf",
        round(np.std([r[2] for r in R]), 3),
        "sd xga",
        round(np.std([r[3] for r in R]), 3),
    )
