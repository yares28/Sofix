# ruff: noqa  -- a one-off replay kept as run, for the record
"""Each score picture picks the lineup most likely to clear a target from the same pools; judged on the real scores."""

import sys
from pathlib import Path

import numpy as np
from scipy.stats import norm

S = Path(sys.argv[0]).parent
sys.path.insert(0, str(Path(__file__).resolve().parents[3]))
from types import SimpleNamespace  # noqa: E402

from app.sorare import keeper, links, planner, sofix_v1  # noqa: E402
from app.sorare.model import Forecast  # noqa: E402

POOLS, SEED = int(sys.argv[1]), int(sys.argv[2])
TARGETS = np.array([300, 340, 380, 420, 460])
DRAWS = 1500
MULT, CAPTAIN = 1.05, 0.5
SIZES = ((0, 3), (1, 9), (2, 9), (3, 9))
POS = ("GK", "DEF", "MID", "FWD")
X = np.arange(101)

d = np.load(S / "cases.npz")
ok = (d["meta"][:, 0] == 1) & ~np.isnan(d["v0"][:, 0])
meta, v0, hist = d["meta"][ok], d["v0"][ok], d["hist"][ok]
game, side, player = d["game"][ok], d["side"][ok], d["player"][ok]
pos, lock, y, v1 = meta[:, 1].astype(int), meta[:, 2], meta[:, 3], meta[:, 5]
p0, dec0, plain0, sd_d, sd_p = v0[:, 1], v0[:, 2], v0[:, 3], v0[:, 4], v0[:, 5]
v3 = np.where(p0 >= 0.75, dec0, plain0)
weeks = [w for w in np.unique(lock) if all((pos[lock == w] == p).sum() >= n for p, n in SIZES)]
print("weeks", len(weeks), flush=True)


def bell(mu, sd):
    c = norm.cdf((X + 0.5 - mu[:, None]) / sd)
    c[:, -1] = 1
    return c


def humps(i):
    a, b = bell(plain0[i], np.maximum(sd_p[i], 5)[:, None]), bell(dec0[i], np.maximum(sd_d[i], 5)[:, None])
    return np.maximum.accumulate((1 - p0[i, None]) * a + p0[i, None] * b, axis=1)


def own(i):
    return np.minimum(np.cumsum(hist[i].sum(1), axis=1), 1)


def shipped(i):
    out = []
    for j in i:
        prev = keeper.Outcome(0.0, p0[j], dec0[j], plain0[j], v0[j, 0], 0, 0, sd_d[j], sd_p[j])
        out.append(
            sofix_v1.week_cdf(
                [
                    SimpleNamespace(
                        mass=hist[j].sum(0).astype(float),
                        previous_outcome=prev,
                        sub=SimpleNamespace(mass=hist[j].sum(0).astype(float)),
                    )
                ],
                [(1.0, 0.0, 1.0)],
            )
        )
    return np.array(out)


MODELS = {
    "today (bell on v1)": lambda i: bell(v1[i], 17.6),
    "shipped planner": shipped,
}
rng = np.random.default_rng(SEED)
res = {m: {"said": [], "hit": [], "pts": []} for m in MODELS}
late = []
for k in range(POOLS):
    w = weeks[rng.integers(len(weeks))]
    late.append(w >= weeks[len(weeks) // 2])
    idx = []
    for p, n in SIZES:
        have = np.flatnonzero((lock == w) & (pos == p))
        idx += list(rng.choice(have, n, replace=False))
    idx = np.array(idx)
    R = links.matrix([POS[pos[i]] for i in idx], [((str(game[i]), str(side[i])),) for i in idx])
    z = rng.standard_normal((DRAWS, len(idx))) @ np.linalg.cholesky(R).T
    u = norm.cdf(z)
    truth = y[idx]
    for name, make in MODELS.items():
        cdf = make(idx)
        pmf = np.diff(cdf, axis=1, prepend=0)
        mean = pmf @ X
        q90 = (cdf < 0.9).sum(1)
        draws = np.stack([np.searchsorted(cdf[j], u[:, j]).clip(0, 100) for j in range(len(idx))], 1).astype(np.float32)
        if (
            name == "shipped planner"
        ):  # the real code path: Forecast -> planner._draw, the number on the card kept as the mean
            cards = [SimpleNamespace(player=str(j), positions=[POS[pos[i]]]) for j, i in enumerate(idx)]
            fc = {
                str(j): Forecast(
                    p_play=1.0,
                    mu=float(np.diff(cdf[j], prepend=0) @ X),
                    links=((str(game[i]), str(side[i])),),
                    score_cdf=cdf[j],
                    cdf_mu=float(np.diff(cdf[j], prepend=0) @ X),
                )
                for j, i in enumerate(idx)
            }
            draws = planner._draw(cards, fc, rng, DRAWS)[1].astype(np.float32)
            mean = np.diff(cdf, axis=1, prepend=0) @ X
        short = {}
        for p, _ in SIZES:
            at = np.flatnonzero(pos[idx] == p)
            short[p] = sorted(set(at[np.argsort(-mean[at])[:3]]) | set(at[np.argsort(-q90[at])[:3]]))
        extra = short[1] + short[2] + short[3]
        L = np.array(
            [
                (g, a, b, c, e)
                for g in short[0]
                for a in short[1]
                for b in short[2]
                for c in short[3]
                for e in extra
                if e not in (a, b, c)
            ],
            dtype=int,
        )
        cap = mean[L].argmax(1)
        rows = np.arange(len(L))
        hits = np.zeros((len(L), len(TARGETS)))
        for s in range(0, len(L), 1500):
            part, c = L[s : s + 1500], cap[s : s + 1500]
            t = MULT * draws[:, part].sum(2) + CAPTAIN * draws[:, part[np.arange(len(part)), c]]
            hits[s : s + 1500] = (t[..., None] >= TARGETS).mean(0)
        real = MULT * truth[L].sum(1) + CAPTAIN * truth[L[rows, cap]]
        best = hits.argmax(0)
        res[name]["said"].append(hits[best, range(len(TARGETS))])
        res[name]["hit"].append(real[best] >= TARGETS)
        res[name]["pts"].append(real[best])
    if (k + 1) % 50 == 0:
        print(k + 1, flush=True)

base = np.array(res["today (bell on v1)"]["hit"], float)
print(f"\npools {POOLS} seed {SEED}. For each target: said% -> really% (gain over today, +- 2 se)")
print(f"{'':22}" + "".join(f"{t:>25}" for t in TARGETS) + f"{'mean pts':>10}")
for name, r in res.items():
    said, hit = np.array(r["said"]), np.array(r["hit"], float)
    cells = ""
    for t in range(len(TARGETS)):
        diff = hit[:, t] - base[:, t]
        cells += f"{said[:, t].mean() * 100:6.1f}->{hit[:, t].mean() * 100:5.1f} ({diff.mean() * 100:+4.1f}+-{2 * diff.std() / np.sqrt(POOLS) * 100:3.1f})"
    print(f"{name:22}{cells}{np.mean(r['pts']):10.1f}")
late = np.array(late)
a, b = np.array(res["shipped planner"]["pts"]), np.array(res["today (bell on v1)"]["pts"])
for label, m in (("all", np.ones(len(late), bool)), ("first half of weeks", ~late), ("second half", late)):
    gap = (a - b)[m]
    hit = (np.array(res["shipped planner"]["hit"], float) - base)[m].mean(0) * 100
    print(
        f"{label:20} pools {m.sum():4} points {gap.mean(0)[0]:+.2f} .. targets 300-460 points gain {np.round(gap.mean(0), 1)} (2se {np.round(2 * gap.std(0) / np.sqrt(m.sum()), 1)}) hit gain {np.round(hit, 1)}"
    )
