# ruff: noqa  -- a one-off replay kept as run, for the record
"""Which picture of a starter's score predicts reality best? Lower CRPS / Brier is better."""

import sys
from pathlib import Path

import numpy as np
from scipy.stats import norm

S = Path(sys.argv[0]).parent
d = np.load(S / "cases.npz")
meta, v0, hist = d["meta"], d["v0"], d["hist"]
ok = (meta[:, 0] == 1) & ~np.isnan(v0[:, 0])
meta, v0, hist = meta[ok], v0[ok], hist[ok]
y = meta[:, 3]
v1, v2 = meta[:, 5], meta[:, 6]
p0, dec0, plain0, sd_d, sd_p = v0[:, 1], v0[:, 2], v0[:, 3], v0[:, 4], v0[:, 5]
v3 = np.where(p0 >= 0.75, dec0, plain0)
X = np.arange(101)
print(
    "starters",
    len(y),
    "| mean real",
    y.mean().round(1),
    "v0",
    v0[:, 0].mean().round(1),
    "v1",
    v1.mean().round(1),
    "v2",
    v2.mean().round(1),
    "v3",
    v3.mean().round(1),
    "| sd sd_plain",
    np.median(sd_p).round(1),
    "sd_dec",
    np.median(sd_d).round(1),
)


def gauss(mu, sd):
    sd = np.broadcast_to(sd, mu.shape)[:, None]
    c = norm.cdf((X + 0.5 - mu[:, None]) / np.maximum(sd, 1e-6))
    c[:, -1] = 1
    return c


def fix(c):
    return np.maximum.accumulate(np.clip(c, 0, 1), axis=1)


v1h = fix(np.cumsum(hist.sum(1), axis=1))
hump = fix((1 - p0[:, None]) * gauss(plain0, np.maximum(sd_p, 5)) + p0[:, None] * gauss(dec0, np.maximum(sd_d, 5)))
shift = np.rint(
    plain0
    - np.array(
        [
            X[np.searchsorted(c, 0.5)]
            for c in fix(np.cumsum(hist[:, 0] / np.maximum(hist[:, 0].sum(1, keepdims=True), 1e-9), axis=1))
        ]
    )
).astype(int)
models = {
    "today: bell around v1, sd 17.6": gauss(v1, 17.6),
    "bell around v0": gauss(v0[:, 0], 17.6),
    "bell around v2": gauss(v2, 17.6),
    "bell around v3 (naive swap)": gauss(v3, 17.6),
    "v1 full distribution": v1h,
    "v0 two humps": hump,
    "half v1 dist + half v0 humps": (v1h + hump) / 2,
}
lock = meta[:, 2]
mid = np.median(lock)
T = (30, 40, 50, 60, 70, 80)
print(f"{'model':34}{'CRPS':>7}{'1st':>7}{'2nd':>7}  mean said P(>=t) vs real, t=" + ",".join(map(str, T)))
real = [(y >= t).mean() for t in T]
print(" " * 55 + "real  " + " ".join(f"{r:5.3f}" for r in real))
for name, c in models.items():
    step = (X[None, :] >= np.rint(y)[:, None]).astype(float)
    crps = ((c - step) ** 2).sum(1)
    said = [1 - c[:, t - 1] for t in T]
    bri = np.mean([((s - (y >= t)) ** 2).mean() for s, t in zip(said, T)])
    print(
        f"{name:34}{crps.mean():7.3f}{crps[lock < mid].mean():7.3f}{crps[lock >= mid].mean():7.3f}  brier {bri:.4f}  "
        + " ".join(f"{s.mean():5.3f}" for s in said)
    )
np.savez(S / "cdfs.npz", ok=ok)
