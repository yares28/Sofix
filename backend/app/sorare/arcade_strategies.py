"""Arcade strategies replayed honestly (plans/arcade-trust.md step 11, owner 29 Oct 2026: strategies compared, loopholes found).

Each rule decides with only what was known before kick-off (the sources' start % and scores frozen before the game, else the
player's record as it stood) and is scored on what happened (real Sorare scores), from step 1 with four lineups a step, over your
set's own kick-off windows; a lineup settles two hours after its last kick-off before the next is entered. Under 100 windows a result
says "too few to tell" (AUDIT-EVIDENCE-001); the band is a bootstrap over days. Sofix's own planner runs in the browser and is not
replayed here; "favourites only" needs each game's difficulty frozen before kick-off, which is not kept yet.
"""

from __future__ import annotations

import math
import random
from collections.abc import Callable, Sequence
from dataclasses import dataclass, field, replace
from datetime import datetime, timedelta
from typing import Any

from app.sorare.arcade_audit import SETTLES, best_five

LIVES = 4
STEADY = 0.6  # play only when the five's chance to clear is at least this
THIN = 0.33  # a card's spread as a share of its score (lib/arcadeClimb.ts THIN_SPREAD)
FLOOR = 100  # windows before a result is more than "too few to tell"
INSURE_FROM = 4  # the hard steps, where insurance stacks are tried
HOARD = 10  # your best cards kept back for steps 5 and 6


@dataclass(frozen=True)
class Seen:
    """One card in one game: what was known before kick-off and what happened."""

    card: str
    player: str
    positions: list[str]
    bonus: float
    start: (
        float | None
    )  # the start chance known before kick-off (a source's own, else his record), None if nothing was known
    start_known: bool  # a source's own %, not his record
    score: float | None  # his score if he starts, as said before kick-off
    real: float  # what he scored (0 when he did not play)
    started: bool | None


@dataclass(frozen=True)
class Window:
    at: datetime
    last: datetime
    cards: list[Seen] = field(default_factory=list)


@dataclass(frozen=True)
class Rule:
    key: str
    name: str
    start: Callable[[Seen], float | None]  # the start chance the rule believes
    play: Callable[[float], bool]  # whether a five with this chance is entered
    insure: bool = False
    daily: bool = False
    hoard: bool = False


def _record(seen: Seen) -> float | None:
    return seen.start


def _old(seen: Seen) -> float | None:
    return seen.start if seen.start_known else 1.0  # before 20 Nov 2026: no source's % counted as starting


def _eleven(seen: Seen) -> float | None:
    return (
        None if seen.started is None else (1.0 if seen.started else 0.0)
    )  # the elevens are out an hour before kick-off


RULES: dict[str, Rule] = {
    "every": Rule("every", "Every window", _record, lambda chance: True),
    "steady": Rule("steady", "Only at 60%+", _record, lambda chance: chance >= STEADY),
    "daily": Rule("daily", "The day's best window", _record, lambda chance: True, daily=True),
    "insure": Rule("insure", "Insurance on steps 4-6", _record, lambda chance: True, insure=True),
    "eleven": Rule("eleven", "Wait for the eleven", _eleven, lambda chance: chance >= STEADY),
    "hoard": Rule("hoard", "Best 10 kept for steps 5-6", _record, lambda chance: chance >= STEADY, hoard=True),
    "old": Rule("old", "Old rule: no % counts as starting", _old, lambda chance: chance >= STEADY),
}


def _phi(x: float) -> float:
    return 0.5 * (1 + math.erf(x / math.sqrt(2)))


Five = tuple[list[Seen], float, float, float]
# A window's five per rule: the same windows come back in every bootstrap draw, so each is worked out once (359 s down to seconds).
_FIVES: dict[tuple[int, str, frozenset[str], float], Five | None] = {}


def _five(cards: Sequence[Seen], rule: Rule, captain: float, banned: set[str]) -> Five | None:
    key = (id(cards), rule.key, frozenset(banned), captain)
    if key not in _FIVES:
        _FIVES[key] = _work_out(cards, rule, captain, banned)
    return _FIVES[key]


def _work_out(cards: Sequence[Seen], rule: Rule, captain: float, banned: set[str]) -> Five | None:
    """The five the rule would enter from `cards`: (picks, chance mean, chance sd, real total), or None."""
    usable = [c for c in cards if c.player not in banned and c.score is not None and rule.start(c) is not None]
    by_slug = {c.card: c for c in usable}
    said = {c.card: rule.start(c) * c.score for c in usable}  # type: ignore[operator]
    plain = [{"slug": c.card, "player": c.player, "positions": c.positions, "bonus": c.bonus} for c in usable]
    best = best_five(plain, said, captain)
    if not best:
        return None
    picks = [by_slug[p["card"]] for p in best["picks"]]
    mean = var = real = 0.0
    for p, pick in zip(best["picks"], picks, strict=True):
        m = pick.bonus + (captain if p["captain"] else 0.0)
        chance, mu = rule.start(pick) or 0.0, pick.score or 0.0
        sd = THIN * mu
        mean += m * chance * mu
        var += m * m * (chance * (sd * sd + mu * mu) - (chance * mu) ** 2)
        real += m * pick.real
    return picks, mean, math.sqrt(max(var, 1e-9)), real


def _chance(mean: float, sd: float, target: float) -> float:
    return 1 - _phi((target - mean) / sd)


def play(
    wins: Sequence[Window],
    targets: Sequence[float],
    rule: Rule,
    captain: float,
    start_step: int = 1,
    insure_from: int = INSURE_FROM,
) -> dict[str, Any]:
    """One rule over the windows in time order. Returns what it entered and what it won."""
    top = len(targets)
    hoarded: set[str] = set()
    if rule.hoard:
        means: dict[str, list[float]] = {}
        for w in wins:
            for c in w.cards:
                if c.score is not None and c.start is not None:
                    means.setdefault(c.player, []).append(c.start * c.score)
        hoarded = {p for p, _ in sorted(means.items(), key=lambda kv: -sum(kv[1]) / len(kv[1]))[:HOARD]}
    step, lives, free_at = start_step, LIVES, None
    clears: dict[int, int] = {}
    spent = played = tops = 0
    first_top: str | None = None
    chosen_day: dict[str, int] = {}
    for i, w in enumerate(wins):
        if free_at is not None and w.at < free_at:
            continue
        banned = hoarded if rule.hoard and step < top - 1 else set()
        five = _five(w.cards, rule, captain, banned)
        if not five:
            continue
        chance = _chance(five[1], five[2], targets[step - 1])
        if rule.daily:
            day = w.at.date().isoformat()
            if day not in chosen_day:  # the day's best window by its chance before kick-off, among those still ahead
                options = [
                    (j, _five(v.cards, rule, captain, banned))
                    for j, v in enumerate(wins)
                    if j >= i and v.at.date() == w.at.date()
                ]
                chosen_day[day] = max(
                    ((j, _chance(f[1], f[2], targets[step - 1])) for j, f in options if f), key=lambda x: x[1]
                )[0]
            if chosen_day[day] != i:
                continue
        if not rule.play(chance):
            continue
        lineups = [five]
        if rule.insure and step >= insure_from:
            used = {c.player for c in five[0]}
            while len(lineups) < min(lives, 3):
                more = _five(w.cards, rule, captain, banned | used)
                if not more:
                    break
                lineups.append(more)
                used |= {c.player for c in more[0]}
        played += len(lineups)
        free_at = w.last + SETTLES
        if any(lineup[3] >= targets[step - 1] for lineup in lineups):
            clears[step] = clears.get(step, 0) + 1
            if step == top:
                tops += 1
                first_top = first_top or w.at.isoformat()
                step, lives = 1, LIVES
            else:
                step, lives = step + 1, LIVES
        else:
            spent += len(lineups)
            lives -= len(lineups)
            if lives <= 0:
                step, lives = 1, LIVES
    return {
        "played": played,
        "clears": dict(sorted(clears.items())),
        "lives": spent,
        "tops": tops,
        "firstTop": first_top,
    }


def _resample(wins: Sequence[Window], rng: random.Random) -> list[Window]:
    """The set's days drawn again with replacement, kept in order a day apart, each day's windows as they were."""
    days: dict[str, list[Window]] = {}
    for w in wins:
        days.setdefault(w.at.date().isoformat(), []).append(w)
    keys = sorted(days)
    if not keys:
        return []
    base = wins[0].at.replace(hour=0, minute=0, second=0, microsecond=0)
    out: list[Window] = []
    for k, key in enumerate(rng.choices(keys, k=len(keys))):
        start = days[key][0].at.replace(hour=0, minute=0, second=0, microsecond=0)
        shift = base + timedelta(days=k) - start
        out.extend(replace(w, at=w.at + shift, last=w.last + shift) for w in days[key])
    return out


def replay_all(
    wins: Sequence[Window], targets: Sequence[float], captain: float, runs: int = 200
) -> list[dict[str, Any]]:
    """Every rule on the windows, with a 10-90% band from `runs` bootstrap draws of the days. Best by tops, then clears."""
    rng = random.Random(7)
    draws = [_resample(wins, rng) for _ in range(runs)]
    _FIVES.clear()  # keyed by the windows' own card lists, which live as long as this call
    out = []
    for rule in RULES.values():
        result = play(wins, targets, rule, captain)
        sampled = [play(d, targets, rule, captain) for d in draws]

        def band(values: list[int]) -> list[int]:
            values = sorted(values)
            return [values[int(0.1 * (len(values) - 1))], values[int(0.9 * (len(values) - 1))]] if values else [0, 0]

        out.append(
            {
                "key": rule.key,
                "name": rule.name,
                **result,
                "band": {
                    "tops": band([r["tops"] for r in sampled]),
                    "clears": band([sum(r["clears"].values()) for r in sampled]),
                },
                "enough": len(wins) >= FLOOR,
            }
        )
    _FIVES.clear()
    return sorted(out, key=lambda r: (-r["tops"], -sum(r["clears"].values()), r["lives"]))


def seen_windows(
    cards: Sequence[dict[str, Any]], rows: Sequence[tuple[Any, ...]], since: datetime, now: datetime
) -> list[Window]:
    """Your cards' settled games since the set opened, each with what was known before its kick-off, grouped into windows.

    `rows`: (player, game id, kick-off, competition, status, played, started, score, sorare_start, ff_start, sofix_start, sofix_x,
    sorare_x) for your cards' players, any date (his record before a game needs his earlier games). A source's own start % (Sorare,
    then Futbol Fantasy, then Sofix) comes first, else his record as it stood; his score if he starts is Sofix's, else Sorare's, else
    his record's.
    """
    from app.sorare.arcade_audit import windows as group
    from app.sorare.arcade_outlook import SETTLED, record

    history: dict[str, list[tuple[Any, ...]]] = {}
    for row in rows:
        history.setdefault(row[0], []).append(row)
    for games in history.values():
        games.sort(key=lambda r: r[2], reverse=True)
    by_game: dict[str, tuple[datetime, list[Seen]]] = {}
    for card in cards:
        games = history.get(card["player"]) or []
        for i, (
            _p,
            game,
            when,
            _competition,
            status,
            played,
            started,
            score,
            so_s,
            ff_s,
            sx_s,
            sx_x,
            so_x,
        ) in enumerate(games):
            if status not in SETTLED or not since <= when <= now:
                continue
            before = record((g[2], g[3], g[4], g[5], g[6], g[7], {}) for g in games[i + 1 :])
            known = next((v for v in (so_s, ff_s, sx_s) if v is not None), None)
            start = known if known is not None else (before["s"] if before else None)
            said = next((v for v in (sx_x, so_x, before["x"] if before else None) if v is not None), None)
            seen = Seen(
                card=card["slug"],
                player=card["player"],
                positions=list(card["positions"]),
                bonus=float(card.get("bonus") or 1.0),
                start=start,
                start_known=known is not None,
                score=said,
                real=float(score) if status == "FINAL" and played and score is not None else 0.0,
                started=bool(started) if status == "FINAL" else False,
            )
            by_game.setdefault(game, (when, []))[1].append(seen)
    ids = list(by_game)
    out = []
    for indexes in group([by_game[g][0] for g in ids]):
        chosen = [ids[i] for i in indexes]
        times = [by_game[g][0] for g in chosen]
        out.append(Window(at=min(times), last=max(times), cards=[s for g in chosen for s in by_game[g][1]]))
    return out
