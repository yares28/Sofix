"""Testing only: the odds of a decisive action per player and game, and when to predict his decisive score.

Usage: python v2_decisive.py <packages dir> <feat.npz> <research score-foundation dir>
The rule for each start: his score without a decisive (the ordinary-games model, test 27) unless his decisive odds pass a
threshold; then his score with one. Thresholds per position are chosen on Jul-Dec 2025 only and applied once to 2026.
"""

import sys

import numpy as np

sys.argv = [sys.argv[0], sys.argv[1], sys.argv[2], "none", sys.argv[3]]
sys.path.insert(0, __file__.rsplit("\\", 1)[0].rsplit("/", 1)[0])
import v2_models as m  # noqa: E402
from sklearn.ensemble import HistGradientBoostingClassifier  # noqa: E402
from sklearn.isotonic import IsotonicRegression  # noqa: E402

ALL, y, pos, level, names = m.ALL, m.y, m.pos, m.level, m.names
POS = m.POS
RESEARCH = np.load(sys.argv[4] + "/laliga_score_team_share_predictions_start.npz")["prediction"]
DEC = [
    i
    for i, n in enumerate(names)
    if n.startswith(("opp_gives", "opp_forces", "opp_neg", "own_dec", "line_now", "lines_now", "edge_now", "back_now"))
]
NO_NEW = np.delete(ALL, [23 + i for i in DEC], axis=1)


def split(start, end):
    te = m.started & m.ok & (m.day >= start) & (m.day < end)
    tr = m.started & m.ok & (m.settle < m.week[te].min())
    return tr, te


def odds(x, tr, te, target):
    """Boosted odds, then made honest on the last fifth of the fitting games (isotonic, never on the test games)."""
    idx = np.flatnonzero(tr)
    cut = idx[int(len(idx) * 0.8)]
    fit, cal = tr & (np.arange(len(tr)) < cut), tr & (np.arange(len(tr)) >= cut)
    clf = HistGradientBoostingClassifier(
        max_depth=3, learning_rate=0.04, max_iter=300, min_samples_leaf=80, l2_regularization=1.0, random_state=26
    ).fit(x[fit], target[fit])
    iso = IsotonicRegression(out_of_bounds="clip").fit(clf.predict_proba(x[cal])[:, 1], target[cal])
    clf.fit(x[tr], target[tr])
    return iso.predict(clf.predict_proba(x[te])[:, 1])


def parts(tr, te, x):
    pl, dc = tr & (level == 35), tr & (level >= 60)
    plain = m.point(m.forest_mass(x[pl], y[pl], x[te]))
    dec_mass = m.forest_mass(x[dc], y[dc], x[te], 5, 30, 120)
    return plain, m.point(dec_mass), odds(x, tr, te, level >= 60)


def report(name, pred, te, base):
    hit = np.abs(pred - y[te]) <= 7 + 1e-9
    weeks = np.unique(m.week[te])
    diff = np.array([(hit & (m.week[te] == w)).sum() - (base & (m.week[te] == w)).sum() for w in weeks])
    draws = np.random.default_rng(20261113).choice(diff, (2000, len(diff))).sum(1)
    by = " ".join(f"{POS[p]} {hit[pos[te] == p].sum()}" for p in range(4))
    print(
        f" {name:52s} {hit.sum():5d} {hit.mean() * 100:5.2f}%  vs research {hit.sum() - base.sum():+4d} [{np.percentile(draws, 2.5):+.0f},{np.percentile(draws, 97.5):+.0f}]  {by}",
        flush=True,
    )
    return hit


def honesty(p, truth):
    out = []
    for lo, hi in ((0, 0.1), (0.1, 0.2), (0.2, 0.3), (0.3, 0.4), (0.4, 0.5), (0.5, 0.6), (0.6, 1.01)):
        k = (p >= lo) & (p < hi)
        if k.sum():
            out.append(f"{lo:.1f}-{hi:.1f}: {k.sum()} said {p[k].mean():.2f} happened {truth[k].mean():.2f}")
    return out


tr25, te25 = split("2025-07-01", "2026-01-01")
tr26, te26 = split("2026-01-01", "2026-11-01")
for label, x in (("without the new inputs", NO_NEW), ("with opponent and tonight's eleven", ALL)):
    print(f"\n=== decisive odds {label}")
    for tag, tr, te in (("2025H2", tr25, te25), ("2026", tr26, te26)):
        p = odds(x, tr, te, level >= 60)
        truth = level[te] >= 60
        rank = np.argsort(np.argsort(p))
        auc = (rank[truth].mean() - (truth.sum() - 1) / 2) / (~truth).sum()
        print(
            f" {tag}: {te.sum()} starts, {truth.mean():.3f} had one, AUC {auc:.3f}, Brier {np.mean((p - truth) ** 2):.4f} (constant {truth.mean() * (1 - truth.mean()):.4f})"
        )
        for line in honesty(p, truth):
            print("   ", line)
        if tag == "2026":
            for q in range(4):
                k = pos[te] == q
                print(
                    f"    {POS[q]}: top 10% of his position's odds happened {truth[k][np.argsort(-p[k])[: k.sum() // 10]].mean():.2f}, max odds {p[k].max():.2f}"
                )

# the switch: predict the decisive score when the odds pass a threshold, threshold per position chosen on 2025H2
print("\n=== the switch (thresholds chosen on Jul-Dec 2025, applied to Jan-Oct 2026)")
plain25, dec25, p25 = parts(tr25, te25, ALL)
plain26, dec26, p26 = parts(tr26, te26, ALL)
grid = np.round(np.arange(0.20, 0.96, 0.02), 2)
chosen = []
for q in range(4):
    k = pos[te25] == q
    best = max(grid, key=lambda t: (np.abs(np.where(p25[k] >= t, dec25[k], plain25[k]) - y[te25][k]) <= 7 + 1e-9).sum())
    chosen.append(best)
    print(
        f" {POS[q]}: threshold {best:.2f}, switched in 2025H2: {(p25[k] >= best).sum()}, in 2026: {(p26[pos[te26] == q] >= best).sum()}"
    )
th26 = np.array(chosen)[pos[te26]]
base = np.abs(RESEARCH - y[te26]) <= 7 + 1e-9
print(f"\n research best (the bar) {base.sum()} ({base.mean() * 100:.2f}%)")
report("ordinary score only (test 27)", plain26, te26, base)
report("switch at chosen thresholds", np.where(p26 >= th26, dec26, plain26), te26, base)
for t in (0.4, 0.5, 0.6):
    report(f"switch at {t:.1f} for everyone", np.where(p26 >= t, dec26, plain26), te26, base)
# the honest best: compare the chance of landing within 7 of each number
win_plain = 1 - p26  # crude: an ordinary-game number lands only if no decisive happens
report("switch when odds beat the no-decisive chance", np.where(p26 > win_plain, dec26, plain26), te26, base)
switched = p26 >= th26
truth = level[te26] >= 60
print(
    f"\n switched starts 2026: {switched.sum()}, of which had a decisive: {truth[switched].sum()}, landed within 7: {(np.abs(dec26 - y[te26]) <= 7 + 1e-9)[switched].sum()}"
)
