"""Testing only: one table of pre-lock inputs for every LaLiga appearance, for the Sofix v2 candidates.

Usage: python v2_features.py <worktree backend> <games.jsonl> <out.npz>
Every input is the football model's numbers or the player's, his side's and the opponent's games settled 48 h before lock.
"""

import json
import sys
from collections import defaultdict
from datetime import datetime
from pathlib import Path

import numpy as np

WT, GAMES, OUT = Path(sys.argv[1]), Path(sys.argv[2]), Path(sys.argv[3])
sys.path.insert(0, str(WT))
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
YEAR = 365 * 86400.0

games = sorted(
    (json.loads(x) for x in GAMES.read_bytes().splitlines() if x.strip()), key=lambda g: (g["date"], g["id"])
)
ctx = json.loads((WT / "data/raw/score-foundation/football.json").read_bytes())["context"]
rows = rel.cases(games, ctx)


def stat(row, name, i=0):
    return float((row.get("stats") or {}).get(name, (0.0, 0.0))[i])


def med(v):
    return float(np.median(v)) if len(v) else -1.0


def avg(v):
    return float(np.mean(v)) if len(v) else -1.0


hist: dict[str, list] = defaultdict(list)
team: dict[str, list] = defaultdict(list)  # per side and game: passes made, passes let, ordinary all-around by position
names: list[str] = []
extra, meta = [], []
for game in games:
    when = datetime.fromisoformat(game["date"].replace("Z", "+00:00"))
    lock = rel.cutoff_for(when)
    line_of: dict[str, tuple[float, float, float, float]] = {}
    for side in ("home", "away"):
        lines = ((game.get("xi") or {}).get(side) or {}).get("start") or []
        for i, line in enumerate(lines):
            for j, slug in enumerate(line):
                line_of[slug] = (
                    float(i),
                    float(len(lines)),
                    float(j in (0, len(line) - 1)),
                    float(len(lines[1])) if len(lines) > 1 else -1.0,
                )
    passes = defaultdict(float)
    dec_by = defaultdict(lambda: np.zeros(8))  # per side: positive decisive players by position, then negative ones
    for row in game["players"].values():
        passes[row.get("team")] += stat(row, "accurate_pass")
        if row.get("played") is True and row.get("pos") in POS and row.get("ver") == 7:
            lvl = float(row.get("level") or 0)
            if lvl >= 60:
                dec_by[row.get("team")][POS.index(row["pos"])] += 1
            elif lvl < 35:
                dec_by[row.get("team")][4 + POS.index(row["pos"])] += 1
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
        other = game["away" if home else "home"]["slug"]
        scored, conceded = (game["homeGoals"], game["awayGoals"]) if home else (game["awayGoals"], game["homeGoals"])
        old = [h for h in hist[player] if h["when"] + sofix_v1.DELAY < lock]
        st = [h for h in old if h["started"]]
        be = [h for h in old if not h["started"]]
        recent = [h for h in old if (when - h["when"]).total_seconds() < YEAR]
        mins, rmins = sum(h["mins"] for h in old), sum(h["mins"] for h in recent)
        last = st[-10:]
        lm = sum(h["mins"] for h in last)
        ga = lambda hs: sum(h["r"][0] + h["r"][1] for h in hs)  # noqa: E731
        plain = [h["base"] for h in st if h["level"] == 35]
        f = {
            "n_starts": len(st),
            "n_bench": len(be),
            "mins": mins,
            **{f"{n}90": sum(h["r"][i] for h in old) / mins * 90 if mins >= 90 else -1.0 for i, n in enumerate(RATES)},
            **{
                f"{n}90y": sum(h["r"][i] for h in recent) / rmins * 90 if rmins >= 90 else -1.0
                for i, n in enumerate(RATES)
            },
            "dec": avg([h["level"] >= 60 for h in st]),
            "dec10": avg([h["level"] >= 60 for h in last]),
            "neg": avg([h["level"] < 35 for h in st]),
            "ga10": ga(last) / lm * 90 if lm >= 90 else -1.0,
            "pen": avg([h["pen"] for h in last]),
            "setp": avg([h["setp"] for h in last]),
            "corners": avg([h["corners"] for h in last]),
            "mins10": avg([h["mins"] for h in last]),
            "share": ga(st) / max(1, sum(h["teamGoals"] for h in st)) if st else -1.0,
            "n_plain": len(plain),
            "plain_med": med(plain),
            "plain_avg": avg(plain),
            "plain_sd": float(np.std(plain)) if len(plain) > 1 else -1.0,
            "plain_med10": med(plain[-10:]),
            "plain_med5": med(plain[-5:]),
            "plain_q25": float(np.quantile(plain, 0.25)) if plain else -1.0,
            "plain_q75": float(np.quantile(plain, 0.75)) if plain else -1.0,
            "score_med": med([h["score"] for h in st]),
            "aa_med": med([h["aa"] for h in st]),
            "aa_med10": med([h["aa"] for h in last]),
            "raw_med": med(raw := [h["score"] for h in st if h["level"] == 35]),
            "raw_avg": avg(raw),
            "raw_sd": float(np.std(raw)) if len(raw) > 1 else -1.0,
            "raw_med10": med(raw[-10:]),
            "raw_med5": med(raw[-5:]),
            "raw_q25": float(np.quantile(raw, 0.25)) if raw else -1.0,
            "raw_q75": float(np.quantile(raw, 0.75)) if raw else -1.0,
            "raw_year": med([h["score"] for h in st if h["level"] == 35 and (when - h["when"]).total_seconds() < YEAR]),
            "dec_year": avg([h["level"] >= 60 for h in st if (when - h["when"]).total_seconds() < YEAR]),
            "starts_year": float(sum(1 for h in st if (when - h["when"]).total_seconds() < YEAR)),
            "bench_med": med([h["score"] for h in be]),
            "bench_avg": avg([h["score"] for h in be]),
            "bench_sd": float(np.std([h["score"] for h in be])) if len(be) > 1 else -1.0,
            "bench_mins": avg([h["mins"] for h in be[-10:]]),
            "bench_dec": avg([h["level"] >= 60 for h in be]),
            "bench_med10": med([h["score"] for h in be[-10:]]),
        }
        # his line in his last starts' elevens
        roles = [h["line"] for h in st[-5:] if h["line"]]
        f["line"], f["lines"], f["edge"], f["back"] = roles[-1] if roles else (-1.0, -1.0, -1.0, -1.0)
        f["edge5"] = avg([r[2] for r in roles])
        # his side's and the opponent's style over their last ten settled games
        for label, club in (("own", row["team"]), ("opp", other)):
            seen = [t for t in team[club] if t[0] + sofix_v1.DELAY < lock][-10:]
            f[f"{label}_pass"] = avg([t[1] for t in seen])
            f[f"{label}_pass_let"] = avg([t[2] for t in seen])
            f[f"{label}_goals"] = avg([t[3] for t in seen])
            f[f"{label}_let"] = avg([t[4] for t in seen])
        # decisive actions by position: what his side makes, what the opponent gives away, over 10 and 38 settled games
        p = POS.index(row["pos"])
        for n in (10, 38):
            own_seen = [t for t in team[row["team"]] if t[0] + sofix_v1.DELAY < lock][-n:]
            opp_seen = [t for t in team[other] if t[0] + sofix_v1.DELAY < lock][-n:]
            f[f"own_dec_pos{n}"] = avg([t[5][p] for t in own_seen])
            f[f"opp_gives_pos{n}"] = avg([t[6][p] for t in opp_seen])
            f[f"opp_gives_all{n}"] = avg([t[6][:4].sum() for t in opp_seen])
            f[f"opp_forces_neg{n}"] = avg([t[6][4 + p] for t in opp_seen])
            f[f"opp_neg_own{n}"] = avg([t[5][4:].sum() for t in opp_seen])
            # the same split home or away: what the opponent gives away when it plays where it plays tonight
            venue = [t for t in opp_seen if t[7] == (not home)]
            f[f"opp_gives_pos_venue{n}"] = avg([t[6][p] for t in venue])
        # tonight's official eleven (out about an hour before kick-off)
        now = line_of.get(player)
        f["line_now"], f["lines_now"], f["edge_now"], f["back_now"] = now if now else (-1.0, -1.0, -1.0, -1.0)
        if not names:
            names = list(f)
        extra.append([f[n] for n in names])
        base = float(row["score"]) - (
            stat(row, "clean_sheet_60", 1) + stat(row, "goals_conceded", 1) if row["pos"] != "FWD" else 0.0
        )
        meta.append((conceded, scored, base, float(row.get("level") or 0), float(row.get("mins") or 0)))
        hist[player].append(
            {
                "when": when,
                "started": row["started"],
                "mins": float(row.get("mins") or 0),
                "score": float(row["score"]),
                "level": float(row.get("level") or 0),
                "aa": float(row.get("aa") or 0),
                "r": [stat(row, n) for n in RATES],
                "pen": float(row.get("pen") or 0),
                "setp": float(row.get("setp") or 0),
                "corners": float(row.get("corners") or 0),
                "teamGoals": scored,
                "base": base,
                "line": line_of.get(player),
            }
        )
    for side, opp in (("home", "away"), ("away", "home")):
        a, b = game[side]["slug"], game[opp]["slug"]
        team[a].append(
            (
                when,
                passes[a],
                passes[b],
                game[f"{side}Goals"],
                game[f"{opp}Goals"],
                dec_by[a].copy(),
                dec_by[b].copy(),
                side == "home",
            )
        )
assert len(extra) == len(rows)
V1 = np.array([sofix_v1.features(r.pos, r.home, r.numbers, r.past) if r.numbers else [np.nan] * 23 for r in rows])
meta = np.array(meta, float)
np.savez_compressed(
    OUT,
    v1=V1,
    extra=np.array(extra, float),
    names=np.array(names),
    y=np.array([r.score for r in rows]),
    pos=np.array([POS.index(r.pos) for r in rows]),
    started=np.array([r.role == "start" for r in rows]),
    ok=np.array([r.numbers is not None for r in rows]),
    week=np.array([r.lock.timestamp() for r in rows]),
    settle=np.array([(r.when + sofix_v1.DELAY).timestamp() for r in rows]),
    day=np.array([r.when.date().isoformat() for r in rows]),
    conceded=meta[:, 0],
    base=meta[:, 2],
    level=meta[:, 3],
    mins=meta[:, 4],
)
print(len(rows), len(names))
