"""Squads (plans/squad-prices.md, Q1): what a club team that plays every week costs, in Pro or in the Arena.

For each club of LaLiga, the Premier League, the Bundesliga and Ligue 1, from this season's league games of its players:

- **Pro** is entered after the teamsheets, so a team is a pool of Limited cards from which, each game, the best five of
  those who started are played (GK, DEF, MID, FWD and one more outfielder, captain +50%). A game without such a five
  counts 0. The team for a budget is the one with the best average score per game that still fields five starters in
  the coverage target's share of games; among teams within 1% of that score, the cheapest (no card bought for a point).
- **Arena** is entered before the teamsheets: seven cards (five, a keeper sub and an outfield sub), where a sub only
  comes in for a player who did not play at all. Its team is the best average score inside the budget.

Prices are Sorare's Limited in-season market value; with "count my cards" a card the owner already has costs nothing.
Each club's teams are published as frontiers (cheapest first): the page takes the last one whose `from` fits the budget,
so it never searches. Per team, each game's best, median and average five (hindsight) and Sofix's pick before kickoff
(what it scored and what xS said) where Sofix saved its numbers. Runs once a day in the refresh's Sorare step.
"""

from __future__ import annotations

import itertools
import logging
import statistics
from collections import Counter, defaultdict
from collections.abc import Iterable, Mapping
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from typing import Any

import numpy as np
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import PlayerGame
from app.services import kept_blocks
from app.services.publish import put
from app.services.timeutil import as_utc
from app.sorare import games_mirror
from app.sorare.player_games import season_start
from app.sorare.pro import _prize

logger = logging.getLogger(__name__)

PREFIX = "squads:"
VERSION = 1
POSITIONS = ("GK", "DEF", "MID", "FWD")
OUTFIELD = ("DEF", "MID", "FWD")
TARGETS = (0.7, 0.8, 0.9, 1.0)
CAPTAIN = 0.5  # Sorare's captain bonus in Pro and the Arena (`engineConfiguration.captain`); a board's own value wins
CANDIDATES = {"GK": 3, "DEF": 7, "MID": 6, "FWD": 6}  # each position's leading players the search combines
SIZES = {"GK": (1, 2, 3), "DEF": (1, 2, 3, 4), "MID": (1, 2, 3, 4), "FWD": (1, 2, 3)}
ARENA_OUTFIELD = 11
NEAR = 0.99  # a team within 1% of the best score inside the budget is as good: the cheapest of them is taken
DONE = ("FINAL", "REVIEWING")
EVERY = timedelta(hours=20)  # once a day: prices and games move daily, and the search takes a minute
NEG = -1e6
# league slug: (block code, name, the Sorare league name its Pro board and Limited Arena are filed under)
LEAGUES = {
    "laliga-es": ("LALIGA", "LaLiga", "LALIGA EA SPORTS"),
    "premier-league-gb-eng": ("PL", "Premier League", "English League Players"),
    "bundesliga-de": ("BL1", "Bundesliga", "Bundesliga"),
    "ligue-1-fr": ("FL1", "Ligue 1", "Ligue 1"),
}
FOREIGN = {"PL": "premier-league-gb-eng", "BL1": "bundesliga-de", "FL1": "ligue-1-fr"}

Step = tuple[int, float, int]  # target, cash, essence


@dataclass
class Player:
    slug: str
    name: str
    pos: str
    eur: float
    owned: bool
    art: str | None
    starts: np.ndarray
    played: np.ndarray
    mins: np.ndarray
    scores: np.ndarray
    xs: np.ndarray

    @property
    def cost(self) -> float:
        return 0.0 if self.owned else self.eur

    @property
    def rank(self) -> float:
        """Starts and points together: who the search tries first at his position."""
        n = len(self.starts) or 1
        avg = float(self.scores[self.starts].mean()) if self.starts.any() else 0.0
        return float(self.starts.sum()) / n * (avg + 10)


@dataclass
class Search:
    """Every team the search tried: its cost both ways, average score a game and share of games with five starters."""

    combos: dict[str, list[tuple[str, ...]]]
    index: np.ndarray  # (rows, 4): the GK, DEF, MID, FWD combo of each row
    full: np.ndarray
    owned: np.ndarray
    mean: np.ndarray
    cov: np.ndarray

    def cards(self, row: int) -> tuple[str, ...]:
        return tuple(s for q, i in zip(POSITIONS, self.index[row], strict=True) for s in self.combos[q][i])


@dataclass
class Club:
    name: str
    crest: str | None
    own: str  # the club as its games spell it
    games: list[dict[str, Any]]
    players: dict[str, Player]
    pro: Search | None = None
    sevens: list[tuple[Seven, float, float, float, float]] = field(
        default_factory=list
    )  # seven, full, owned, mean, started


@dataclass(frozen=True)
class Team:
    cards: tuple[str, ...]
    cost: float
    full: float
    mean: float
    cov: float


@dataclass(frozen=True)
class Seven:
    gk: str
    outs: tuple[str, ...]
    gsub: str | None
    osub: str | None

    @property
    def cards(self) -> tuple[str, ...]:
        return (self.gk, *self.outs, *(s for s in (self.gsub, self.osub) if s))


# ---- the club and its players


def club(
    name: str,
    rows: list[dict[str, Any]],
    games: Mapping[str, list[dict[str, Any]]],
    league: str,
    now: datetime,
    *,
    owned: frozenset[str],
    art: Mapping[str, str],
) -> Club | None:
    """A club's players over its finished league games of the season; a player counts only his games for this club."""
    since = season_start(now)
    played = {
        r["slug"]: [
            g
            for g in games.get(r["slug"]) or []
            if g["competition"] == league and g.get("status") in DONE and since <= as_utc(g["date"]) < now
        ]
        for r in rows
        if r.get("eur") is not None and r.get("pos") in POSITIONS
    }
    names = Counter(t for gs in played.values() for g in gs for t in (g["home"], g["away"]) if t)
    if not names:
        return None
    own = names.most_common(1)[0][0]
    calendar: dict[str, dict[str, Any]] = {}
    for gs in played.values():
        for g in gs:
            if own in (g["home"], g["away"]):
                calendar.setdefault(g["game_id"], g)
    order = sorted(calendar.values(), key=lambda g: as_utc(g["date"]))
    at = {g["game_id"]: i for i, g in enumerate(order)}
    n = len(order)
    players = {}
    for r in rows:
        if r["slug"] not in played:
            continue
        p = Player(
            slug=r["slug"],
            name=r.get("name") or r["slug"],
            pos=r["pos"],
            eur=float(r["eur"]),
            owned=r["slug"] in owned,
            art=art.get(r["slug"]) or (r.get("pic") if "/card/" in (r.get("pic") or "") else None),
            starts=np.zeros(n, bool),
            played=np.zeros(n, bool),
            mins=np.zeros(n, int),
            scores=np.zeros(n),
            xs=np.full(n, np.nan),
        )
        for g in played[r["slug"]]:
            i = at.get(g["game_id"])
            if i is None:
                continue  # a game for another club
            p.starts[i], p.played[i] = bool(g.get("started")), bool(g.get("played"))
            p.mins[i], p.scores[i] = int(g.get("mins") or 0), float(g.get("score") or 0.0)
            if g.get("sofix_x") is not None:
                p.xs[i] = float(g["sofix_x"])
        players[p.slug] = p
    crest = next((r.get("crest") for r in rows if r.get("crest")), None)
    games_out = [
        {
            "id": g["game_id"],
            "date": as_utc(g["date"]).isoformat(),
            "home": g["home"] == own,
            "opponent": g["away"] if g["home"] == own else g["home"],
        }
        for g in order
    ]
    out = Club(name=name, crest=crest, own=own, games=games_out, players=players)
    if n:
        out.pro = pro_search(out)
        out.sevens = arena_search(out)
    return out


# ---- Pro


def _top_two(team: Iterable[Player], n: int) -> tuple[np.ndarray, np.ndarray]:
    m = np.array([np.where(p.starts, p.scores, NEG) for p in team]).reshape(-1, n)
    m.sort(axis=0)
    second = m[-2] if len(m) > 1 else np.full(n, NEG)
    return m[-1], second


def pro_search(c: Club) -> Search | None:
    """Every pool of each position's leading players: the best five of its starters each game (0 when there is none)."""
    n = len(c.games)
    combos: dict[str, list[tuple[str, ...]]] = {}
    arrays: dict[str, tuple[np.ndarray, ...]] = {}
    for q in POSITIONS:
        ranked = sorted((p for p in c.players.values() if p.pos == q), key=lambda p: -p.rank)[: CANDIDATES[q]]
        cs = [x for r in SIZES[q] if r <= len(ranked) for x in itertools.combinations(ranked, r)]
        if not cs:
            return None
        tops = [_top_two(x, n) for x in cs]
        combos[q] = [tuple(p.slug for p in x) for x in cs]
        arrays[q] = (
            np.array([t[0] for t in tops]),
            np.array([t[1] for t in tops]),
            np.array([sum(p.eur for p in x) for x in cs]),
            np.array([sum(p.cost for p in x) for x in cs]),
        )
    f1, f2, ffull, fown = arrays["FWD"]
    m1, m2, mfull, mown = arrays["MID"]
    nf, nm = len(f1), len(m1)
    fi, mi = np.meshgrid(np.arange(nf), np.arange(nm), indexing="ij")
    fm_full = ffull[:, None] + mfull[None, :]
    fm_own = fown[:, None] + mown[None, :]
    f1b, f2b, m1b, m2b = f1[:, None, :], f2[:, None, :], m1[None, :, :], m2[None, :, :]
    fm_ok = (f1b > NEG / 2) & (m1b > NEG / 2)
    fm_top = np.maximum(f1b, m1b)
    fm_sum = f1b + m1b
    fm_extra = np.maximum(f2b, m2b)
    idx, full, own, mean, cov = [], [], [], [], []
    g1s, _, gfull, gown = arrays["GK"]
    d1s, d2s, dfull, down = arrays["DEF"]
    for gi in range(len(g1s)):
        for di in range(len(d1s)):
            g1, d1, d2 = g1s[gi], d1s[di], d2s[di]
            extra = np.maximum(fm_extra, d2)
            ok = fm_ok & (g1 > NEG / 2) & (d1 > NEG / 2) & (extra > NEG / 2)
            total = g1 + d1 + fm_sum + extra + CAPTAIN * np.maximum(fm_top, np.maximum(g1, d1))
            mean.append(np.where(ok, total, 0.0).mean(axis=-1).ravel())
            cov.append(ok.mean(axis=-1).ravel())
            full.append((gfull[gi] + dfull[di] + fm_full).ravel())
            own.append((gown[gi] + down[di] + fm_own).ravel())
            idx.append(np.stack([np.full(nf * nm, gi), np.full(nf * nm, di), mi.ravel(), fi.ravel()], axis=1))
    return Search(
        combos=combos,
        index=np.concatenate(idx).astype(np.int32),
        full=np.round(np.concatenate(full), 2),
        owned=np.round(np.concatenate(own), 2),
        mean=np.concatenate(mean),
        cov=np.concatenate(cov),
    )


def _frontier(cost: np.ndarray, mean: np.ndarray, ok: np.ndarray) -> list[tuple[int, float]]:
    """(row, budget it applies from), cheapest first: for any budget, the last entry whose budget fits is the pick."""
    rows = np.flatnonzero(ok)
    if not len(rows):
        return []
    rows = rows[np.lexsort((-mean[rows], cost[rows]))]
    pareto, best = [], -np.inf
    for r in rows:  # cost ascending: a row is worth keeping only if it scores more than every cheaper one
        if mean[r] > best + 1e-9:
            pareto.append(int(r))
            best = float(mean[r])
    out: list[tuple[int, float]] = []
    for p in pareto:
        pick = next(q for q in pareto if mean[q] >= NEAR * mean[p])
        if not out or out[-1][0] != pick:
            out.append((pick, float(cost[p])))
    return out


def pick(search: Search | None, *, budget: float, target: float, owned: bool) -> Team | None:
    """The team for a budget: the best score that reaches the coverage target, the cheapest within 1% of it."""
    if search is None:
        return None
    cost = search.owned if owned else search.full
    front = _frontier(cost, search.mean, (search.cov >= target - 1e-9) & (cost <= budget + 1e-9))
    if not front:
        return None
    r = front[-1][0]
    return Team(search.cards(r), float(cost[r]), float(search.full[r]), float(search.mean[r]), float(search.cov[r]))


def _five_ok(five: Iterable[Player]) -> bool:
    count = Counter(p.pos for p in five)
    return count["GK"] == 1 and all(count[q] >= 1 for q in OUTFIELD)


def _lineup(values: list[float], captain: float = CAPTAIN) -> float:
    return sum(values) + captain * max(values)


def series(c: Club, cards: Iterable[str], captain: float = CAPTAIN) -> dict[str, list[float | None]]:
    """Each game, over every valid five of the team's starters: the best, median and average score (hindsight), and the five
    Sofix's xS would have picked (what it scored, what xS said) when Sofix saved a number for every starter."""
    team = [c.players[s] for s in cards]
    out: dict[str, list[float | None]] = {k: [] for k in ("best", "median", "average", "xsReal", "xsExp")}
    for i in range(len(c.games)):
        started = [p for p in team if p.starts[i]]
        fives = [f for f in itertools.combinations(started, 5) if _five_ok(f)]
        if not fives:
            for k in out:
                out[k].append(None)
            continue
        totals = [_lineup([p.scores[i] for p in f], captain) for f in fives]
        out["best"].append(round(max(totals), 1))
        out["median"].append(round(statistics.median(totals), 1))
        out["average"].append(round(sum(totals) / len(totals), 1))
        if all(not np.isnan(p.xs[i]) for p in started):
            chosen = max(fives, key=lambda f: _lineup([p.xs[i] for p in f], captain))
            cap = max(chosen, key=lambda p: p.xs[i])
            out["xsReal"].append(round(sum(p.scores[i] for p in chosen) + captain * cap.scores[i], 1))
            out["xsExp"].append(round(_lineup([p.xs[i] for p in chosen], captain), 1))
        else:
            out["xsReal"].append(None)
            out["xsExp"].append(None)
    return out


# ---- Arena


def _arena(c: Club, seven: Seven) -> tuple[np.ndarray, np.ndarray, np.ndarray, list[list[Player]]]:
    """Each game's five after subs, its scores (0 for one who did not play), whether a sub came in, whether all five started."""
    n = len(c.games)
    gk, gsub = c.players[seven.gk], c.players[seven.gsub] if seven.gsub else None
    outs = [c.players[s] for s in seven.outs]
    osub = c.players[seven.osub] if seven.osub else None
    fives, sub_in, all_started = [], np.zeros(n, bool), np.zeros(n, bool)
    for i in range(n):
        keeper = gsub if (not gk.played[i] and gsub is not None and gsub.played[i]) else gk
        five = [keeper, *outs]
        missing = [p for p in outs if not p.played[i]]
        if missing and osub is not None and osub.played[i]:
            swapped = [keeper, *(p for p in outs if p is not missing[0]), osub]
            if _five_ok(swapped):
                five = swapped
        sub_in[i] = keeper is not gk or osub in five
        all_started[i] = all(p.starts[i] for p in five)
        fives.append(five)
    scores = np.array([[p.scores[i] if p.played[i] else 0.0 for p in f] for i, f in enumerate(fives)])
    return scores, sub_in, all_started, fives


def arena_series(c: Club, seven: Seven, captain: float = CAPTAIN) -> dict[str, list[Any]]:
    scores, sub_in, all_started, fives = _arena(c, seven)
    out: dict[str, list[Any]] = {k: [] for k in ("best", "median", "average", "xsReal", "xsExp")}
    for i, row in enumerate(scores):
        by_captain = [float(row.sum() + captain * v) for v in row]
        out["best"].append(round(max(by_captain), 1))
        out["median"].append(round(statistics.median(by_captain), 1))
        out["average"].append(round(sum(by_captain) / len(by_captain), 1))
        xs = [p.xs[i] for p in fives[i]]
        if all(not np.isnan(x) for x in xs):
            cap = int(np.argmax(xs))
            out["xsReal"].append(round(float(row.sum() + captain * row[cap]), 1))
            out["xsExp"].append(round(_lineup(xs, captain), 1))
        else:
            out["xsReal"].append(None)
            out["xsExp"].append(None)
    out["subIn"] = [bool(x) for x in sub_in]
    out["started"] = [bool(x) for x in all_started]
    return out


def arena_search(c: Club) -> list[tuple[Seven, float, float, float, float]]:
    """Every seven of the club's usual keeper, four outfielders (DEF, MID and FWD among them), a keeper sub and an outfield
    sub from the leading players: (seven, price, price to buy, average score with the best captain, share all five started)."""
    keepers = sorted((p for p in c.players.values() if p.pos == "GK"), key=lambda p: -p.rank)[:3]
    outs = sorted((p for p in c.players.values() if p.pos in OUTFIELD), key=lambda p: -p.rank)[:ARENA_OUTFIELD]
    if not keepers:
        return []
    gk = keepers[0]
    tried = []
    for four in itertools.combinations(outs, 4):
        if not all(any(p.pos == q for p in four) for q in OUTFIELD):
            continue
        rest = [o for o in outs if o not in four]
        for gsub in [*keepers[1:], None]:
            for osub in [*rest, None]:
                seven = Seven(
                    gk.slug, tuple(p.slug for p in four), gsub.slug if gsub else None, osub.slug if osub else None
                )
                scores, _, started, _ = _arena(c, seven)
                mean = float((scores.sum(axis=1) + CAPTAIN * scores.max(axis=1)).mean())
                members = [c.players[s] for s in seven.cards]
                tried.append(
                    (seven, sum(p.eur for p in members), sum(p.cost for p in members), mean, float(started.mean()))
                )
    return tried


def arena_pick(c: Club, *, budget: float, owned: bool) -> Seven | None:
    if not c.sevens:
        return None
    cost = np.array([s[2] if owned else s[1] for s in c.sevens])
    front = _frontier(cost, np.array([s[3] for s in c.sevens]), cost <= budget + 1e-9)
    return c.sevens[front[-1][0]][0] if front else None


# ---- boards and prizes


def ladder(values: Iterable[float | None], board: list[Step]) -> dict[str, Any]:
    """One try a game: a clear wins the step and climbs, a miss sends the board back to its first step."""
    level, path, clears, cash, essence, top = 0, [], 0, 0.0, 0, 0
    for v in values:
        target, c, e = board[level]
        if v is None:
            path.append({"target": target, "res": "skip"})
            continue
        if v >= target:
            path.append({"target": target, "res": "clear"})
            clears, cash, essence, top = clears + 1, cash + c, essence + e, max(top, target)
            level = (level + 1) % len(board)
        else:
            path.append({"target": target, "res": "miss", "back": level > 0})
            level = 0
    return {"path": path, "clears": clears, "cash": cash, "essence": essence, "top": top}


def boards(raw: list[dict[str, Any]] | None) -> dict[str, tuple[list[Step], float]]:
    """Each league's Limited Pro board, every step (cleared ones too) and its captain bonus, from the owner's boards."""
    out: dict[str, tuple[list[Step], float]] = {}
    for board in raw or []:
        steps = sorted((s for s in board.get("steps") or [] if "target" in s), key=lambda s: int(s["level"]))
        if not steps:
            continue
        rules = {r.get("key"): r for r in steps[0].get("displayedTypedRules") or []}
        if "limited" not in ((rules.get("Scarcity") or {}).get("rarities") or ()):
            continue
        leagues = {c.get("slug") for c in (rules.get("Competitions") or {}).get("competitions") or []}
        if len(leagues) != 1 or (league := next(iter(leagues))) not in LEAGUES:
            continue
        captain = float((steps[0].get("engineConfiguration") or {}).get("captain") or CAPTAIN)
        out[league] = ([(int(s["target"]), *_prize(s, "limited")) for s in steps], captain)
    return out


def pay_lines(bars: Mapping[str, Any] | None, league: str) -> list[dict[str, Any]]:
    """The score each prize of the league's Limited in-season Arena took (Targets page, `reward_bars`), lowest first."""
    key = f"{LEAGUES[league][2]} | Limited"
    comp = next((c for c in (bars or {}).get("competitions") or [] if c.get("key") == key), None)
    lines = [
        {"score": t["bar"], "cash": t["cash"], "essence": t["essence"]}
        for t in (comp or {}).get("ladder") or []
        if t.get("bar") is not None and (t.get("cash") or t.get("essence"))
    ]
    return sorted(lines, key=lambda x: x["score"])


# ---- the published block


def _player_out(p: Player) -> dict[str, Any]:
    return {
        "name": p.name,
        "pos": p.pos,
        "eur": round(p.eur, 2),
        "owned": p.owned,
        "art": p.art,
        "played": "".join("S" if s else "B" if b else "-" for s, b in zip(p.starts, p.played, strict=True)),
        "scores": [round(float(x), 1) for x in p.scores],
        "mins": [int(x) for x in p.mins],
    }


def club_block(c: Club, board: list[Step] | None, captain: float) -> dict[str, Any]:
    teams: dict[tuple[str, ...], dict[str, Any]] = {}
    pro: dict[str, dict[str, list[dict[str, Any]]]] = {}

    def team_id(cards: tuple[str, ...], full: float, cost_owned: float, mean: float, cov: float) -> int:
        key = tuple(sorted(cards))
        if key not in teams:
            s = series(c, cards, captain)
            lad = ladder(s["best"], board) if board else None
            teams[key] = {
                "id": len(teams),
                "cards": list(cards),
                "full": round(float(full), 2),
                "toBuy": round(float(cost_owned), 2),
                "mean": round(float(mean), 1),
                "cov": round(float(cov), 3),
                "over": sum(1 for v in s["best"] if v is not None and board and v >= board[0][0]),
                **s,
                "ladder": {k: lad[k] for k in ("clears", "cash", "essence", "top")} if lad else None,
            }
        return int(teams[key]["id"])

    if c.pro is not None:
        for target in TARGETS:
            lanes: dict[str, list[dict[str, Any]]] = {}
            for lane, cost in (("full", c.pro.full), ("owned", c.pro.owned)):
                front = _frontier(cost, c.pro.mean, c.pro.cov >= target - 1e-9)
                lanes[lane] = [
                    {
                        "id": team_id(c.pro.cards(r), c.pro.full[r], c.pro.owned[r], c.pro.mean[r], c.pro.cov[r]),
                        "from": round(b, 2),
                    }
                    for r, b in front
                ]
            pro[str(target)] = lanes
    sevens: dict[Seven, dict[str, Any]] = {}
    arena: dict[str, list[dict[str, Any]]] = {}
    if c.sevens:
        means = np.array([s[3] for s in c.sevens])
        for lane, k in (("full", 1), ("owned", 2)):
            cost = np.array([s[k] for s in c.sevens])
            entries = []
            for r, b in _frontier(cost, means, np.ones(len(cost), bool)):
                seven, full, own, mean, started = c.sevens[r]
                if seven not in sevens:
                    sevens[seven] = {
                        "id": len(sevens),
                        "gk": seven.gk,
                        "outs": list(seven.outs),
                        "gsub": seven.gsub,
                        "osub": seven.osub,
                        "full": round(float(full), 2),
                        "toBuy": round(float(own), 2),
                        "mean": round(float(mean), 1),
                        "started": round(float(started), 3),
                        **arena_series(c, seven, captain),
                    }
                entries.append({"id": sevens[seven]["id"], "from": round(b, 2)})
            arena[lane] = entries
    used = {s for t in teams for s in t} | {s for seven in sevens for s in seven.cards}
    return {
        "club": c.name,
        "crest": c.crest,
        "games": c.games,
        "players": {s: _player_out(c.players[s]) for s in sorted(used)},
        "teams": sorted(teams.values(), key=lambda t: t["id"]),
        "pro": pro,
        "sevens": sorted(sevens.values(), key=lambda t: t["id"]),
        "arena": arena,
    }


def league_block(
    league: str,
    rows: list[dict[str, Any]],
    games: Mapping[str, list[dict[str, Any]]],
    now: datetime,
    *,
    owned: frozenset[str],
    art: Mapping[str, str],
    board: list[Step] | None,
    lines: list[dict[str, Any]],
    captain: float = CAPTAIN,
) -> dict[str, Any]:
    by_club: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for r in rows:
        if r.get("club"):
            by_club[r["club"]].append(r)
    clubs = [
        x for name, rs in sorted(by_club.items()) if (x := club(name, rs, games, league, now, owned=owned, art=art))
    ]
    crests = {x.own: (x.name, x.crest) for x in clubs}
    out = []
    for x in clubs:
        for g in x.games:  # the opponent as the league page names it, with its crest
            name, crest = crests.get(g["opponent"], (g["opponent"], None))
            g.update(opponent=name, crest=crest)
        if x.games:
            out.append(club_block(x, board, captain))
    code, name, _ = LEAGUES[league]
    return {
        "version": VERSION,
        "generatedAt": now.isoformat(),
        "league": league,
        "code": code,
        "name": name,
        "season": season_start(now).year,
        "targets": list(TARGETS),
        "captain": captain,
        "board": [{"target": t, "cash": c, "essence": e} for t, c, e in board] if board else None,
        "arenaLines": lines,
        "clubs": out,
    }


# ---- the job's part


def load_games(db: Session, players: set[str], since: datetime) -> dict[str, list[dict[str, Any]]]:
    """Each player's games since `since`, without the detailed scores (from the local copy in the GitHub jobs)."""
    view = games_mirror.view(db)
    cols = (
        PlayerGame.player,
        PlayerGame.game_id,
        PlayerGame.date,
        PlayerGame.competition,
        PlayerGame.home,
        PlayerGame.away,
        PlayerGame.status,
        PlayerGame.score,
        PlayerGame.played,
        PlayerGame.started,
        PlayerGame.mins,
        PlayerGame.sofix_x,
    )
    out: dict[str, list[dict[str, Any]]] = defaultdict(list)
    names = sorted(players)
    for i in range(0, len(names), 500):
        query = select(*cols).where(PlayerGame.player.in_(names[i : i + 500]), PlayerGame.date >= since)
        for row in view.execute(query):
            out[row.player].append({k: getattr(row, k) for k in row._fields if k != "player"})
    return out


def due(db: Session, now: datetime) -> bool:
    row = kept_blocks.read(db, f"{PREFIX}LALIGA")
    at = (row.payload or {}).get("generatedAt") if row and isinstance(row.payload, dict) else None
    return at is None or now - datetime.fromisoformat(at) >= EVERY


def publish(
    db: Session,
    now: datetime,
    *,
    markets: Mapping[str, list[dict[str, Any]]],
    collection: list[dict[str, Any]],
    art: Mapping[str, str],
    raw_boards: list[dict[str, Any]] | None,
    bars: Mapping[str, Any] | None,
    write: bool = True,
) -> dict[str, Any]:
    """`markets`: league slug -> its players' rows (slug, name, pos, club, crest, eur, pic). Writes `squads:<code>`."""
    owned = frozenset(
        c["player"] for c in collection if c.get("inSeason") and c.get("rarity") == "limited" and c.get("player")
    )
    since = season_start(now)
    games = load_games(db, {r["slug"] for rows in markets.values() for r in rows if r.get("slug")}, since)
    db.rollback()
    found = boards(raw_boards)
    summary: dict[str, Any] = {}
    for league, rows in markets.items():
        board, captain = found.get(league, (None, CAPTAIN))
        block = league_block(
            league, rows, games, now, owned=owned, art=art, board=board, lines=pay_lines(bars, league), captain=captain
        )
        summary[block["code"]] = {"clubs": len(block["clubs"]), "board": board is not None}
        if write:
            put(db, f"{PREFIX}{block['code']}", block, now)
    return summary


def foreign_rows(index: Mapping[str, Any] | None) -> list[dict[str, Any]]:
    """A kept foreign league index (`league_squads:<code>`) as market rows."""
    return [row for people in ((index or {}).get("clubs") or {}).values() for row in people]
