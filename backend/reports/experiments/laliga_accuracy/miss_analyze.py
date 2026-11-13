# ruff: noqa  -- a one-off diagnostic kept as run, for the record (plans/laliga-accuracy-evidence.md)
import pickle

import numpy as np
import pandas as pd

S = "SCRATCH/"
d = pickle.load(open(S + "cases.pkl", "rb"))
G = {
    "duels": ["duel_won", "duel_lost"],
    "defbonus": ["double_double", "triple_double", "triple_triple"],
    "cs_conceded": ["clean_sheet_60", "goals_conceded"],
    "passing": [
        "accurate_pass",
        "missed_pass",
        "accurate_long_balls",
        "successful_final_third_passes",
        "long_pass_own_to_opp_success",
        "poss_lost_ctrl",
        "poss_won",
    ],
    "defensive": ["interception_won", "won_tackle", "effective_clearance", "outfielder_block", "blocked_cross"],
    "attacking": [
        "adjusted_total_att_assist",
        "big_chance_created",
        "ontarget_scoring_att",
        "pen_area_entries",
        "won_contest",
        "was_fouled",
        "big_chance_missed",
        "penalty_won",
        "penalty_kick_missed",
    ],
    "discipline_errors": ["fouls", "yellow_card", "error_lead_to_shot"],
}
rows = []
for x in d:
    r = {k: v for k, v in x.items() if k not in ("stats", "cnt")}
    for g, ks in G.items():
        r["g_" + g] = sum(x["stats"].get(k, 0.0) for k in ks)
    r["g_other"] = x["aa"] - sum(r["g_" + g] for g in G)
    r["conc_pts"] = x["stats"].get("goals_conceded", 0.0)
    r["cs_pts"] = x["stats"].get("clean_sheet_60", 0.0)
    rows.append(r)
df = pd.DataFrame(rows)
df["err"] = df.pred - df.score  # signed: + means predicted too high
df["hit"] = df.err.abs() <= 7 + 1e-9
df["dec"] = np.where(df.level < 35, "negative", np.where(df.level > 35, "positive", "none"))
df["aa_eff"] = df.score - df.level  # all-around incl. floor effect
df["month"] = pd.to_datetime(df.when).dt.month
df["sd_gap"] = df.xgf - df.xga
df["conc"] = df.ga.clip(upper=3)
df["mband"] = pd.cut(df.mins, [-1, 45, 59, 75, 89, 200], labels=["<46", "46-59", "60-75", "76-89", "90+"])
df["sband"] = pd.cut(df.n_start, [-1, 0, 2, 5, 999], labels=["0", "1-2", "3-5", "6+"])
df.to_csv(S + "miss_cases.csv", index=False)

out = []


def P(s=""):
    out.append(s)


def tab(t, title=None):
    if title:
        P(f"\n**{title}**\n")
    t = t.reset_index()
    P("| " + " | ".join(map(str, t.columns)) + " |")
    P("|" + "---|" * len(t.columns))
    for _, r in t.iterrows():
        P("| " + " | ".join(f"{v:.2f}" if isinstance(v, (float, np.floating)) else str(v) for v in r) + " |")


def cell(g):
    return pd.Series(
        {
            "n": len(g),
            "hits": int(g.hit.sum()),
            "hit%": 100 * g.hit.mean() if len(g) else np.nan,
            "misses": int((~g.hit).sum()),
            "mean(pred-real)": g.err.mean(),
        }
    )


def by(sub, col):
    return sub.groupby(col, observed=True).apply(cell, include_groups=False)


st = df[df.role == "start"].copy()
bn = df[df.role == "bench"].copy()
P("# Where do the starter misses happen? (Sofix v1 replay, Jan-Oct 2026, LaLiga)\n")
P(
    f"Replay check: starters {len(st)} cases, {int(st.hit.sum())} hits ({100 * st.hit.mean():.2f}%); substitutes {len(bn)}, {int(bn.hit.sum())} hits ({100 * bn.hit.mean():.2f}%). Matches the reference counts (2596 / 2176)."
)
P(
    "Error = prediction minus real score (positive = predicted too high). Decisive: negative = level points < 35, none = 35, positive = >35. 'Ordinary' = decisive level points exactly 35 (a decisive action may still have cancelled out). AA = score minus level points."
)
P(f"Total starter misses: {int((~st.hit).sum())}.")

P("\n## 1. Starters: position x decisive outcome")
t = st.groupby(["pos", "dec"]).apply(cell, include_groups=False)
tab(t, "hit rate")
tab(st.groupby("dec").apply(cell, include_groups=False), "by decisive outcome only")
tab(st.groupby("pos").apply(cell, include_groups=False), "by position only")
coin = st[st.dec != "none"]
P(
    f"\nMisses with a decisive level change ('the coin'): {int((~coin.hit).sum())} of {int((~st.hit).sum())} misses ({100 * (~coin.hit).sum() / (~st.hit).sum():.1f}%), from {len(coin)} cases ({100 * len(coin) / len(st):.1f}% of starts). Ordinary games: {int((~st[st.dec == 'none'].hit).sum())} misses from {int((st.dec == 'none').sum())} cases."
)
P(
    f"Ordinary-game misses: too high (pred>real) {int((st[(st.dec == 'none') & ~st.hit].err > 0).sum())}, too low {int((st[(st.dec == 'none') & ~st.hit].err < 0).sum())}."
)
# how the model's own coin chance compares
tab(
    st.groupby("pos").apply(
        lambda g: pd.Series(
            {
                "mean p_dec (model)": g.p_dec.mean(),
                "real decisive>35 share": (g.level > 35).mean(),
                "real level<35 share": (g.level < 35).mean(),
            }
        ),
        include_groups=False,
    ),
    "model decisive chance vs reality",
)

o = st[st.dec == "none"].copy()
P("\n## 2. Starters, ordinary games only (level points 35)")
P(f"n={len(o)}, hits {int(o.hit.sum())} ({100 * o.hit.mean():.2f}%), misses {int((~o.hit).sum())}.")
q = o.err.quantile([0.05, 0.1, 0.25, 0.5, 0.75, 0.9, 0.95])
P(
    "Error in AA points (pred - real), percentiles: "
    + ", ".join(f"p{int(k * 100)}={v:.1f}" for k, v in q.items())
    + f"; mean {o.err.mean():.2f}, sd {o.err.std():.2f}, MAE {o.err.abs().mean():.2f}."
)
P(
    "Share of ordinary cases by |error| band: "
    + ", ".join(
        f"{a}-{b}: {int(((o.err.abs() >= a) & (o.err.abs() < b)).sum())}"
        for a, b in [(0, 3.5), (3.5, 7.0001), (7.0001, 10), (10, 15), (15, 25), (25, 200)]
    )
)
tab(by(o, "mband"), "by minutes played")
tab(by(o, "sband"), "by past starts in the 70-day window")
tab(by(o, "home"), "home (True) / away")
tab(
    o[o.pos.isin(["GK", "DEF"])].groupby(["pos", "conc"]).apply(cell, include_groups=False),
    "by goals conceded (3 = 3+), GK and DEF",
)
o["sstr"] = pd.qcut(o.sd_gap, 4, labels=["weakest", "q2", "q3", "strongest"])
tab(by(o, "sstr"), "by team strength (xGF - xGA quartile)")
tab(by(o, "month"), "by month")
tab(by(o, "pos"), "by position")
tab(o.groupby(["pos", "mband"], observed=True).apply(cell, include_groups=False), "position x minutes")
# conceded vs expected for all-around
P("\nMean (pred-real) is bias; |bias| > ~1.5 with n>150 is notable.")

P("\n## 3. AA stat groups, DEF and MID, ordinary starters")
gcols = ["g_" + g for g in G] + ["g_other"]
for pos in ("DEF", "MID"):
    s = o[o.pos == pos]
    P(
        f"\n**{pos}** (n={len(s)}; hits {int(s.hit.sum())}, misses too-high {int(((~s.hit) & (s.err > 0)).sum())}, too-low {int(((~s.hit) & (s.err < 0)).sum())})"
    )
    P(
        "| group | mean pts hit | mean pts, misses where pred too high | mean pts, misses where real above pred | sd hit | sd miss | share of AA var hit | share of AA var miss | corr with error (all) |"
    )
    P("|---|---|---|---|---|---|---|---|---|---|")
    h, mi = s[s.hit], s[~s.hit]
    mo, mu = s[(~s.hit) & (s.err > 0)], s[(~s.hit) & (s.err < 0)]  # mo: predicted too high; mu: real above prediction
    for c in gcols:

        def sh(z):
            return np.cov(z[c], z.aa_eff)[0, 1] / z.aa_eff.var()

        P(
            f"| {c[2:]} | {h[c].mean():.2f} | {mo[c].mean():.2f} (pred too high, n={len(mo)}) | {mu[c].mean():.2f} (real above pred, n={len(mu)}) | {h[c].std():.2f} | {mi[c].std():.2f} | {sh(h):.2f} | {sh(mi):.2f} | {np.corrcoef(s[c], -s.err)[0, 1]:.2f} |"
        )
    P(
        f"| (total AA) | {h.aa_eff.mean():.2f} | {mo.aa_eff.mean():.2f} | {mu.aa_eff.mean():.2f} | {h.aa_eff.std():.2f} | {mi.aa_eff.std():.2f} | 1 | 1 | |"
    )
    P(
        f"Column 3 = predicted too high, column 4 = real above prediction; group means are real points. Mean model expectation of AA (pred-35) in hits {h.pred.sub(35).mean():.1f}, in misses {mi.pred.sub(35).mean():.1f}."
    )

P("\n## 4. Hindsight ceilings (CHEATING, diagnostics only: use facts unknown before lock)")


def hits(p, sub):
    p = np.clip(p, 0, 100)
    return int((np.abs(p - sub.score) <= 7 + 1e-9).sum())


def floorlvl(p, lvl):
    return np.where(lvl > 35, np.maximum(p, lvl), p)


s = st.copy()
base = int(s.hit.sum())
rep = []


def add(name, p, sub=s):
    h = hits(p, sub)
    b = int(sub.hit.sum())
    rep.append(
        {"variant": name, "n": len(sub), "hits": h, "hit%": 100 * h / len(sub), "baseline hits": b, "gain": h - b}
    )


lv = s.level.values
add("(a1) level known: pred + (level-35), positive-level floor", floorlvl(s.pred + (s.level - 35), lv))
add("(a2) level known: model plain-expectation + (level-35), floor", floorlvl(s.if_plain + (s.level - 35), lv))
usual = s.usual_mins.fillna(85).clip(lower=20)
ratio = (s.mins / usual).clip(0.2, 1.6)
add("(b1) minutes known: 35+(pred-35)*mins/usual", 35 + (s.pred - 35) * ratio)
add("(b2) minutes known: 35+(plain-35)*mins/usual", 35 + (s.if_plain - 35) * ratio)
c = {"GK": -5, "DEF": -4, "MID": -2, "FWD": 0}
cc = s.pos.map(c)
exp_c = cc * s.xga + np.where(s.pos == "DEF", 10 * s.cs, 0)
act_c = s.conc_pts + s.cs_pts
# GK clean sheet is decisive (+25 level points); counted via level in (a), so (c) here is conceded + DEF clean sheet points only
add("(c1) goals conceded known: pred + (conceded & DEF clean-sheet pts - expected)", s.pred + act_c - exp_c)
gkcs = ((s.pos == "GK") & (s.ga == 0) & (s.mins >= 60)).astype(float)
add(
    "(c2) as c1 + GK clean sheet (+25 level) known",
    s.pred + act_c - exp_c + 25 * (gkcs - np.where(s.pos == "GK", s.cs, 0)),
)
add("(a1+b1) level and minutes known", floorlvl(35 + (s.pred + (s.level - 35) - 35) * ratio, lv))
add("(a1+c1) level and goals conceded known", floorlvl(s.pred + (s.level - 35) + act_c - exp_c, lv))
med = s.groupby("player").score.transform("median")
add("(d) player's whole-2026 median starter score known (incl. this game)", med)
tab(pd.DataFrame(rep).set_index("variant"))
# same for ordinary only
rep2 = []
so = s[s.dec == "none"]
ur = (so.mins / so.usual_mins.fillna(85).clip(lower=20)).clip(0.2, 1.6)


def add2(name, p):
    h = hits(p, so)
    rep2.append(
        {
            "variant (ordinary only)": name,
            "n": len(so),
            "hits": h,
            "hit%": 100 * h / len(so),
            "baseline": int(so.hit.sum()),
        }
    )


add2("(b1) minutes", 35 + (so.pred - 35) * ur)
add2("(b2) plain-expectation + minutes", 35 + (so.if_plain - 35) * ur)
add2("(plain expectation only, no hindsight)", so.if_plain)
add2(
    "(c1) conceded",
    so.pred + (so.conc_pts + so.cs_pts) - (so.pos.map(c) * so.xga + np.where(so.pos == "DEF", 10 * so.cs, 0)),
)
tab(pd.DataFrame(rep2).set_index("variant (ordinary only)"))
tab(
    s.assign(med=med)
    .groupby("pos")
    .apply(
        lambda g: pd.Series({"n": len(g), "hits_baseline": int(g.hit.sum()), "hits_median": hits(g.med, g)}),
        include_groups=False,
    ),
    "(d) by position",
)

P("\n## 5. Clubs and opponents (starters, >=150 starts)")


def club(col):
    a = st.groupby(col).apply(cell, include_groups=False)
    a = a[a.n >= 150].sort_values("hit%")
    e = st[st.month <= 5].groupby(col).hit.agg(["size", "mean"])
    l = st[st.month >= 8].groupby(col).hit.agg(["size", "mean"])
    a["JanMay hit%"] = 100 * e["mean"].reindex(a.index)
    a["JanMay n"] = e["size"].reindex(a.index)
    a["AugOct hit%"] = 100 * l["mean"].reindex(a.index)
    a["AugOct n"] = l["size"].reindex(a.index)
    return a


for col in ("team", "opp"):
    a = club(col)
    tab(a.head(10), f"lowest 10 by {col} (of {len(a)} with >=150 starts)")
    tab(a.tail(10), f"highest 10 by {col}")
    ok = a.dropna(subset=["JanMay hit%", "AugOct hit%"])
    r = ok["JanMay hit%"].corr(ok["AugOct hit%"], method="spearman")
    P(
        f"\n{col}: Spearman rank correlation of Jan-May vs Aug-Oct hit rate over {len(ok)} clubs = {r:.2f}. Spread of overall hit% (sd) = {a['hit%'].std():.1f}; binomial noise sd at n~{int(a.n.mean())} = {100 * np.sqrt(0.38 * 0.62 / a.n.mean()):.1f}."
    )
    P(
        f"Mean(pred-real) of the 5 lowest clubs: {a.head(5)['mean(pred-real)'].mean():.2f}; of the 5 highest: {a.tail(5)['mean(pred-real)'].mean():.2f}."
    )

P("\n## 6. Substitutes (brief)")
tab(bn.groupby(["pos", "dec"]).apply(cell, include_groups=False), "position x decisive")
tab(bn.groupby("dec").apply(cell, include_groups=False), "decisive only")
bo = bn[bn.dec == "none"]
P(
    f"Ordinary subs: n={len(bo)}, hits {int(bo.hit.sum())} ({100 * bo.hit.mean():.1f}%). AA error pctl: "
    + ", ".join(f"p{int(k * 100)}={v:.1f}" for k, v in bo.err.quantile([0.05, 0.25, 0.5, 0.75, 0.95]).items())
)
tab(by(bo, "mband"), "by minutes")
tab(by(bo, "home"), "home/away")
tab(by(bo, "sband"), "by past starts")
tab(by(bo, "pos"), "by position")
tab(by(bo, "month"), "by month")
P(f"Sub misses: {int((~bn.hit).sum())}; with decisive change {int((~bn[bn.dec != 'none'].hit).sum())}.")

# concentration summary
P("\n## Concentration of starter misses")
miss = st[~st.hit]
tab(
    pd.DataFrame(
        {
            "misses": [
                int((miss.dec != "none").sum()),
                int(((miss.dec == "none") & (miss.mins < 60)).sum()),
                int(((miss.dec == "none") & (miss.mins >= 60) & (miss.err > 0)).sum()),
                int(((miss.dec == "none") & (miss.mins >= 60) & (miss.err < 0)).sum()),
            ]
        },
        index=[
            "decisive happened (coin)",
            "ordinary, <60 min",
            "ordinary, 60+ min, predicted too high",
            "ordinary, 60+ min, real above prediction",
        ],
    )
)
open(S + "miss_report.md", "w", encoding="utf-8").write("\n".join(out) + "\n")
print("\n".join(out))
