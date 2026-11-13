"""Testing only: Sofix v2 candidates on the cached table. Usage: python v2_models.py <packages dir> <feat.npz> [round]"""

import sys

import numpy as np

sys.path.insert(0, sys.argv[1])
from sklearn.ensemble import ExtraTreesRegressor, HistGradientBoostingClassifier, RandomForestRegressor  # noqa: E402

D = np.load(sys.argv[2])
ROUND = sys.argv[3] if len(sys.argv) > 3 else "a"
V1, EX, names = D["v1"], D["extra"], list(D["names"])
y, pos, started, ok, week, settle, day, level = (
    D[k] for k in ("y", "pos", "started", "ok", "week", "settle", "day", "level")
)
ALL = np.hstack([V1, EX])
PHASES = {"2025H2": ("2025-07-01", "2026-01-01"), "2026": ("2026-01-01", "2026-11-01")}
POS = ("GK", "DEF", "MID", "FWD")


def cols(*drop):
    keep = [i for i, n in enumerate(names) if not any(n.startswith(d) or n.endswith(d) for d in drop)]
    return np.hstack([V1, EX[:, keep]])


def forest_mass(x_tr, t_tr, x_te, depth=7, leaf=20, n=120, kind=ExtraTreesRegressor, feats=1.0):
    f = kind(n_estimators=n, max_depth=depth, min_samples_leaf=leaf, random_state=26, n_jobs=4, max_features=feats).fit(
        x_tr, t_tr
    )
    bins = np.clip(np.rint(t_tr).astype(int), 0, 100)
    a, b = f.apply(x_tr), f.apply(x_te)
    mass = np.zeros((len(x_te), 101))
    for t in range(a.shape[1]):
        for leaf_id in np.unique(b[:, t]):
            h = np.bincount(bins[a[:, t] == leaf_id], minlength=101).astype(float)
            mass[b[:, t] == leaf_id] += h / h.sum()
    return mass / a.shape[1]


def boost_mass(x_tr, t_tr, x_te, width=3, depth=3, it=150, lr=0.05, leaf=80):
    cls = np.clip(t_tr, 0, 100).astype(int) // width
    m = HistGradientBoostingClassifier(
        max_depth=depth, max_iter=it, learning_rate=lr, min_samples_leaf=leaf, random_state=26, early_stopping=False
    ).fit(x_tr, cls)
    p = m.predict_proba(x_te)
    mass = np.zeros((len(x_te), 101 + width))
    for j, c in enumerate(m.classes_):
        for k in range(width):
            mass[:, c * width + k] += p[:, j] / width
    return mass[:, :101]


def point(mass):
    return np.array([np.convolve(np.pad(m, 7), np.ones(15), mode="valid") for m in mass]).argmax(1)


def run(role, variants):
    for label, (start, end) in PHASES.items():
        te = (started == (role == "start")) & ok & (day >= start) & (day < end)
        tr = (started == (role == "start")) & ok & (settle < week[te].min())
        plain = tr & (level == 35)
        weeks = np.unique(week[te])
        rng = np.random.default_rng(20261112)
        base = None
        print(f"\n{role} {label}: {te.sum()} cases, {tr.sum()} to fit", flush=True)
        for name, make in variants.items():
            hit = np.abs(point(make(tr, plain, te)) - y[te]) <= 7 + 1e-9
            base = hit if base is None else base
            diff = np.array([(hit & (week[te] == w)).sum() - (base & (week[te] == w)).sum() for w in weeks])
            draws = rng.choice(diff, (2000, len(diff))).sum(1)
            by = " ".join(f"{POS[p]} {hit[pos[te] == p].sum()}" for p in range(4))
            print(
                f" {name:44s} {hit.sum():5d} {hit.mean() * 100:5.2f}% {hit.sum() - base.sum():+4d} [{np.percentile(draws, 2.5):+.0f},{np.percentile(draws, 97.5):+.0f}] {by}",
                flush=True,
            )


OLD = cols(
    "90y", "plain_med5", "plain_q", "aa_med", "bench_", "line", "lines", "edge", "back", "own_", "opp_"
)  # round 2's inputs
v1 = lambda tr, pl, te: forest_mass(V1[tr], y[tr], V1[te], 5, 30, 36)  # noqa: E731

if ROUND == "a":  # which inputs
    run(
        "start",
        {
            "v1": v1,
            "plain model, round 2 inputs": lambda tr, pl, te: forest_mass(OLD[pl], y[pl], OLD[te]),
            "+ everything new": lambda tr, pl, te: forest_mass(ALL[pl], y[pl], ALL[te]),
            "+ last-year rates only": lambda tr, pl, te: forest_mass(
                (
                    x := cols(
                        "plain_med5", "plain_q", "aa_med", "bench_", "line", "lines", "edge", "back", "own_", "opp_"
                    )
                )[pl],
                y[pl],
                x[te],
            ),
            "+ role only": lambda tr, pl, te: forest_mass(
                (x := cols("90y", "plain_med5", "plain_q", "aa_med", "bench_", "own_", "opp_"))[pl], y[pl], x[te]
            ),
            "+ side and opponent style only": lambda tr, pl, te: forest_mass(
                (x := cols("90y", "plain_med5", "plain_q", "aa_med", "bench_", "line", "lines", "edge", "back"))[pl],
                y[pl],
                x[te],
            ),
            "+ more of his ordinary record only": lambda tr, pl, te: forest_mass(
                (x := cols("90y", "bench_", "line", "lines", "edge", "back", "own_", "opp_"))[pl], y[pl], x[te]
            ),
        },
    )
if ROUND == "b":  # which model
    X = ALL
    run(
        "start",
        {
            "v1": v1,
            "plain forest 120 x depth 7": lambda tr, pl, te: forest_mass(X[pl], y[pl], X[te]),
            "plain forest 300 x depth 10, leaf 15": lambda tr, pl, te: forest_mass(X[pl], y[pl], X[te], 10, 15, 300),
            "plain forest 300 x depth 6, leaf 40": lambda tr, pl, te: forest_mass(X[pl], y[pl], X[te], 6, 40, 300),
            "plain random forest, half the inputs": lambda tr, pl, te: forest_mass(
                X[pl], y[pl], X[te], 8, 20, 200, RandomForestRegressor, 0.5
            ),
            "plain boosted classes": lambda tr, pl, te: boost_mass(X[pl], y[pl], X[te]),
            "all-starts boosted classes": lambda tr, pl, te: boost_mass(X[tr], y[tr], X[te]),
            "plain forest + boosted, averaged": lambda tr, pl, te: (
                (forest_mass(X[pl], y[pl], X[te]) + boost_mass(X[pl], y[pl], X[te])) / 2
            ),
            "plain forest per position": lambda tr, pl, te: sum(
                np.where(
                    (pos[te] == p)[:, None], forest_mass(X[pl & (pos == p)], y[pl & (pos == p)], X[te], 6, 20, 120), 0
                )
                for p in range(4)
            ),
        },
    )
if ROUND == "c":  # substitutes
    X = ALL
    run(
        "bench",
        {
            "v1": v1,
            "all inputs, every game": lambda tr, pl, te: forest_mass(X[tr], y[tr], X[te]),
            "all inputs, ordinary games": lambda tr, pl, te: forest_mass(X[pl], y[pl], X[te]),
            "all inputs, ordinary, shallow": lambda tr, pl, te: forest_mass(X[pl], y[pl], X[te], 5, 30, 120),
            "ordinary boosted classes": lambda tr, pl, te: boost_mass(X[pl], y[pl], X[te], width=2),
        },
    )

if ROUND == "d":  # only what the live job has for every player: scores, started, minutes, decisive level
    safe = [
        i
        for i, n in enumerate(names)
        if n
        in (
            "n_starts",
            "n_bench",
            "mins",
            "dec",
            "dec10",
            "neg",
            "mins10",
            "score_med",
            "raw_med",
            "raw_avg",
            "raw_sd",
            "raw_med10",
            "raw_med5",
            "raw_q25",
            "raw_q75",
            "raw_year",
            "dec_year",
            "starts_year",
            "bench_med",
            "bench_avg",
            "bench_sd",
            "bench_mins",
            "bench_dec",
            "bench_med10",
        )
    ]
    X = np.hstack([V1, EX[:, safe]])
    run(
        "start",
        {
            "v1": v1,
            "plain model, every input": lambda tr, pl, te: forest_mass(ALL[pl], y[pl], ALL[te]),
            "plain model, live-safe inputs": lambda tr, pl, te: forest_mass(X[pl], y[pl], X[te]),
            "plain per position, live-safe": lambda tr, pl, te: sum(
                np.where(
                    (pos[te] == p)[:, None], forest_mass(X[pl & (pos == p)], y[pl & (pos == p)], X[te], 6, 20, 120), 0
                )
                for p in range(4)
            ),
            "every start, live-safe": lambda tr, pl, te: forest_mass(X[tr], y[tr], X[te]),
            "v1 inputs, plain model": lambda tr, pl, te: forest_mass(V1[pl], y[pl], V1[te]),
        },
    )
    run("bench", {"v1": v1, "live-safe, every game": lambda tr, pl, te: forest_mass(X[tr], y[tr], X[te], 5, 30, 120)})

if ROUND == "e":  # on top of the research's own input tables (argument 4: their folder; same row order, checked)
    from pathlib import Path

    R = {
        p: np.nan_to_num(np.load(Path(sys.argv[4]) / f"{p}.npz", allow_pickle=True)["x"].astype(np.float32), nan=-1.0)
        for p in (
            "stats",
            "player_context_features",
            "matchup_features",
            "sequence_features",
            "europe_routine_features",
            "spatial_context_features",
        )
    }
    BIG = np.hstack([ALL, *R.values()])
    MID_ = np.hstack([ALL, R["stats"], R["matchup_features"], R["sequence_features"]])
    run(
        "start",
        {
            "v1": v1,
            "plain, my inputs": lambda tr, pl, te: forest_mass(ALL[pl], y[pl], ALL[te]),
            "plain, + research stats/matchups/sequence": lambda tr, pl, te: forest_mass(
                MID_[pl], y[pl], MID_[te], 8, 20, 300, ExtraTreesRegressor, 0.3
            ),
            "plain, + all six research tables": lambda tr, pl, te: forest_mass(
                BIG[pl], y[pl], BIG[te], 8, 20, 300, ExtraTreesRegressor, 0.3
            ),
            "plain random forest, all six": lambda tr, pl, te: forest_mass(
                BIG[pl], y[pl], BIG[te], 9, 20, 300, RandomForestRegressor, 0.2
            ),
            "every start, all six": lambda tr, pl, te: forest_mass(
                BIG[tr], y[tr], BIG[te], 8, 20, 300, ExtraTreesRegressor, 0.3
            ),
        },
    )
    run(
        "bench",
        {
            "v1": v1,
            "all six, every game": lambda tr, pl, te: forest_mass(
                BIG[tr], y[tr], BIG[te], 7, 20, 300, ExtraTreesRegressor, 0.3
            ),
            "all six, ordinary games": lambda tr, pl, te: forest_mass(
                BIG[pl], y[pl], BIG[te], 7, 20, 300, ExtraTreesRegressor, 0.3
            ),
        },
    )
