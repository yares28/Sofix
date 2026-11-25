"""Squads (plans/squad-prices.md, Q1): what a club team that plays every week costs, in Pro or in the Arena.

For each club of LaLiga, the Premier League, the Bundesliga and Ligue 1, from this season's league games of its players:

- **Pro** is entered after the teamsheets, so a team is a pool of Limited cards from which, each game, the best five of
  those who started are played (GK, DEF, MID, FWD and one more outfielder, captain +50%). A game without such a five
  counts 0. The team for a budget is the one with the best average score per game that still fields five starters in
  the coverage target's share of games; among teams within 1% of that score, the cheapest (no card bought for a point).
- **Arena** is entered before the teamsheets: seven cards (five, a keeper sub and an outfield sub), where a sub only
  comes in for a player who did not play at all. Its team is the best average score inside the budget.

Prices (Q3) are what the cards cost now: the cheapest listed Limited card of each player (`lowestPriceAnyCard`), Sorare's market
value when none is listed ("est."). Sorare lets an in-season lineup take one classic card (an older season's, often far cheaper):
a team buys at most one, the one that saves most, so every five it fields is allowed. With "count my cards" a card the owner
already has costs nothing, and a classic card of his can be that one. Each day's prices are kept (`squad_prices:<code>`).
Each club's teams are published as frontiers (cheapest first): the page takes the last one whose `from` fits the budget,
so it never searches. Per team, each game's best, median and average five (hindsight) and Sofix's pick before kickoff
(what it scored and what xS said) where Sofix saved its numbers. Runs once a day in the refresh's Sorare step.
"""

from __future__ import annotations

import itertools
import logging
import re
import statistics
import unicodedata
from collections import Counter, defaultdict
from collections.abc import Iterable, Mapping
from dataclasses import dataclass, field, replace
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
from app.sorare.client import SorareClient, SorareError
from app.sorare.player_games import season_start
from app.sorare.pro import _prize
from app.sorare.sync import _asking

logger = logging.getLogger(__name__)

PREFIX = "squads:"
PRICES = "squad_prices:"
NEXT = "squads_next:"
PAIRS = "squads_pairs:"  # two clubs: every pair of a league, for the picker (R2 only, written by the nightly job)
PAIR = "squads_pair:"  # one pair's teams: squads_pair:<code>:<pair id> (R2 only)
PAIRS_NEXT, PAIR_NEXT = "squads_pairs_next:", "squads_pair_next:"  # the same, picked from last season's record
ANY, ANY_NEXT = "squads_any:", "squads_any_next:"  # Any clubs: one block a league (R2 only, the nightly job)
VERSION = 2
POSITIONS = ("GK", "DEF", "MID", "FWD")
OUTFIELD = ("DEF", "MID", "FWD")
TARGETS = (0.7, 0.8, 0.9, 1.0)
CAPTAIN = 0.5  # Sorare's captain bonus in Pro and the Arena (`engineConfiguration.captain`); a board's own value wins
# An in-season card scores +5% in Pro and the In-Season Arena (`engineConfiguration.season`, 24 Nov 2026; a board's own
# value wins); a classic card does not. The level bonus (`grade`, 1% a card level) is left out: a card on sale has no level
# Sofix knows. The captain adds his raw score times the captain bonus, as the planner counts it (planner.py).
SEASON = 0.05
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
_OFFER = (
    "liveSingleSaleOffer { receiverSide { amounts { eurCents gbpCents usdCents wei } } } "
    "livePrimaryOffer { price { eurCents gbpCents usdCents wei } }"
)
PRICE_QUERY = (
    "query($s:[String!]!){ players(slugs: $s) { slug ... on Player { "
    f"ins: lowestPriceAnyCard(rarity: limited, inSeason: true) {{ {_OFFER} }} "
    f"cla: lowestPriceAnyCard(rarity: limited, inSeason: false) {{ {_OFFER} }} "
    "commonPlayer(rarity: limited) { a: marketValue(rarity: limited, seasonEligibility: IN_SEASON) { eurCents } } } } "
    "config { exchangeRate { ethRates { eurCents gbpCents usdCents } } } }"
)
"""One `players(slugs:)` root (Sorare refuses a root field twice): each player's cheapest listed in-season and classic Limited
card and his in-season market value. A player costs about 40 of the complexity a question may have: 500 without a key, 30000
with one (read 24 Nov 2026)."""
PRICE_BATCH = (12, 600)

Price = dict[str, float | None]  # in: listed in-season euros, inEst: in-season market value, cl: listed classic euros

Step = tuple[int, float, int]  # target, cash, essence


@dataclass
class Player:
    slug: str
    name: str
    pos: str
    eur: float  # an in-season card now: its cheapest listing, else Sorare's market value
    owned: bool
    art: str | None
    starts: np.ndarray
    played: np.ndarray
    mins: np.ndarray
    scores: np.ndarray
    xs: np.ndarray
    listed: bool = False
    classic: float | None = None  # the cheapest listed classic card, None when none is for sale
    owned_classic: bool = False
    came_from: str | None = None  # start of season: the club he played for last season, when not this one
    mine: np.ndarray | None = None  # two clubs: the tries that are his club's games

    @property
    def cost(self) -> float:
        return 0.0 if self.owned else self.eur

    def saving(self, owned: bool) -> float:
        """What buying him as the team's one classic card saves: his own classic is free when your cards count, and an
        in-season card of his you own saves nothing more."""
        if owned and self.owned:
            return 0.0
        if owned and self.owned_classic:
            return self.eur
        return max(0.0, self.eur - self.classic) if self.classic is not None else 0.0

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
    rounds: list[int] | None = None  # two clubs: each game's round (each club's game is a try of that round)
    season: float = 0.0  # the in-season bonus its scores are counted with (`SEASON`)
    blind: bool = False  # Any clubs: Sofix's xS pick is made before most teamsheets (see `series`)
    arena_club: Club | None = None  # two clubs: the same players round by round, which the Arena plays


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
    prices: Mapping[str, Price] | None = None,
    owned_classic: frozenset[str] = frozenset(),
    season: float = 0.0,
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
        p = _player(r, n, owned=owned, art=art, prices=prices, owned_classic=owned_classic)
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
    out = Club(name=name, crest=crest, own=own, games=games_out, players=players, season=season)
    if n:
        out.pro = pro_search(out)
        out.sevens = arena_search(out)
    return out


def _player(
    r: Mapping[str, Any],
    n: int,
    *,
    owned: frozenset[str],
    art: Mapping[str, str],
    prices: Mapping[str, Price] | None,
    owned_classic: frozenset[str],
) -> Player:
    """A market row as a player over `n` games, priced as `prices` says (`eur`, his market value, when it says nothing)."""
    price = (prices or {}).get(r["slug"]) or {}
    listed = price.get("in")
    return Player(
        slug=r["slug"],
        name=r.get("name") or r["slug"],
        pos=r["pos"],
        eur=float(listed if listed is not None else price.get("inEst") or r["eur"]),
        listed=listed is not None,
        classic=price.get("cl"),
        owned_classic=r["slug"] in owned_classic,
        owned=r["slug"] in owned,
        art=art.get(r["slug"]) or (r.get("pic") if "/card/" in (r.get("pic") or "") else None),
        starts=np.zeros(n, bool),
        played=np.zeros(n, bool),
        mins=np.zeros(n, int),
        scores=np.zeros(n),
        xs=np.full(n, np.nan),
    )


# ---- the start of season: every player at the club now, with his own record last season at any club of the league

Round = tuple[int, int, bool]


def rnd(at: datetime) -> Round:
    """A league round: in windows that start on Friday, Friday to Monday is a weekend and Tuesday to Thursday a midweek."""
    day = as_utc(at).date()
    year, week, _ = (day - timedelta(days=4)).isocalendar()
    return (year, week, day.weekday() in (1, 2, 3))


def rounds_of(games: Mapping[str, list[dict[str, Any]]], league: str, start: datetime, end: datetime) -> list[Round]:
    """The rounds of a finished season: the weekends and midweeks in which at least half of its clubs played. A lone
    rearranged game is not a round of its own (its players simply did not play that round)."""
    teams: dict[Round, set[str]] = defaultdict(set)
    for gs in games.values():
        for g in gs:
            if g["competition"] == league and g.get("status") in DONE and start <= as_utc(g["date"]) < end:
                teams[rnd(g["date"])].update(t for t in (g["home"], g["away"]) if t)
    clubs = set().union(*teams.values()) if teams else set()
    return sorted(r for r, ts in teams.items() if len(ts) * 2 >= len(clubs))


def next_club(
    name: str,
    rows: list[dict[str, Any]],
    games: Mapping[str, list[dict[str, Any]]],
    league: str,
    *,
    rounds: list[Round],
    start: datetime,
    end: datetime,
    own: str | None,
    owned: frozenset[str],
    art: Mapping[str, str],
    prices: Mapping[str, Price] | None = None,
    owned_classic: frozenset[str] = frozenset(),
    season: float = 0.0,
) -> tuple[Club, list[str]]:
    """The club's players now over last season's rounds, each with his own games for whichever club of the league he played
    for; and the players with no game in the league last season (new to it: listed, never guessed)."""
    at = {r: i for i, r in enumerate(rounds)}
    n = len(rounds)
    players, newcomers = {}, []
    calendar: dict[int, dict[str, Any]] = {}
    for r in rows:
        if r.get("eur") is None or r.get("pos") not in POSITIONS:
            continue
        mine = [
            g
            for g in games.get(r["slug"]) or []
            if g["competition"] == league and g.get("status") in DONE and start <= as_utc(g["date"]) < end
        ]
        if not mine:
            newcomers.append(r["slug"])
            continue
        p = _player(r, n, owned=owned, art=art, prices=prices, owned_classic=owned_classic)
        sides = Counter(t for g in mine for t in (g["home"], g["away"]) if t)
        usual = sides.most_common(1)[0][0]
        p.came_from = usual if usual != own else None
        for g in sorted(mine, key=lambda g: as_utc(g["date"])):
            i = at.get(rnd(g["date"]))
            if i is None or p.played[i] or p.starts[i]:
                continue  # a lone rearranged game, or a second game in one round: the first counts
            p.starts[i], p.played[i] = bool(g.get("started")), bool(g.get("played"))
            p.mins[i], p.scores[i] = int(g.get("mins") or 0), float(g.get("score") or 0.0)
            if g.get("sofix_x") is not None:
                p.xs[i] = float(g["sofix_x"])
            if own in (g["home"], g["away"]):
                calendar.setdefault(i, g)
        players[p.slug] = p
    when: dict[int, datetime] = {}
    for gs in games.values():
        for g in gs:
            i = at.get(rnd(g["date"])) if g["competition"] == league and start <= as_utc(g["date"]) < end else None
            if i is not None:
                when[i] = min(when.get(i, as_utc(g["date"])), as_utc(g["date"]))
    games_out = []
    for i in range(n):
        cal = calendar.get(i)
        games_out.append(
            {
                "id": f"R{i + 1}",
                "date": (as_utc(cal["date"]) if cal else when.get(i, start)).isoformat(),
                "home": bool(cal and cal["home"] == own),
                "opponent": (cal["away"] if cal["home"] == own else cal["home"]) if cal else "",
            }
        )
    crest = next((r.get("crest") for r in rows if r.get("crest")), None)
    out = Club(name=name, crest=crest, own=own or name, games=games_out, players=players, season=season)
    if n and players:
        out.pro = pro_search(out)
        out.sevens = arena_search(out)
    return out, newcomers


def _proof(c: Club | None, cards: Iterable[str], board: list[Step] | None, captain: float) -> dict[str, Any]:
    """How a team bought before the first game did this season: its best five a game (a game without five counts 0)."""
    members = [s for s in cards if c is not None and s in c.players]
    if c is None or not c.games or not members:
        return {"games": 0, "five": 0, "mean": None, "clears": 0}
    best = series(c, members, captain, classic_of(c, members, owned=True))["best"]
    return {
        "games": len(best),
        "five": sum(1 for v in best if v is not None),
        "mean": round(float(sum(v or 0.0 for v in best)) / len(best), 1),
        "clears": ladder(best, board)["clears"] if board else 0,
    }


def _next_clubs(
    league: str,
    rows: list[dict[str, Any]],
    games: Mapping[str, list[dict[str, Any]]],
    now: datetime,
    *,
    owned: frozenset[str],
    art: Mapping[str, str],
    prices: Mapping[str, Price] | None,
    owned_classic: frozenset[str],
    season: float,
) -> list[tuple[str, list[dict[str, Any]], Club | None, Club, list[str], str | None]]:
    """Each club now over last season's rounds: (name, its rows, this season's club, last season's, newcomers, the club as
    last season's games spell it). Empty when last season's games are not kept for this league."""
    end = season_start(now)
    start = end.replace(year=end.year - 1)
    rounds = rounds_of(games, league, start, end)
    if not rounds:
        return []
    by_club: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for r in rows:
        if r.get("club"):
            by_club[r["club"]].append(r)
    out = []
    for name, rs in sorted(by_club.items()):
        this = club(
            name,
            rs,
            games,
            league,
            now,
            owned=owned,
            art=art,
            prices=prices,
            owned_classic=owned_classic,
            season=season,
        )
        own = this.own if this else None
        if own is None:  # before the first game: the club as last season's games spell it, if it was in the league
            sides = Counter(
                t
                for r in rs
                for g in games.get(r["slug"]) or []
                if g["competition"] == league and start <= as_utc(g["date"]) < end
                for t in (g["home"], g["away"])
                if t
            )
            own = sides.most_common(1)[0][0] if sides else None
        c, newcomers = next_club(
            name,
            rs,
            games,
            league,
            rounds=rounds,
            start=start,
            end=end,
            own=own,
            owned=owned,
            art=art,
            prices=prices,
            owned_classic=owned_classic,
            season=season,
        )
        if c.players:
            out.append((name, rs, this, c, newcomers, own))
    return out


def next_block(
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
    prices: Mapping[str, Price] | None = None,
    owned_classic: frozenset[str] = frozenset(),
    season: float = 0.0,
    logo: str | None = None,
    grid: Mapping[str, Any] | None = None,
) -> dict[str, Any] | None:
    """The start-of-season view: each club's team picked from last season's record, as it would be bought before the first
    game, and how that team did this season (`proof`). None when last season's games are not kept for this league."""
    end = season_start(now)
    start = end.replace(year=end.year - 1)
    built = _next_clubs(
        league, rows, games, now, owned=owned, art=art, prices=prices, owned_classic=owned_classic, season=season
    )
    if not built:
        return None
    out = []
    names: dict[str, tuple[str, str | None]] = {}  # a club as games spell it: its name and crest, for the opponents
    fixtures = runs(grid, [this for _, _, this, _, _, _ in built if this is not None])
    for name, rs, this, c, newcomers, own in built:
        # lane "0.0": the best team inside a budget whatever its coverage, shown with it when none reaches the target
        entry = club_block(c, board, captain, targets=(*TARGETS, 0.0))
        for slug, p in entry["players"].items():
            p["from"] = c.players[slug].came_from
        for team in entry["teams"]:
            team["proof"] = _proof(this, team["cards"], board, captain)
        entry["run"] = fixtures.get(name, [])
        entry["newcomers"] = [
            {
                "slug": r["slug"],
                "name": r.get("name") or r["slug"],
                "pos": r["pos"],
                "art": art.get(r["slug"]) or (r.get("pic") if "/card/" in (r.get("pic") or "") else None),
            }
            for r in rs
            if r["slug"] in newcomers
        ]
        entry["promoted"] = (
            not any(
                own in (g["home"], g["away"])
                for gs in games.values()
                for g in gs
                if g["competition"] == league and start <= as_utc(g["date"]) < end
            )
            if own
            else True
        )
        if own:
            names[own] = (name, entry["crest"])
        out.append(entry)
    for (
        entry
    ) in out:  # last season's opponents by today's names; a club no longer in the league keeps its own, no crest
        for g in entry["games"]:
            g["opponent"], g["crest"] = names.get(g["opponent"], (g["opponent"], None))
        for p in entry["players"].values():
            p["from"] = names.get(p["from"], (p["from"], None))[0] if p["from"] else None
    code, name, _ = LEAGUES[league]
    listed = sum(1 for p in (prices or {}).values() if p.get("in") is not None)
    return {
        "version": VERSION,
        "generatedAt": now.isoformat(),
        "league": league,
        "code": code,
        "name": name,
        "season": end.year,
        "record": f"{start.year}/{str(end.year)[2:]}",
        "rounds": len(built[0][3].games),
        "cardsOut": listed > 0,  # before Sorare releases the season's cards no in-season card is listed at all
        "targets": list(TARGETS),
        "captain": captain,
        "seasonBonus": season,
        "logo": logo,
        "board": [{"target": t, "cash": c, "essence": e} for t, c, e in board] if board else None,
        "arenaLines": lines,
        "clubs": out,
    }


# ---- Any clubs: one best team a league (the owner, 25 Nov 2026: "Option A"), any five of a matchday in one lineup ("B": a
# Pro lineup may mix games until its first player kicks off; only 7% of this season's LaLiga games have another within an hour)

POOL = {"GK": 8, "DEF": 20, "MID": 20, "FWD": 16}  # each position's leading players of the league the search draws from
ANY_BUDGETS = (
    5,
    10,
    15,
    20,
    25,
    30,
    40,
    50,
    60,
    80,
    100,
    150,
)  # budgets the search climbs to; the frontier fills between
ANY_STEPS = 40  # moves a search may make before it settles


def _score(c: Club, team: tuple[str, ...], cap: float) -> tuple[float, float]:
    """A team's average score a matchday and its share of matchdays with a valid five (as `pro_search` counts it)."""
    n = len(c.games)
    tops: dict[str, tuple[np.ndarray, np.ndarray]] = {}
    for q in POSITIONS:
        members = [c.players[s] for s in team if c.players[s].pos == q]
        tops[q] = _top_two(members, n, 1 + c.season) if members else (np.full(n, NEG), np.full(n, NEG))
    (g1, _), (d1, d2), (m1, m2), (f1, f2) = (tops[q] for q in POSITIONS)
    extra = np.maximum(np.maximum(d2, m2), f2)
    ok = (g1 > NEG / 2) & (d1 > NEG / 2) & (m1 > NEG / 2) & (f1 > NEG / 2) & (extra > NEG / 2)
    total = g1 + d1 + m1 + f1 + extra + cap * np.maximum(np.maximum(g1, d1), np.maximum(m1, f1))
    return float(np.where(ok, total, 0.0).mean()), float(ok.mean())


def _sized(c: Club, team: tuple[str, ...]) -> bool:
    """No bigger than a one-club team may be (`SIZES`: up to 3 keepers, 4 defenders, 4 midfielders, 3 forwards): the owner's
    "don't double the number of players" for two clubs, held for any clubs too."""
    count = Counter(c.players[s].pos for s in team)
    return all(count[q] <= max(SIZES[q]) for q in POSITIONS)


def _cost(c: Club, team: tuple[str, ...], owned: bool) -> float:
    members = [c.players[s] for s in team]
    base = sum(p.cost if owned else p.eur for p in members)
    return base - max((p.saving(owned) for p in members), default=0.0)


def any_search(c: Club) -> Search | None:
    """A local search, the whole league being too many teams to try: for each lane, coverage target and budget step, start
    from the best five the budget buys, then add, drop or swap one of the league's leading players at a time while it lifts
    the score a matchday at the target's coverage, until no move does. Every team it settles on joins the frontier."""
    cap = CAPTAIN / (1 + c.season)
    pool = {
        q: [p.slug for p in sorted((p for p in c.players.values() if p.pos == q), key=lambda p: -p.rank)[: POOL[q]]]
        for q in POSITIONS
    }
    if not all(pool.values()):
        return None
    cands = [s for q in POSITIONS for s in pool[q]]
    seen: dict[tuple[str, ...], tuple[float, float]] = {}

    def score(team: tuple[str, ...]) -> tuple[float, float]:
        key = tuple(sorted(team))
        if key not in seen:
            seen[key] = _score(c, key, cap)
        return seen[key]

    settled: set[tuple[str, ...]] = set()
    for owned in (False, True):
        for target in (*TARGETS, 0.0):
            for budget in ANY_BUDGETS:

                def value(team: tuple[str, ...]) -> float:
                    mean, cov = score(team)
                    return (1e6 if cov >= target - 1e-9 else cov * 1e3) + mean  # noqa: B023 - used in this pass

                team: tuple[str, ...] = ()
                for q in (*POSITIONS, "OUT"):  # a first five: each position's best that still fits
                    options = [s for s in (pool[q] if q != "OUT" else cands) if s not in team]
                    if q == "OUT":
                        options = [s for s in options if c.players[s].pos in OUTFIELD]
                    fits = [s for s in options if _cost(c, (*team, s), owned) <= budget + 1e-9]
                    if fits:
                        team = (*team, max(fits, key=lambda s: c.players[s].rank))
                for _ in range(ANY_STEPS):
                    moves = [(*team, s) for s in cands if s not in team]
                    moves += [tuple(x for x in team if x != out) for out in team]
                    moves += [
                        tuple(s if x == out else x for x in team)
                        for out in team
                        for s in pool[c.players[out].pos]
                        if s not in team
                    ]
                    moves = [m for m in moves if _cost(c, m, owned) <= budget + 1e-9 and _sized(c, m)]
                    best = max(moves, key=value, default=None)
                    if best is None or value(best) <= value(team) + 1e-9:
                        break
                    team = best
                if team:
                    settled.add(tuple(sorted(team)))
    if not settled:
        return None
    teams = sorted(settled)
    combos: dict[str, list[tuple[str, ...]]] = {q: [] for q in POSITIONS}
    index = []
    for team in teams:
        row = []
        for q in POSITIONS:
            part = tuple(s for s in team if c.players[s].pos == q)
            if part not in combos[q]:
                combos[q].append(part)
            row.append(combos[q].index(part))
        index.append(row)
    return Search(
        combos=combos,
        index=np.array(index, dtype=np.int32),
        full=np.round(np.array([_cost(c, t, False) for t in teams]), 2),
        owned=np.round(np.array([_cost(c, t, True) for t in teams]), 2),
        mean=np.array([score(t)[0] for t in teams]),
        cov=np.array([score(t)[1] for t in teams]),
    )


def any_block(
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
    prices: Mapping[str, Price] | None = None,
    owned_classic: frozenset[str] = frozenset(),
    season: float = 0.0,
    logo: str | None = None,
    start_of_season: bool = False,
) -> dict[str, Any] | None:
    """Any clubs: the league's best team for each budget from all its players, every matchday (a weekend or a midweek) one
    lineup of any five who started, each card with his club. This season, or with `start_of_season` from last season's
    record. None when the league has no matchday in that span."""
    end = season_start(now)
    start, stop = (end.replace(year=end.year - 1), end) if start_of_season else (end, now)
    rounds = rounds_of(games, league, start, stop)
    if not rounds:
        return None
    c, _ = next_club(
        "Any clubs",
        [r for r in rows if r.get("club")],
        games,
        league,
        rounds=rounds,
        start=start,
        end=stop,
        own=None,
        owned=owned,
        art=art,
        prices=prices,
        owned_classic=owned_classic,
        season=season,
    )
    c.blind, c.pro = True, any_search(c)
    if c.pro is None:
        return None
    entry = club_block(c, board, captain, targets=(*TARGETS, 0.0))
    crests = {r["club"]: r.get("crest") for r in rows if r.get("club")}
    for g in entry["games"]:  # a matchday of the whole league: no one opponent
        g.setdefault("crest", None)
    for slug, p in entry["players"].items():
        p["from"] = c.players[slug].came_from
        p["crest"] = crests.get(next((r["club"] for r in rows if r.get("slug") == slug), ""))
    code, name, _ = LEAGUES[league]
    return {
        "version": VERSION,
        "generatedAt": now.isoformat(),
        "league": league,
        "code": code,
        "name": name,
        "season": end.year,
        "record": f"{start.year}/{str(start.year + 1)[2:]}",
        "rounds": len(rounds),
        "targets": list(TARGETS),
        "captain": captain,
        "seasonBonus": season,
        "logo": logo,
        "board": [{"target": t, "cash": c_, "essence": e} for t, c_, e in board] if board else None,
        "arenaLines": lines,
        "clubs": [entry],
    }


# ---- the fixture run (Q6): each club's next league games with the fixture grid's difficulty

RUN = 6  # games ahead, as the plan says ("the next 6 league games of the club")
SWAPS = 2  # players past each position's search candidates that the page can swap in


def _minute(at: str | datetime) -> datetime:
    when = as_utc(at if isinstance(at, datetime) else datetime.fromisoformat(at.replace("Z", "+00:00")))
    return when.replace(second=0, microsecond=0)


def runs(grid: Mapping[str, Any] | None, clubs: Iterable[Club]) -> dict[str, list[dict[str, Any]]]:
    """Each club's next `RUN` league games from the fixture grid (backend buckets and labels, 1 easiest), the club found by
    the kickoffs of the games it has played, never by its name (the grid's football-data names are not Sorare's)."""
    teams = (grid or {}).get("teams") or []
    kicks = {
        t["code"]: {
            _minute(c["kickoff_utc"]) for cells in t.get("cells") or [] for c in cells if c.get("status") == "finished"
        }
        for t in teams
    }
    found: dict[str, Club] = {}
    for c in clubs:
        mine = {_minute(g["date"]) for g in c.games}
        scores = sorted(((len(mine & ks), code) for code, ks in kicks.items()), reverse=True)
        if scores and scores[0][0] and (len(scores) == 1 or scores[1][0] < scores[0][0]):
            found[scores[0][1]] = c
    out: dict[str, list[dict[str, Any]]] = {}
    for t in teams:
        mine_club = found.get(t["code"])
        if mine_club is None:
            continue
        ahead = sorted(
            (cell for cells in t.get("cells") or [] for cell in cells if cell.get("status") != "finished"),
            key=lambda cell: cell["kickoff_utc"],
        )[:RUN]
        names = {
            x["code"]: (found[x["code"]].name, found[x["code"]].crest)
            if x["code"] in found
            else (x["name"], x.get("crest_url"))
            for x in teams
        }
        out[mine_club.name] = [
            {
                "date": _minute(cell["kickoff_utc"]).isoformat(),
                "home": cell.get("venue") == "H",
                "opponent": names.get(cell["opponent_code"], (cell["opponent_code"], None))[0],
                "crest": names.get(cell["opponent_code"], (cell["opponent_code"], None))[1],
                "bucket": (cell.get("prediction") or {}).get("bucket"),
                "label": (cell.get("prediction") or {}).get("label"),
            }
            for cell in ahead
        ]
    return out


# ---- two clubs: one team from both, each club's game a try of its round


def _blank(p: Player, n: int) -> Player:
    return replace(
        p,
        starts=np.zeros(n, bool),
        played=np.zeros(n, bool),
        mins=np.zeros(n, int),
        scores=np.zeros(n),
        xs=np.full(n, np.nan),
        mine=np.zeros(n, bool),
    )


def pair_club(a: Club, b: Club) -> Club:
    """Both clubs' players over both calendars, in kickoff order: each game is a try of its round (a weekend or a midweek)
    for that club's players; the Arena's copy has one entry a round, each player's own game in it."""

    # the clubs' game against each other is one game, one try, whose five may mix both clubs' players
    def key(k: int, g: dict[str, Any]) -> tuple[Any, ...]:
        return ("met", g["id"]) if g.get("opponent") == (b, a)[k].name else (k, g["id"])

    first: dict[tuple[Any, ...], tuple[datetime, int, int]] = {}
    for k, c in enumerate((a, b)):
        for i, g in enumerate(c.games):
            first.setdefault(key(k, g), (as_utc(datetime.fromisoformat(g["date"])), k, i))
    order = sorted(first.values())
    n = len(order)
    slot = {key(k, (a, b)[k].games[i]): j for j, (_, k, i) in enumerate(order)}
    at = {(k, i): slot[key(k, g)] for k, c in enumerate((a, b)) for i, g in enumerate(c.games)}
    keys = [rnd(when) for when, _, _ in order]
    index = {r: i for i, r in enumerate(dict.fromkeys(keys))}
    rounds = [index[r] for r in keys]
    players: dict[str, Player] = {}
    for k, c in enumerate((a, b)):
        for p in c.players.values():
            q = _blank(p, n)
            for i in range(len(c.games)):
                j = at[(k, i)]
                q.starts[j], q.played[j], q.mins[j] = p.starts[i], p.played[i], p.mins[i]
                q.scores[j], q.xs[j] = p.scores[i], p.xs[i]
                assert q.mine is not None
                q.mine[j] = True
            players[p.slug] = q
    games = [
        {
            **(a, b)[k].games[i],
            "club": "both" if key(k, (a, b)[k].games[i])[0] == "met" else (a, b)[k].name,
            "round": rounds[j],
        }
        for j, (_, k, i) in enumerate(order)
    ]
    out = Club(
        name=f"{a.name} + {b.name}", crest=a.crest, own="", games=games, players=players, rounds=rounds, season=a.season
    )
    # the Arena: one lineup a round, each card playing his own club's game of it (the first, when his club played twice)
    r_n = len(index)
    by_round = {}
    for p in players.values():
        q = _blank(p, r_n)
        for j in range(n):
            r = rounds[j]
            if p.mine is not None and p.mine[j] and not (q.played[r] or q.starts[r]):
                q.starts[r], q.played[r], q.mins[r], q.scores[r], q.xs[r] = (
                    p.starts[j],
                    p.played[j],
                    p.mins[j],
                    p.scores[j],
                    p.xs[j],
                )
        q.mine = None
        by_round[p.slug] = q
    opener = {r: games[j] for j, r in reversed(list(enumerate(rounds)))}
    out.arena_club = Club(
        name=out.name, crest=a.crest, own="", games=[opener[r] for r in range(r_n)], players=by_round, season=a.season
    )
    out.pro = pro_search(out)
    out.sevens = arena_search(out.arena_club)
    return out


def pair_id(a: str, b: str) -> str:
    """A pair's key in block names: both clubs, plain letters, in alphabetical order."""
    slug = lambda name: re.sub(
        r"[^a-z0-9]+", "-", unicodedata.normalize("NFKD", name).encode("ascii", "ignore").decode().lower()
    ).strip("-")  # noqa: E731
    return "~".join(sorted((slug(a), slug(b))))


PAIR_PRO = ("id", "from", "toBuy", "full", "mean", "over", "cov", "cash", "clears")
PAIR_ARENA = ("id", "from", "toBuy", "full", "mean", "started")


def pair_tile(entry: dict[str, Any], a: Club, b: Club) -> dict[str, Any]:
    """What the pair picker needs of a pair: its two clubs and, per lane, each team as one short row (`PAIR_PRO`,
    `PAIR_ARENA`): 190 pairs in keyed objects passed Next's 2 MB cache item."""
    teams = {t["id"]: t for t in entry["teams"]}
    sevens = {s["id"]: s for s in entry["sevens"]}

    def pro_row(e: dict[str, Any]) -> list[Any]:
        t = teams[e["id"]]
        lad = t.get("ladder") or {}
        return [
            e["id"],
            e["from"],
            t["toBuy"],
            t["full"],
            t["mean"],
            t["over"],
            t["cov"],
            lad.get("cash", 0),
            lad.get("clears", 0),
        ]

    def arena_row(e: dict[str, Any]) -> list[Any]:
        seven = sevens[e["id"]]
        return [e["id"], e["from"], seven["toBuy"], seven["full"], seven["mean"], seven["started"]]

    return {
        "id": pair_id(a.name, b.name),
        "clubs": [a.name, b.name],
        "crests": [a.crest, b.crest],
        "games": len(set(entry.get("rounds") or [])),
        "pro": {k: {lane: [pro_row(e) for e in es] for lane, es in lanes.items()} for k, lanes in entry["pro"].items()},
        "arena": {lane: [arena_row(e) for e in es] for lane, es in entry["arena"].items()},
    }


def pairs_blocks(
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
    prices: Mapping[str, Price] | None = None,
    owned_classic: frozenset[str] = frozenset(),
    season: float = 0.0,
    logo: str | None = None,
    grid: Mapping[str, Any] | None = None,
    start_of_season: bool = False,
) -> tuple[dict[str, Any], dict[str, dict[str, Any]]] | None:
    """Every pair of the league's clubs: the picker's block and each pair's teams (by pair id). This season's, or with
    `start_of_season` each club's team from last season's record (None when last season is not kept for the league)."""
    if start_of_season:
        built = _next_clubs(
            league, rows, games, now, owned=owned, art=art, prices=prices, owned_classic=owned_classic, season=season
        )
        if not built:
            return None
        names = {own: (name, c.crest) for name, _, _, c, _, own in built if own}
        last = [c for _, _, _, c, _, _ in built]
        for lc in last:
            for g in lc.games:
                g["opponent"], g["crest"] = names.get(g["opponent"], (g["opponent"], None))
        this_season = [t for _, _, t, _, _, _ in built if t is not None]
        return _pairs(league, last, now, board, lines, captain, season, logo, runs(grid, this_season))
    by_club: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for r in rows:
        if r.get("club"):
            by_club[r["club"]].append(r)
    clubs = [
        x
        for name, rs in sorted(by_club.items())
        if (
            x := club(
                name,
                rs,
                games,
                league,
                now,
                owned=owned,
                art=art,
                prices=prices,
                owned_classic=owned_classic,
                season=season,
            )
        )
        and x.games
    ]
    crests = {x.own: (x.name, x.crest) for x in clubs}
    for x in clubs:
        for g in x.games:
            g["opponent"], g["crest"] = crests.get(g["opponent"], (g["opponent"], None))
    return _pairs(league, clubs, now, board, lines, captain, season, logo, runs(grid, clubs))


def _pairs(
    league: str,
    clubs: list[Club],
    now: datetime,
    board: list[Step] | None,
    lines: list[dict[str, Any]],
    captain: float,
    season: float,
    logo: str | None,
    fixtures: Mapping[str, list[dict[str, Any]]] | None = None,
) -> tuple[dict[str, Any], dict[str, dict[str, Any]]]:
    tiles, details = [], {}
    for a, b in itertools.combinations(clubs, 2):
        c = pair_club(a, b)
        entry = club_block(c, board, captain)
        entry["clubs"] = [{"club": x.name, "crest": x.crest, "run": (fixtures or {}).get(x.name, [])} for x in (a, b)]
        tiles.append(pair_tile(entry, a, b))
        details[pair_id(a.name, b.name)] = entry
    code, name, _ = LEAGUES[league]
    head = {
        "version": VERSION,
        "generatedAt": now.isoformat(),
        "league": league,
        "code": code,
        "name": name,
        "season": season_start(now).year,
        "targets": list(TARGETS),
        "captain": captain,
        "seasonBonus": season,
        "logo": logo,
        "board": [{"target": t, "cash": c, "essence": e} for t, c, e in board] if board else None,
        "arenaLines": lines,
    }
    return {**head, "pairs": tiles}, {k: {**head, "clubs": [v]} for k, v in details.items()}


# ---- Pro


def _top_two(team: Iterable[Player], n: int, boost: float = 1.0) -> tuple[np.ndarray, np.ndarray]:
    m = np.array([np.where(p.starts, p.scores * boost, NEG) for p in team]).reshape(-1, n)
    m.sort(axis=0)
    second = m[-2] if len(m) > 1 else np.full(n, NEG)
    return m[-1], second


def pro_search(c: Club) -> Search | None:
    """Every pool of each position's leading players: the best five of its starters each game (0 when there is none).
    For two clubs each game is a try: a round counts its best try, and is covered when any try fields five."""
    n = len(c.games)
    groups = _groups(c.rounds)
    cap = CAPTAIN / (1 + c.season)  # the scores carry the season bonus, the captain's share is of the raw score
    combos: dict[str, list[tuple[str, ...]]] = {}
    arrays: dict[str, tuple[np.ndarray, ...]] = {}
    saves: dict[str, tuple[np.ndarray, np.ndarray]] = {}  # each combo's biggest classic saving, both ways
    for q in POSITIONS:
        ranked = sorted((p for p in c.players.values() if p.pos == q), key=lambda p: -p.rank)[: CANDIDATES[q]]
        cs = [x for r in SIZES[q] if r <= len(ranked) for x in itertools.combinations(ranked, r)]
        if not cs:
            return None
        tops = [_top_two(x, n, 1 + c.season) for x in cs]
        combos[q] = [tuple(p.slug for p in x) for x in cs]
        arrays[q] = (
            np.array([t[0] for t in tops]),
            np.array([t[1] for t in tops]),
            np.array([sum(p.eur for p in x) for x in cs]),
            np.array([sum(p.cost for p in x) for x in cs]),
        )
        saves[q] = (
            np.array([max(p.saving(False) for p in x) for x in cs]),
            np.array([max(p.saving(True) for p in x) for x in cs]),
        )
    f1, f2, ffull, fown = arrays["FWD"]
    m1, m2, mfull, mown = arrays["MID"]
    fm_save_full = np.maximum(saves["FWD"][0][:, None], saves["MID"][0][None, :])
    fm_save_own = np.maximum(saves["FWD"][1][:, None], saves["MID"][1][None, :])
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
            total = g1 + d1 + fm_sum + extra + cap * np.maximum(fm_top, np.maximum(g1, d1))
            scored = np.where(ok, total, 0.0)
            if groups is not None:
                scored = np.maximum.reduceat(scored, groups, axis=-1)
                ok = np.logical_or.reduceat(ok, groups, axis=-1)
            mean.append(scored.mean(axis=-1).ravel())
            cov.append(ok.mean(axis=-1).ravel())
            save_full = np.maximum(fm_save_full, max(saves["GK"][0][gi], saves["DEF"][0][di]))
            save_own = np.maximum(fm_save_own, max(saves["GK"][1][gi], saves["DEF"][1][di]))
            full.append((gfull[gi] + dfull[di] + fm_full - save_full).ravel())
            own.append((gown[gi] + down[di] + fm_own - save_own).ravel())
            idx.append(np.stack([np.full(nf * nm, gi), np.full(nf * nm, di), mi.ravel(), fi.ravel()], axis=1))
    return Search(
        combos=combos,
        index=np.concatenate(idx).astype(np.int32),
        full=np.round(np.concatenate(full), 2),
        owned=np.round(np.concatenate(own), 2),
        mean=np.concatenate(mean),
        cov=np.concatenate(cov),
    )


def _groups(rounds: list[int] | None) -> np.ndarray | None:
    """Where each round's tries start (games are in date order, so a round's tries are next to each other)."""
    if rounds is None:
        return None
    return np.array([i for i, r in enumerate(rounds) if i == 0 or r != rounds[i - 1]])


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


def classic_of(c: Club, cards: Iterable[str], *, owned: bool) -> str | None:
    """The team's one classic card: the member whose classic saves most (None when none saves anything)."""
    best = max((c.players[s] for s in cards), key=lambda p: p.saving(owned), default=None)
    return best.slug if best is not None and best.saving(owned) > 0 else None


def _five_ok(five: Iterable[Player]) -> bool:
    count = Counter(p.pos for p in five)
    return count["GK"] == 1 and all(count[q] >= 1 for q in OUTFIELD)


def _lineup(values: list[float], captain: float = CAPTAIN) -> float:
    return sum(values) + captain * max(values)


def series(
    c: Club, cards: Iterable[str], captain: float = CAPTAIN, classic: str | None = None, *, blind: bool = False
) -> dict[str, list[float | None]]:
    """Each game, over every valid five of the team's starters: the best, median and average score (hindsight), and the five
    Sofix's xS would have picked (what it scored, what xS said) when Sofix saved a number for every starter. A card scores
    with the season bonus unless it is the team's classic card, and the captain adds his raw score times the bonus."""
    team = [c.players[s] for s in cards]
    boost = {p.slug: 1.0 if p.slug == classic else 1.0 + c.season for p in team}

    def total(five: Iterable[Player], key: str, i: int) -> float:
        values = [(boost[p.slug], float(getattr(p, key)[i])) for p in five]
        return sum(b * v for b, v in values) + captain * max(v for _, v in values)

    out: dict[str, list[float | None]] = {k: [] for k in ("best", "median", "average", "xsReal", "xsExp")}
    for i in range(len(c.games)):
        started = [p for p in team if p.starts[i]]
        fives = [f for f in itertools.combinations(started, 5) if _five_ok(f)]
        if not fives:
            for k in ("best", "median", "average"):
                out[k].append(None)
            if not blind:
                out["xsReal"].append(None)
                out["xsExp"].append(None)
                continue
            totals: list[float] = []
        else:
            totals = [total(f, "scores", i) for f in fives]
            out["best"].append(round(max(totals), 1))
            out["median"].append(round(statistics.median(totals), 1))
            out["average"].append(round(sum(totals) / len(totals), 1))
        # `blind` (Any clubs: a lineup mixes games of the whole matchday, so it is set before most teamsheets): xS picks among
        # every card with a number for the round, and one who does not play scores 0, as its captain does
        pool = [p for p in team if not np.isnan(p.xs[i])] if blind else started
        pickable = [f for f in itertools.combinations(pool, 5) if _five_ok(f)] if blind else fives
        if pickable and (blind or all(not np.isnan(p.xs[i]) for p in started)):
            chosen = max(pickable, key=lambda f: total(f, "xs", i))  # noqa: B023 - used at once
            cap = max(chosen, key=lambda p: p.xs[i])
            played = {p.slug: float(p.scores[i]) if p.played[i] else 0.0 for p in chosen}
            out["xsReal"].append(
                round(sum(boost[p.slug] * played[p.slug] for p in chosen) + captain * played[cap.slug], 1)
            )
            out["xsExp"].append(round(total(chosen, "xs", i), 1))
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


def arena_series(c: Club, seven: Seven, captain: float = CAPTAIN, classic: str | None = None) -> dict[str, list[Any]]:
    scores, sub_in, all_started, fives = _arena(c, seven)
    out: dict[str, list[Any]] = {k: [] for k in ("best", "median", "average", "xsReal", "xsExp")}
    for i, row in enumerate(scores):
        boost = np.array([1.0 if p.slug == classic else 1.0 + c.season for p in fives[i]])
        base = float((row * boost).sum())  # the season bonus on each in-season card; the captain on his raw score
        by_captain = [base + captain * float(v) for v in row]
        out["best"].append(round(max(by_captain), 1))
        out["median"].append(round(statistics.median(by_captain), 1))
        out["average"].append(round(sum(by_captain) / len(by_captain), 1))
        xs = [p.xs[i] for p in fives[i]]
        if all(not np.isnan(x) for x in xs):
            cap = int(np.argmax(xs))
            out["xsReal"].append(round(base + captain * float(row[cap]), 1))
            out["xsExp"].append(round(float(sum(b * x for b, x in zip(boost, xs, strict=True))) + captain * max(xs), 1))
        else:
            out["xsReal"].append(None)
            out["xsExp"].append(None)
    out["subIn"] = [bool(x) for x in sub_in]
    out["allStarted"] = [bool(x) for x in all_started]
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
                mean = float((scores.sum(axis=1) * (1 + c.season) + CAPTAIN * scores.max(axis=1)).mean())
                members = [c.players[s] for s in seven.cards]
                full = sum(p.eur for p in members) - max(p.saving(False) for p in members)
                own = sum(p.cost for p in members) - max(p.saving(True) for p in members)
                tried.append((seven, full, own, mean, float(started.mean())))
    return tried


def arena_pick(c: Club, *, budget: float, owned: bool) -> Seven | None:
    if not c.sevens:
        return None
    cost = np.array([s[2] if owned else s[1] for s in c.sevens])
    front = _frontier(cost, np.array([s[3] for s in c.sevens]), cost <= budget + 1e-9)
    return c.sevens[front[-1][0]][0] if front else None


# ---- boards and prizes


LIVES = 4  # lineups a step (Sorare's "4 lives and 4 lineup tries per step")


def ladder(values: Iterable[float | None], board: list[Step], rounds: list[int] | None = None) -> dict[str, Any]:
    """Sorare's step clock ("What is Pro?", 20 Nov 2026): a clear wins the step and climbs; a step must be cleared by the end of
    the matchday it was started in, in at most `LIVES` lineups, or the board starts again from its first step. A step started
    later in the matchday of a clear has until the end of the following matchday. One try a game, or for two clubs each
    club's game of a round, in kickoff order (`rounds`). Same rule as `ladder` in lib/squads.ts."""
    vals = list(values)
    keys = rounds if rounds is not None else list(range(len(vals)))
    path: list[dict[str, Any]] = []
    level, clears, cash, essence, top = 0, 0, 0.0, 0, 0
    lives, deadline, cleared_in = LIVES, None, None  # deadline: the round the current step must be cleared by

    def fail() -> None:
        nonlocal level, lives, deadline
        if path and path[-1]["res"] == "miss":
            path[-1]["back"] = level > 0
        level, lives, deadline = 0, LIVES, None

    for i, v in enumerate(vals):
        r = keys[i]
        target, c, e = board[level]
        if v is None:
            path.append({"target": target, "res": "skip"})
        else:
            if deadline is None:  # this lineup starts the step
                deadline = r + 1 if cleared_in == r else r
            if v >= target:
                path.append({"target": target, "res": "clear"})
                clears, cash, essence, top = clears + 1, cash + c, essence + e, max(top, target)
                level, lives, deadline, cleared_in = (level + 1) % len(board), LIVES, None, r
            else:
                path.append({"target": target, "res": "miss", "back": False})
                lives -= 1
                if lives == 0:
                    fail()
        if (i + 1 == len(vals) or keys[i + 1] != r) and deadline is not None and deadline <= r:
            fail()  # the matchday ends with the step not cleared
    return {"path": path, "clears": clears, "cash": cash, "essence": essence, "top": top}


def _over(best: list[float | None], board: list[Step] | None, rounds: list[int] | None) -> int:
    """Games (for two clubs, rounds) whose best five topped Pro's first step."""
    if not board:
        return 0
    if rounds is None:
        return sum(1 for v in best if v is not None and v >= board[0][0])
    top: dict[int, float] = {}
    for r, v in zip(rounds, best, strict=True):
        if v is not None:
            top[r] = max(top.get(r, v), v)
    return sum(1 for v in top.values() if v >= board[0][0])


def boards(raw: list[dict[str, Any]] | None) -> dict[str, tuple[list[Step], float, float]]:
    """Each league's Limited Pro board, every step (cleared ones too) and its captain bonus, from the owner's boards."""
    out: dict[str, tuple[list[Step], float, float]] = {}
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
        engine = steps[0].get("engineConfiguration") or {}
        captain, season = float(engine.get("captain") or CAPTAIN), float(engine.get("season") or SEASON)
        out[league] = ([(int(s["target"]), *_prize(s, "limited")) for s in steps], captain, season)
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
        "listed": p.listed,
        "classic": round(p.classic, 2) if p.classic is not None else None,
        "ownedClassic": p.owned_classic,
        "owned": p.owned,
        "art": p.art,
        # S started, B came on, - did not play; x: for two clubs, the other club's game
        "played": "".join(
            "x" if p.mine is not None and not p.mine[i] else "S" if s else "B" if b else "-"
            for i, (s, b) in enumerate(zip(p.starts, p.played, strict=True))
        ),
        "scores": [round(float(x), 1) for x in p.scores],
        "mins": [int(x) for x in p.mins],
    }


def _lean(s: dict[str, list[Any]]) -> dict[str, list[Any]]:
    """Sofix's xS series are left empty when Sofix saved no number at all (last season's rounds): the page then hides them."""
    return {k: v if k not in ("xsReal", "xsExp") or any(x is not None for x in v) else [] for k, v in s.items()}


def club_block(
    c: Club, board: list[Step] | None, captain: float, targets: tuple[float, ...] = TARGETS
) -> dict[str, Any]:
    teams: dict[tuple[str, ...], dict[str, Any]] = {}
    pro: dict[str, dict[str, list[dict[str, Any]]]] = {}

    def team_id(cards: tuple[str, ...], full: float, cost_owned: float, mean: float, cov: float) -> int:
        key = tuple(sorted(cards))
        if key not in teams:
            # the team's classic card (yours when it counts, else the one bought) scores without the season bonus
            s = series(
                c, cards, captain, classic_of(c, cards, owned=True) or classic_of(c, cards, owned=False), blind=c.blind
            )
            lad = ladder(s["best"], board, c.rounds) if board else None
            teams[key] = {
                "id": len(teams),
                "cards": list(cards),
                "full": round(float(full), 2),
                "toBuy": round(float(cost_owned), 2),
                "classic": classic_of(c, cards, owned=False),
                "classicToBuy": classic_of(c, cards, owned=True),
                "mean": round(float(mean), 1),
                "cov": round(float(cov), 3),
                "over": _over(s["best"], board, c.rounds),
                **_lean(s),
                "ladder": {k: lad[k] for k in ("clears", "cash", "essence", "top")} if lad else None,
            }
        return int(teams[key]["id"])

    if c.pro is not None:
        for target in targets:
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
    ac = c.arena_club or c  # two clubs: the Arena is played round by round
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
                        "classic": classic_of(ac, seven.cards, owned=False),
                        "classicToBuy": classic_of(ac, seven.cards, owned=True),
                        "mean": round(float(mean), 1),
                        "started": round(float(started), 3),
                        **_lean(
                            arena_series(
                                ac,
                                seven,
                                captain,
                                classic_of(ac, seven.cards, owned=True) or classic_of(ac, seven.cards, owned=False),
                            )
                        ),
                    }
                entries.append({"id": sevens[seven]["id"], "from": round(b, 2)})
            arena[lane] = entries
    # every team's and seven's cards, and each position's leading players, whom the page offers as swaps (Q6)
    swaps = {
        p.slug
        for q in POSITIONS
        for p in sorted((p for p in c.players.values() if p.pos == q), key=lambda p: -p.rank)[: CANDIDATES[q] + SWAPS]
    }
    used = {s for t in teams for s in t} | {s for seven in sevens for s in seven.cards} | swaps
    return {
        "club": c.name,
        "crest": c.crest,
        "games": c.games,
        "players": {s: _player_out(c.players[s]) for s in sorted(used)},
        "teams": sorted(teams.values(), key=lambda t: t["id"]),
        "pro": pro,
        "sevens": sorted(sevens.values(), key=lambda t: t["id"]),
        "arena": arena,
        **({"rounds": c.rounds} if c.rounds is not None else {}),
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
    prices: Mapping[str, Price] | None = None,
    owned_classic: frozenset[str] = frozenset(),
    season: float = 0.0,
    logo: str | None = None,
    grid: Mapping[str, Any] | None = None,
) -> dict[str, Any]:
    by_club: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for r in rows:
        if r.get("club"):
            by_club[r["club"]].append(r)
    clubs = [
        x
        for name, rs in sorted(by_club.items())
        if (
            x := club(
                name,
                rs,
                games,
                league,
                now,
                owned=owned,
                art=art,
                prices=prices,
                owned_classic=owned_classic,
                season=season,
            )
        )
    ]
    crests = {x.own: (x.name, x.crest) for x in clubs}
    fixtures = runs(grid, clubs)
    out = []
    for x in clubs:
        for g in x.games:  # the opponent as the league page names it, with its crest
            name, crest = crests.get(g["opponent"], (g["opponent"], None))
            g.update(opponent=name, crest=crest)
        if x.games:
            out.append({**club_block(x, board, captain), "run": fixtures.get(x.name, [])})
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
        "seasonBonus": season,
        "logo": logo,
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


def read_prices(answer: Mapping[str, Any]) -> dict[str, Price]:
    """`PRICE_QUERY`'s answer by player, in euros: a listing in another currency goes through Sorare's own rates."""
    eth = ((answer.get("config") or {}).get("exchangeRate") or {}).get("ethRates") or {}
    out: dict[str, Price] = {}
    for p in answer.get("players") or []:
        if not isinstance(p, dict) or not p.get("slug"):
            continue
        ins, cla = (_asking(p[k], eth) if isinstance(p.get(k), dict) else None for k in ("ins", "cla"))
        est = (((p.get("commonPlayer") or {}).get("a")) or {}).get("eurCents")
        out[p["slug"]] = {
            "in": ins / 100 if ins is not None else None,
            "inEst": est / 100 if isinstance(est, int | float) else None,
            "cl": cla / 100 if cla is not None else None,
        }
    return out


def prices(client: SorareClient, slugs: Iterable[str]) -> dict[str, Price]:
    """Today's prices of these players, as far as Sorare answers: a batch it refuses is left out (its players fall back to
    the market value already published)."""
    names = sorted(set(slugs))
    size = PRICE_BATCH[1] if getattr(client, "api_key", "") else PRICE_BATCH[0]
    out: dict[str, Price] = {}
    for i in range(0, len(names), size):
        try:
            out |= read_prices(client.query(PRICE_QUERY, {"s": names[i : i + size]}))
        except (SorareError, KeyError, TypeError) as error:
            logger.warning("squads: %d prices not answered: %s", len(names[i : i + size]), error)
    return out


def logos(client: SorareClient) -> dict[str, str]:
    """Each league's logo as Sorare hosts it (the owner asked for the league's logo in place of its name, 24 Nov 2026)."""
    slugs = list(LEAGUES)
    parts = " ".join(f'l{i}: competition(slug: "{slug}") {{ pictureUrl }}' for i, slug in enumerate(slugs))
    try:
        answer = client.query("query { football { " + parts + " } }").get("football") or {}
    except (SorareError, KeyError, TypeError) as error:
        logger.warning("squads: league logos not answered: %s", error)
        return {}
    out = {}
    for i, slug in enumerate(slugs):
        url = (answer.get(f"l{i}") or {}).get("pictureUrl")
        if isinstance(url, str) and url.startswith("https://assets.sorare.com/"):
            out[slug] = url
    return out


def _cents(v: float | None) -> int | None:
    return round(v * 100) if v is not None else None


def record(prior: Mapping[str, Any] | None, today: Mapping[str, Price], now: datetime) -> dict[str, Any]:
    """The league's price record: one price a player a day in cents (`in`: listed, else the market value, with `listed`
    saying which; `cl`: listed classic), the same day's later read replacing the earlier one."""
    day = now.date().isoformat()
    old = dict(prior or {})
    days = list(old.get("days") or [])
    if days and days[-1] == day:
        days.pop()
        old = {k: {s: v[:-1] for s, v in (old.get(k) or {}).items()} for k in ("in", "listed", "cl")}
    n = len(days)
    out: dict[str, Any] = {"days": [*days, day]}
    for key in ("in", "listed", "cl"):
        series = {s: list(v) + [None] * (n - len(v)) for s, v in (old.get(key) or {}).items()}
        for s in set(series) | set(today):
            p = today.get(s)
            if p is None:
                value: Any = None
            elif key == "in":
                value = _cents(p.get("in") if p.get("in") is not None else p.get("inEst"))
            elif key == "listed":
                value = p.get("in") is not None
            else:
                value = _cents(p.get("cl"))
            series[s] = [*series.get(s, [None] * n), value]
        out[key] = series
    return out


def grid_of(db: Session, code: str) -> dict[str, Any] | None:
    """The league's fixture grid as the refresh published it (`grid` for LaLiga, `grid:<code>` for the others)."""
    row = kept_blocks.read(db, "grid" if code == "LALIGA" else f"grid:{code}")
    payload = row.payload if row and isinstance(row.payload, dict) else None
    if payload and "teams" not in payload and isinstance(payload.get("data"), dict):
        payload = payload["data"]  # LaLiga's is kept as the API answers it
    return payload


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
    today: Mapping[str, Price] | None = None,
    league_logos: Mapping[str, str] | None = None,
    write: bool = True,
) -> dict[str, Any]:
    """`markets`: league slug -> its players' rows (slug, name, pos, club, crest, eur, pic); `today`: their prices
    (`prices`). Writes `squads:<code>` and adds the day to `squad_prices:<code>`."""
    limited = [c for c in collection if c.get("rarity") == "limited" and c.get("player")]
    owned = frozenset(c["player"] for c in limited if c.get("inSeason"))
    owned_classic = frozenset(c["player"] for c in limited if not c.get("inSeason")) - owned
    since = season_start(now).replace(year=season_start(now).year - 1)  # last season too: the start-of-season pick
    games = load_games(db, {r["slug"] for rows in markets.values() for r in rows if r.get("slug")}, since)
    db.rollback()
    found = boards(raw_boards)
    summary: dict[str, Any] = {}
    for league, rows in markets.items():
        grid = grid_of(db, LEAGUES[league][0])
        board, captain, season = found.get(league, (None, CAPTAIN, SEASON))
        block = league_block(
            league,
            rows,
            games,
            now,
            owned=owned,
            art=art,
            board=board,
            lines=pay_lines(bars, league),
            captain=captain,
            prices=today,
            owned_classic=owned_classic,
            season=season,
            logo=(league_logos or {}).get(league),
            grid=grid,
        )
        mine = {r["slug"]: today[r["slug"]] for r in rows if today and r.get("slug") in today}
        start = next_block(
            league,
            rows,
            games,
            now,
            owned=owned,
            art=art,
            board=board,
            lines=pay_lines(bars, league),
            captain=captain,
            prices=today,
            owned_classic=owned_classic,
            season=season,
            logo=(league_logos or {}).get(league),
            grid=grid,
        )
        summary[block["code"]] = {
            "clubs": len(block["clubs"]),
            "board": board is not None,
            "prices": len(mine),
            "startOfSeason": len(start["clubs"]) if start else None,
        }
        if write:
            put(db, f"{PREFIX}{block['code']}", block, now)
            if start:
                put(db, f"{NEXT}{block['code']}", start, now)
            if mine:
                kept = kept_blocks.read(db, f"{PRICES}{block['code']}")
                put(db, f"{PRICES}{block['code']}", record(kept.payload if kept else None, mine, now), now)
    return summary


def foreign_rows(index: Mapping[str, Any] | None) -> list[dict[str, Any]]:
    """A kept foreign league index (`league_squads:<code>`) as market rows."""
    return [row for people in ((index or {}).get("clubs") or {}).values() for row in people]
