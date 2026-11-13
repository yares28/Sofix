# ruff: noqa  -- a one-off diagnostic kept as run, for the record (plans/laliga-accuracy-evidence.md)
"""Rebuild within-7 accuracy from local blocks. Results = sorare_league_history (+ league_games:EUROPE starters).
Read-only. Output: markdown to stdout."""

import collections
import glob
import json
import os
from datetime import datetime

B = "C:/Users/Yaya/Desktop/PROJECTS/FixtureDiff/frontend/.blocks/"
CLOSE = 7.0


def load(n):
    return json.load(open(B + n, encoding="utf-8"))["payload"]


def dt(s):
    return datetime.fromisoformat(s.replace("Z", "+00:00"))


hist = load("sorare_league_history.json")
euro = load("league_games%3AEUROPE.json")["games"]
checks = load("audit_game_checks.json")["games"]
hidx = {}
prior = collections.defaultdict(list)  # slug -> sorted dates of played games (for "few past games")
for slug, e in hist.items():
    for g in e["games"]:
        hidx[(slug, g["gameId"])] = g
        if g["status"] in ("FINAL", "REVIEWING") and g["played"]:
            prior[slug].append(g["date"])
    prior[slug].sort()

rows = []  # one per (record, player, game) with a usable result
cover = collections.Counter()
for f in sorted(glob.glob(B + "score_record*")):
    p = load(os.path.basename(f).replace("%3A", "%3A"))
    gw = p["gameweek"]
    lock = dt(gw["lock"])
    pre = dt(p["writtenAt"]) < lock
    for slug, e in p["players"].items():
        for g in e["games"]:
            comp = g["competition"]
            key = (gw["number"], comp)
            cover[key + ("forecast_games",)] += 1
            if not pre:
                cover[key + ("written_after_lock",)] += 1
                continue
            res = None
            ck = ((checks.get(g["id"]) or {}).get("scores") or {}).get(slug)
            if ck and ck.get("sourceStatus") in ("FINAL", "REVIEWING", "DID_NOT_PLAY") and ck.get("played") is not None:
                if ck["sourceStatus"] == "DID_NOT_PLAY":
                    res = {"started": False, "played": False, "score": ck.get("score")}
                elif ck.get("started") is not None:
                    res = {"started": ck["started"], "played": ck["played"], "score": ck.get("score")}
                if res:
                    res["src"] = "game_checks"
            h = hidx.get((slug, g["id"])) if res is None else None
            if h and h["status"] in ("FINAL", "REVIEWING", "DID_NOT_PLAY") and h["played"] is not None:
                if h["status"] == "DID_NOT_PLAY":
                    res = {"started": False, "played": False, "score": h["score"]}
                elif h["started"] is not None:
                    res = {"started": h["started"], "played": h["played"], "score": h["score"]}
                if res:
                    res["src"] = "history"
            if res is None:
                eg = euro.get(g["id"])
                if eg and eg.get("settled") and slug in (eg.get("starts") or {}):
                    res = {"started": True, "played": True, "score": eg["starts"][slug], "src": "europe"}
            if res is None:
                cover[key + ("no_result",)] += 1
                continue
            cover[key + ("result",)] += 1
            started = res["started"]
            if res["score"] is None or (not started and not res["played"]):
                continue
            venue = g.get("venue")
            if venue is None and g.get("team"):
                venue = "H" if g.get("team") == g.get("home") else "A"
            before = sum(1 for d in prior.get(slug, []) if d < g["kickoff"])
            rows.append(
                dict(
                    week=gw["number"],
                    comp=comp,
                    pos=e["pos"],
                    slug=slug,
                    started=started,
                    actual=float(res["score"]),
                    sorare=g.get("sorare"),
                    sofix=g.get("sofix"),
                    sofixOn=g.get("sofixOn"),
                    venue=venue,
                    gsrc=g.get("scoreSource"),
                    by=e.get("by"),
                    before=before,
                    rsrc=res["src"],
                    version=g.get("modelVersion"),
                    pstart=e.get("pStart"),
                    grade=g.get("grade"),
                    start_source=e.get("startSource"),
                )
            )


def num(r, key):
    v = r[key]
    return None if v is None else float(v)


def paired(rs, started):
    out = []
    for r in rs:
        if r["started"] is not started:
            continue
        a = r["sorare"]
        s = r["sofix"] if started or r["sofixOn"] is None else r["sofixOn"]
        if a is None or s is None:
            continue
        out.append((float(s), float(a), r["actual"], r))
    return out


def stat(vals):  # vals: predicted, actual
    n = len(vals)
    if not n:
        return "0"
    m = [p - a for p, a in vals]
    return (
        f"{n} | {sum(abs(x) <= CLOSE + 1e-9 for x in m) / n:.1%} | {sum(abs(x) for x in m) / n:.1f} | {sum(m) / n:+.1f}"
    )


def table(title, rs, started, keyf, order=None, compare=True):
    pr = paired(rs, started)
    groups = collections.defaultdict(list)
    for t in pr:
        groups[keyf(t[3])].append(t)
    keys = order or sorted(groups, key=lambda k: (k is None, str(k)))
    print(f"\n**{title}** ({'starters' if started else 'subs'})\n")
    print("| group | n | Sofix within-7 | Sofix MAE | Sofix lean | Sorare within-7 | Sorare MAE | Sorare lean |")
    print("|---|---|---|---|---|---|---|---|")
    for k in keys:
        g = groups.get(k, [])
        if not g:
            continue
        a = stat([(x[0], x[2]) for x in g]).split(" | ")
        b = stat([(x[1], x[2]) for x in g]).split(" | ")
        print(f"| {k} | {a[0]} | {a[1]} | {a[2]} | {a[3]} | {b[1]} | {b[2]} | {b[3]} |")


def bucket(n):
    return "0-2" if n <= 2 else "3-5" if n <= 5 else "6-9" if n <= 9 else "10+"


la = [r for r in rows if r["comp"] == "laliga-es"]
print("# Rebuild from local blocks\n")
print(f"Usable settled rows (any comp): {len(rows)}; LaLiga: {len(la)}")
print("\nLaLiga coverage per week (forecast games / result found / no result):\n")
print("| GW | forecast games | result found | no result | written after lock |\n|---|---|---|---|---|")
for w in sorted({k[0] for k in cover}):
    k = (w, "laliga-es")
    print(
        f"| {w} | {cover[k + ('forecast_games',)]} | {cover[k + ('result',)]} | {cover[k + ('no_result',)]} | {cover[k + ('written_after_lock',)]} |"
    )

for started in (True, False):
    pr = paired(la, started)
    print(
        f"\n## LaLiga {'starters' if started else 'substitutes'}: paired n={len(pr)} (rows with a result of that kind: {sum(1 for r in la if r['started'] is started and (started or r['played'] is not False))})"
    )
    print("| source | n | within-7 | MAE | lean |\n|---|---|---|---|---|")
    print("| Sofix |", stat([(x[0], x[2]) for x in pr]), "|")
    print("| Sorare |", stat([(x[1], x[2]) for x in pr]), "|")
    table("by position", la, started, lambda r: r["pos"], ["GK", "DEF", "MID", "FWD"])
    table("by GW", la, started, lambda r: r["week"])
    table("by venue", la, started, lambda r: r["venue"])
    table("by game's scoreSource", la, started, lambda r: r["gsrc"])
    table("by player 'by'", la, started, lambda r: r["by"])
    table(
        "by past played games in history before kickoff",
        la,
        started,
        lambda r: bucket(r["before"]),
        ["0-2", "3-5", "6-9", "10+"],
    )
    table("by modelVersion", la, started, lambda r: r["version"])
    table("by result source", la, started, lambda r: r["rsrc"])
    table("by startSource", la, started, lambda r: r["start_source"])
    table(
        "by pStart band",
        la,
        started,
        lambda r: (
            None
            if r["pstart"] is None
            else (
                "<.3"
                if r["pstart"] < 0.3
                else "<.6"
                if r["pstart"] < 0.8 and r["pstart"] >= 0.3
                else ".8+"
                if r["pstart"] >= 0.8
                else ".6-.8"
            )
        ),
    )
    # actual-score band
    table(
        "by actual score band",
        la,
        started,
        lambda r: (
            "0-15" if r["actual"] < 15 else "15-35" if r["actual"] < 35 else "35-60" if r["actual"] < 60 else "60+"
        ),
        ["0-15", "15-35", "35-60", "60+"],
    )
    pos_week = None

# games with sofix None (fell back) among LaLiga rows with result
print("\n## Fell back (no Sofix number for the game) among LaLiga rows with a result\n")
c = collections.Counter((r["started"], r["sofix"] is None, r["sorare"] is None) for r in la)
print("| started | sofix missing | sorare missing | n |\n|---|---|---|---|")
for k, v in sorted(c.items()):
    print(f"| {k[0]} | {k[1]} | {k[2]} | {v} |")

print("\n## All competitions, same weeks (every row with a result; Sofix vs Sorare where both)\n")
for started in (True, False):
    print(f"\n{'starters' if started else 'subs'}\n")
    print(
        "| comp | n paired | Sofix within-7 | Sofix MAE | Sofix lean | Sorare within-7 | Sorare MAE | Sorare lean | rows w/ result | of which sofix None | sorare None |"
    )
    print("|---|---|---|---|---|---|---|---|---|---|---|")
    for comp in sorted({r["comp"] for r in rows}):
        rs = [r for r in rows if r["comp"] == comp and r["started"] is started]
        pr = paired(rs, started)
        a = stat([(x[0], x[2]) for x in pr]).split(" | ")
        b = stat([(x[1], x[2]) for x in pr]).split(" | ")
        if len(a) == 1:
            a = ["0", "-", "-", "-"]
            b = a
        print(
            f"| {comp} | {a[0]} | {a[1]} | {a[2]} | {a[3]} | {b[1]} | {b[2]} | {b[3]} | {len(rs)} | {sum(r['sofix'] is None for r in rs)} | {sum(r['sorare'] is None for r in rs)} |"
        )

print("\n## Result coverage by competition (all weeks)\n")
cc = collections.Counter()
for k, v in cover.items():
    cc[(k[1], k[2])] += v
print("| comp | forecast games | result found | no result |\n|---|---|---|---|")
for comp in sorted({k[0] for k in cc}):
    print(f"| {comp} | {cc[(comp, 'forecast_games')]} | {cc[(comp, 'result')]} | {cc[(comp, 'no_result')]} |")

# model version counts
mv = collections.Counter()
for f in glob.glob(B + "score_record*"):
    p = load(os.path.basename(f))
    for e in p["players"].values():
        for g in e["games"]:
            mv[(g["competition"] == "laliga-es", "modelVersion" in g)] += 1
print("\nGames carrying modelVersion (laliga?, has):", dict(mv))
a = load("audit.json")
print(
    "audit.versus recorded/settled:",
    a["versus"]["recorded"],
    a["versus"]["settled"],
    "audit keys xscore:",
    list(a["xscore"].keys()),
)
print("audit xscore.models:", a["xscore"].get("models"))

# Exploratory: LaLiga games where played is True but started is unknown (null), counted as probable substitutes by minutes.
print("\n## Exploratory: LaLiga played, started unknown (game_checks), Sofix sub number vs minutes\n")
ex = []
for f in sorted(glob.glob(B + "score_record*")):
    p = load(os.path.basename(f))
    if dt(p["writtenAt"]) >= dt(p["gameweek"]["lock"]):
        continue
    for slug, e in p["players"].items():
        for g in e["games"]:
            if g["competition"] != "laliga-es":
                continue
            ck = ((checks.get(g["id"]) or {}).get("scores") or {}).get(slug)
            if ck and ck.get("played") and ck.get("started") is None and ck.get("score") is not None:
                ex.append(
                    (
                        p["gameweek"]["number"],
                        e["pos"],
                        ck.get("mins"),
                        float(ck["score"]),
                        g.get("sofix"),
                        g.get("sofixOn"),
                        g.get("sorare"),
                    )
                )
print("n:", len(ex), "mins distribution:", sorted(x[2] for x in ex if x[2] is not None))
for lo, hi, label in ((0, 46, "mins<46 (probable sub)"), (46, 200, "mins>=46 (probable unmarked start)")):
    sub = [x for x in ex if x[2] is not None and lo <= x[2] < hi]
    for name, idx in (("Sofix sofixOn", 5), ("Sofix start number", 4), ("Sorare", 6)):
        vals = [(float(x[idx]), x[3]) for x in sub if x[idx] is not None]
        print(label, name, "n,within7,MAE,lean =", stat(vals))
