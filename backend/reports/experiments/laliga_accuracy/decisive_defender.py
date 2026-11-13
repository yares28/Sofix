"""Testing only: can a decisive-chance model and a scoreline model for defenders lift Sofix v1's starters within 7?

Every input is known before lock: the football model's numbers and the player's earlier games settled 48 h before it.
Usage: python decisive_defender.py <worktree backend> <games.jsonl> <out.npz>
"""

import json
import sys
from collections import defaultdict
from datetime import datetime
from pathlib import Path

import numpy as np

WT, GAMES, OUT = Path(sys.argv[1]), Path(sys.argv[2]), Path(sys.argv[3])
sys.path.insert(0, str(WT))
sys.path.insert(0, str(WT / "data/raw/formula-packages"))
from scipy.stats import poisson  # noqa: E402
from sklearn.ensemble import ExtraTreesRegressor, HistGradientBoostingClassifier  # noqa: E402
from sklearn.linear_model import LogisticRegression  # noqa: E402

from app.research import sofix_v1_release as rel  # noqa: E402
from app.sorare import sofix_v1  # noqa: E402

POS = sofix_v1.POSITIONS
RATES = (
    "goals",
    "goal_assist",
    "ontarget_scoring_att",
    "big_chance_created",
    "big_chance_missed",
    "pen_area_entries",
    "adjusted_total_att_assist",
    "won_tackle",
    "interception_won",
    "duel_won",
    "duel_lost",
    "accurate_pass",
    "effective_clearance",
    "poss_won",
    "poss_lost_ctrl",
    "fouls",
    "won_contest",
    "saves",
)
CONCEDED = {"GK": -5.0, "DEF": -4.0, "MID": -2.0, "FWD": 0.0}

games = sorted(
    (json.loads(x) for x in GAMES.read_bytes().splitlines() if x.strip()), key=lambda g: (g["date"], g["id"])
)
ctx = json.loads((WT / "data/raw/score-foundation/football.json").read_bytes())["context"]
rows = rel.cases(games, ctx)


def stat(row, name, i=0):
    return float((row.get("stats") or {}).get(name, (0.0, 0.0))[i])


def result_points(row, pos, conceded):
    """Points his score got from his side's result: the clean sheet and the goals let in."""
    return stat(row, "clean_sheet_60", 1) + stat(row, "goals_conceded", 1) if pos != "FWD" else 0.0


hist: dict[str, list] = defaultdict(list)
versus: dict[tuple[str, str], list] = defaultdict(
    list
)  # what starters of a position did against a club, against their own usual
team_goals: dict[tuple[str, str], int] = {}
extra, meta = [], []
for game in games:
    when = datetime.fromisoformat(game["date"].replace("Z", "+00:00"))
    lock = rel.cutoff_for(when)
    for player, row in game["players"].items():
        if (
            row.get("played") is not True
            or type(row.get("started")) is not bool
            or row.get("score") is None
            or row.get("ver") != 7
            or row.get("pos") not in POS
        ):
            continue
        home = row["team"] == game["home"]["slug"]
        scored, conceded = (game["homeGoals"], game["awayGoals"]) if home else (game["awayGoals"], game["homeGoals"])
        old = [h for h in hist[player] if h["when"] + sofix_v1.DELAY < lock]
        st = [h for h in old if h["started"]]
        mins = sum(h["mins"] for h in old)
        smins = sum(h["mins"] for h in st)
        f = [len(st), mins, smins]
        f += [sum(h["r"][i] for h in old) / mins * 90 if mins >= 90 else -1.0 for i in range(len(RATES))]
        last = st[-10:]
        lm = sum(h["mins"] for h in last)
        ga = lambda hs: sum(h["r"][0] + h["r"][1] for h in hs)  # noqa: E731
        f += [
            np.mean([h["level"] >= 60 for h in st]) if st else -1.0,
            np.mean([h["level"] >= 60 for h in last]) if last else -1.0,
            np.mean([h["level"] < 35 for h in st]) if st else -1.0,
            ga(last) / lm * 90 if lm >= 90 else -1.0,
            np.mean([h["pen"] for h in last]) if last else -1.0,
            np.mean([h["setp"] for h in last]) if last else -1.0,
            np.mean([h["corners"] for h in last]) if last else -1.0,
            np.mean([h["mins"] for h in last]) if last else -1.0,
            ga(st) / max(1, sum(h["teamGoals"] for h in st)) if st else -1.0,  # his share of his side's goals
        ]
        plain = [h["base"] for h in st if h["level"] == 35]
        f += [
            len(plain),
            np.median(plain) if plain else -1.0,
            np.mean(plain) if plain else -1.0,
            np.std(plain) if len(plain) > 1 else -1.0,
            np.median(plain[-10:]) if plain else -1.0,
            np.median([h["score"] for h in st]) if st else -1.0,
        ]
        other = game["away" if home else "home"]["slug"]
        seen = [v for v in versus[(other, row["pos"])] if v[0] + sofix_v1.DELAY < lock][-60:]
        f += [
            len(seen),
            np.mean([v[1] for v in seen]) if seen else 0.0,
            np.mean([v[2] for v in seen]) if seen else -1.0,
        ]
        mine = [v for v in versus[("own:" + row["team"], row["pos"])] if v[0] + sofix_v1.DELAY < lock][-60:]
        f += [np.mean([v[1] for v in mine]) if mine else 0.0]
        extra.append(f)
        base = float(row["score"]) - result_points(row, row["pos"], conceded)
        meta.append((conceded, scored, base, float(row.get("level") or 0)))
        if row["started"] and plain:
            entry = (when, base - float(np.median(plain)), float((row.get("level") or 0) >= 60))
            versus[(other, row["pos"])].append(entry)
            versus[("own:" + row["team"], row["pos"])].append(entry)
        hist[player].append(
            {
                "when": when,
                "started": row["started"],
                "mins": float(row.get("mins") or 0),
                "score": float(row["score"]),
                "level": float(row.get("level") or 0),
                "r": [stat(row, n) for n in RATES],
                "pen": float(row.get("pen") or 0),
                "setp": float(row.get("setp") or 0),
                "corners": float(row.get("corners") or 0),
                "teamGoals": scored,
                "base": base,
            }
        )
assert len(extra) == len(rows)
extra, meta = np.array(extra, float), np.array(meta, float)
V1 = np.array([sofix_v1.features(r.pos, r.home, r.numbers, r.past) if r.numbers else [np.nan] * 23 for r in rows])
ALL = np.hstack([V1, extra])
y = np.array([r.score for r in rows])
pos = np.array([POS.index(r.pos) for r in rows])
started = np.array([r.role == "start" for r in rows])
ok = np.array([r.numbers is not None for r in rows])
week = np.array([r.lock.timestamp() for r in rows])
settle = np.array([(r.when + sofix_v1.DELAY).timestamp() for r in rows])
day = np.array([r.when.date().isoformat() for r in rows])
conceded, base, level = meta[:, 0], meta[:, 2], meta[:, 3]
xga, cs = V1[:, 3], V1[:, 2]


def leaf_mass(forest, x_train, target, x_test, lo=-40):
    """Per test row, the training targets of its leaves as a histogram over whole points lo..lo+180."""
    bins = np.clip(np.rint(target).astype(int) - lo, 0, 180)
    a, b = forest.apply(x_train), forest.apply(x_test)
    mass = np.zeros((len(x_test), 181))
    for t in range(a.shape[1]):
        for leaf in np.unique(b[:, t]):
            h = np.bincount(bins[a[:, t] == leaf], minlength=181).astype(float)
            mass[b[:, t] == leaf] += h / h.sum()
    return mass / a.shape[1]


def best_point(mass):
    """Centre of the 15-point window holding the most mass; mass is over scores 0..100."""
    return np.array([np.convolve(np.pad(m, 7), np.ones(15), mode="valid") for m in mass]).argmax(1)


def trees(depth=5, leaf=30, n=36):
    return ExtraTreesRegressor(n_estimators=n, max_depth=depth, min_samples_leaf=leaf, random_state=26, n_jobs=4)


def run(phase):
    start, end = rel.PHASES[phase]
    te = started & ok & (day >= start) & (day < end)
    tr = started & ok & (settle < week[te].min())
    res, out = {}, {}

    def score(name, point):
        hit = np.abs(point - y[te]) <= 7 + 1e-9
        res[name], out[name] = hit, point

    # v1 as shipped
    f = trees().fit(V1[tr], y[tr])
    score("v1", best_point(leaf_mass(f, V1[tr], y[tr], V1[te], lo=0)[:, :101]))
    # one forest with everything
    f = trees(8, 20, 150).fit(ALL[tr], y[tr])
    score("all features, one forest", best_point(leaf_mass(f, ALL[tr], y[tr], ALL[te], lo=0)[:, :101]))

    # the chance of a decisive action, its own model
    up, down = level[tr] >= 60, level[tr] < 35
    p_up = (
        HistGradientBoostingClassifier(
            max_depth=3, learning_rate=0.05, max_iter=250, min_samples_leaf=60, random_state=26
        )
        .fit(ALL[tr], up)
        .predict_proba(ALL[te])[:, 1]
    )
    p_down = (
        HistGradientBoostingClassifier(
            max_depth=2, learning_rate=0.05, max_iter=120, min_samples_leaf=100, random_state=26
        )
        .fit(ALL[tr], down)
        .predict_proba(ALL[te])[:, 1]
    )
    out["p_up"], out["p_down"] = p_up, p_down
    # score with one, score without one
    plain = tr & (level == 35)
    f_plain = trees(7, 20, 120).fit(ALL[plain], y[plain])
    m_plain = leaf_mass(f_plain, ALL[plain], y[plain], ALL[te], lo=0)[:, :101]
    dec = tr & (level >= 60)
    f_dec = trees(5, 30, 80).fit(ALL[dec], y[dec])
    m_dec = leaf_mass(f_dec, ALL[dec], y[dec], ALL[te], lo=0)[:, :101]
    m_neg = np.zeros((4, 101))
    for p in range(4):
        m_neg[p] = np.bincount(np.rint(y[tr & (level < 35) & (pos == p)]).astype(int), minlength=101)[:101]
        m_neg[p] /= m_neg[p].sum()
    mix = (1 - p_up - p_down)[:, None] * m_plain + p_up[:, None] * m_dec + p_down[:, None] * m_neg[pos[te]]
    score("decisive chance + two scores", best_point(mix))
    score("plain score only (never call a decisive)", best_point(m_plain))

    # defenders, midfielders, keepers: his score without his side's result, then tonight's scoreline put back
    f_base = trees(7, 20, 120).fit(ALL[plain], base[plain])
    m_base = leaf_mass(f_base, ALL[plain], base[plain], ALL[te], lo=-40)
    cal = LogisticRegression().fit(np.log(cs[tr] / (1 - cs[tr]))[:, None], conceded[tr] == 0)
    p_cs = cal.predict_proba(np.log(cs[te] / (1 - cs[te]))[:, None])[:, 1]
    m_line = np.zeros((te.sum(), 101))
    scores = np.arange(181) - 40
    for i, (p, lam, c) in enumerate(zip(pos[te], xga[te], p_cs, strict=True)):
        ks = np.arange(0, 7)
        pk = poisson.pmf(ks, max(lam, 0.05))
        pk[1:] *= (1 - c) / pk[1:].sum()
        pk[0] = c
        if p == 0:  # a keeper's clean sheet is a decisive action: his plain games all have a goal against
            pk[0] = 0.0
            pk /= pk.sum()
        for k, w in zip(ks, pk, strict=True):
            shift = CONCEDED[POS[p]] * k + (10.0 if (k == 0 and p == 1) else 0.0)
            idx = np.clip(np.rint(scores + shift).astype(int), 0, 100)
            np.add.at(m_line[i], idx, w * m_base[i])
    score("plain with scoreline (never call a decisive)", best_point(m_line))
    mix2 = (1 - p_up - p_down)[:, None] * m_line + p_up[:, None] * m_dec + p_down[:, None] * m_neg[pos[te]]
    score("decisive chance + scoreline", best_point(mix2))

    print(f"\n{start}..{end}  starters {te.sum()}  train {tr.sum()}")
    truth = level[te] >= 60
    order = np.argsort(-p_up)
    auc = (np.argsort(np.argsort(p_up))[truth].mean() - (truth.sum() - 1) / 2) / (~truth).sum()
    print(
        f" decisive chance: base rate {truth.mean():.3f}  AUC {auc:.3f}  said>=0.5: {(p_up >= 0.5).sum()} happened {truth[p_up >= 0.5].mean() if (p_up >= 0.5).any() else 0:.2f}"
        f"  said>=0.4: {(p_up >= 0.4).sum()} happened {truth[p_up >= 0.4].mean() if (p_up >= 0.4).any() else 0:.2f}  top 5%: {truth[order[: len(order) // 20]].mean():.2f}"
    )
    weeks = np.unique(week[te])
    rng = np.random.default_rng(20261112)
    for name, hit in res.items():
        by = "  ".join(f"{POS[p]} {hit[pos[te] == p].sum()}" for p in range(4))
        diff = np.array([(hit & (week[te] == w)).sum() - (res["v1"] & (week[te] == w)).sum() for w in weeks])
        draws = rng.choice(diff, (2000, len(diff))).sum(1)
        print(
            f" {name:46s} {hit.sum():5d} {hit.mean() * 100:5.2f}%  vs v1 {hit.sum() - res['v1'].sum():+4d} [{np.percentile(draws, 2.5):+.0f}, {np.percentile(draws, 97.5):+.0f}]  {by}"
        )
    return {**out, "y": y[te], "pos": pos[te], "level": level[te], "week": week[te]}


saved = {}
for phase in (2, 3):
    for k, v in run(phase).items():
        saved[f"p{phase}_{k}"] = v
np.savez(OUT, **saved)
