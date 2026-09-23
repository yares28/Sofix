"""Build the lineups for a Sorare gameweek, and the whole-gameweek plans they make.

The rules it obeys, all read from Sorare (see `rules.py`):

- a lineup fills its slots with cards you own; one card, and one player, per lineup;
- in-season competitions need at least four in-season cards;
- rooms of 10 cap the sum of the players' averages, and cost essence to enter;
- the captain's bonus, the in-season, level and rarity bonuses, and the two lineup bonuses
  (at most two cards from one club, the sum of averages under the cap) add up on each card's score;
- **substitutes are optional.** A substitute only comes in for a starter who did not play at all:
  goalkeeper for goalkeeper, outfield for the same position or for anyone in the Extra slot, and only while
  the lineup still keeps its four in-season cards. When one comes in the lineup loses its two lineup bonuses,
  and a substitute never inherits the captain's. So the planner first uses every card it can as a starter —
  another lineup is usually worth more than a bench — and only then fills benches with what is left, and only
  when the substitute is worth more than the bonuses he risks.

A lineup's score is a distribution, not a number: each player plays with a chance and scores around his
forecast, so the planner simulates the lineup and reads the chance of each reward off the scores that paid in a
comparable gameweek (or, for rooms, off real rooms of 10).
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field

import numpy as np

from app.sorare.model import Card, Competition, Forecast

SCORE_SD = 17.6
"""How far a player's real score lands from his forecast, in points (measured on the owner's players,
1–18 Sep 2026, against the same forecast the planner uses)."""

DRAWS = 3000
BEAM = 120
MIN_CHANCE = 0.005  # under half a percent a lineup is not worth the cards, even where entry is free
CANDIDATES_PER_SLOT = 18


@dataclass
class Lineup:
    comp: Competition
    starters: list[Card]
    subs: list[Card | None]  # one entry per substitute slot; None = left empty
    captain: int = 0
    expected: float = 0.0
    low: float = 0.0
    high: float = 0.0
    p_return: float = 0.0
    e_cash: float = 0.0
    e_essence: float = 0.0  # net of the entry fee
    p_card: float = 0.0
    tier_probs: list[float] = field(default_factory=list)
    actual: float | None = None
    actual_cash: float = 0.0
    actual_essence: float = 0.0
    actual_card: bool = False
    came_in: list[tuple[str, str]] = field(default_factory=list)  # (substitute, the starter he replaced)
    bonus_lost: bool = False

    @property
    def cards(self) -> list[Card]:
        return [*self.starters, *[s for s in self.subs if s]]

    @property
    def bench(self) -> list[Card]:
        return [s for s in self.subs if s]


def _lineup_bonus(lineup: Lineup) -> float:
    """The two bonuses that belong to the lineup rather than a card, and that a substitute cancels."""
    comp, bonus = lineup.comp, 0.0
    if comp.club_bonus:
        most, value = comp.club_bonus
        clubs: dict[str | None, int] = {}
        for card in lineup.starters:
            clubs[card.club] = clubs.get(card.club, 0) + 1
        if clubs and max(clubs.values()) <= most:
            bonus += value
    if comp.average_bonus:
        cap, value = comp.average_bonus
        if sum(card.average for card in lineup.starters) <= cap:
            bonus += value
    return bonus


def _can_replace(lineup: Lineup, slot: int, starter_index: int) -> bool:
    """May this substitute slot cover that starter? (position, and the in-season rule after the swap)"""
    comp = lineup.comp
    sub = lineup.subs[slot]
    if sub is None:
        return False
    starter = lineup.starters[starter_index]
    gk_slot = comp.starters[starter_index] == ("GK",)
    if (comp.subs[slot] == ("GK",)) != gk_slot:
        return False
    if not gk_slot and len(comp.starters[starter_index]) == 1 and starter.positions[0] not in sub.positions:
        return False  # same position, unless the slot is the Extra one
    if comp.min_in_season and starter.in_season and not sub.in_season:
        left = sum(1 for c in lineup.starters if c.in_season) - 1
        if left < comp.min_in_season:
            return False  # the lineup would drop under four in-season cards, so he stays out
    return True


def totals(lineup: Lineup, plays: np.ndarray, scores: np.ndarray, record: bool = False) -> np.ndarray:
    """Add a lineup up for every simulated (or real) gameweek in `plays` / `scores`."""
    comp = lineup.comp
    starters = lineup.starters
    k = len(starters)
    bench = lineup.bench
    base = np.array([comp.multiplier(c) for c in [*starters, *bench]])
    bonus = _lineup_bonus(lineup)

    points = plays[:, :k] * scores[:, :k] * (base[:k] + bonus)
    points[:, lineup.captain] += plays[:, lineup.captain] * scores[:, lineup.captain] * comp.captain_bonus
    total = points.sum(axis=1)

    replaced = np.zeros((len(total), k), dtype=bool)
    entered = np.zeros(len(total), dtype=bool)
    for slot, sub in enumerate(lineup.subs):
        if sub is None:
            continue
        column = k + bench.index(sub)
        used = np.zeros(len(total), dtype=bool)
        for i in range(k):
            if not _can_replace(lineup, slot, i):
                continue
            hit = (~plays[:, i]) & (~replaced[:, i]) & (~used) & plays[:, column]
            replaced[:, i] |= hit
            used |= hit
            if record and hit[0]:
                lineup.came_in.append((sub.slug, starters[i].slug))
        total = total + used * scores[:, column] * base[column]
        entered |= used
    if bonus:
        total = total - entered * (plays[:, :k] * scores[:, :k] * bonus).sum(axis=1)
    if record:
        lineup.bonus_lost = bool(entered[0]) and bonus > 0
    return total


def simulate(
    lineup: Lineup, forecasts: dict[str, Forecast], rng: np.random.Generator, draws: int = DRAWS
) -> np.ndarray:
    cards = lineup.cards
    p = np.array([forecasts[c.player].p_play for c in cards])
    mu = np.array([forecasts[c.player].mu for c in cards])
    plays = rng.random((draws, len(cards))) < p
    scores = np.clip(rng.normal(mu, SCORE_SD, (draws, len(cards))), 0, 100)
    return totals(lineup, plays, scores)


def replay(lineup: Lineup, forecasts: dict[str, Forecast]) -> float:
    """What the lineup really scored, with the substitutions Sorare would have made."""
    cards = lineup.cards
    lineup.came_in = []
    plays = np.array([[forecasts[c.player].actual is not None for c in cards]])
    scores = np.array([[forecasts[c.player].actual or 0.0 for c in cards]])
    return float(totals(lineup, plays, scores, record=True)[0])


def score_at_rank(reference: dict[int, float], rank: int) -> float | None:
    """The score that finished at that rank in the reference gameweek (interpolated in log rank).

    Outside the ranks the reference covers it stops at the nearest one it does: a gameweek's table says
    nothing about ranks it never paid, and inventing a lower bar would invent a chance with it.
    """
    points = sorted((r, s) for r, s in reference.items() if s > 0)
    if not points:
        return None
    if rank <= points[0][0]:
        return points[0][1]
    if rank >= points[-1][0]:
        return points[-1][1]
    for (r1, s1), (r2, s2) in zip(points, points[1:], strict=False):
        if r1 <= rank <= r2:
            share = (math.log(rank) - math.log(r1)) / (math.log(r2) - math.log(r1))
            return s1 + share * (s2 - s1)
    return points[-1][1]


def _rewards(lineup: Lineup, scores: np.ndarray, rng: np.random.Generator) -> None:
    comp = lineup.comp
    if comp.is_room:
        pay = {t.lo: t.essence for t in comp.tiers}
        if not comp.reference_rooms:
            return
        others = rng.choice(np.array(comp.reference_rooms), size=(len(scores), max(comp.room_size - 1, 9)))
        place = 1 + (others > scores[:, None]).sum(axis=1)
        probs = [float((place == k).mean()) for k in (1, 2, 3)]
        lineup.tier_probs = probs
        lineup.e_essence = sum(pr * pay.get(k, 0) for k, pr in zip((1, 2, 3), probs, strict=False)) - comp.fee
        lineup.p_return = float(sum(probs))
        return
    reached = np.zeros(len(scores), dtype=bool)
    probs = []
    for tier in comp.paying_tiers:
        threshold = score_at_rank(comp.reference, tier.hi)
        if threshold is None:
            probs.append(0.0)
            continue
        hit = scores >= threshold
        chance = float((hit & ~reached).mean())
        probs.append(chance)
        lineup.e_cash += chance * tier.cash
        lineup.e_essence += chance * tier.essence
        if tier.card:
            lineup.p_card += chance
        reached |= hit
    lineup.tier_probs = probs
    lineup.p_return = float(reached.mean())


def evaluate(lineup: Lineup, forecasts: dict[str, Forecast], rng: np.random.Generator, draws: int = DRAWS) -> Lineup:
    """Fill in a lineup's expected score, its range and what it can be expected to win."""
    lineup.e_cash = lineup.e_essence = lineup.p_card = lineup.p_return = 0.0
    scores = simulate(lineup, forecasts, rng, draws)
    lineup.expected = float(scores.mean())
    lineup.low, lineup.high = (float(v) for v in np.percentile(scores, [10, 90]))
    _rewards(lineup, scores, rng)
    return lineup


def replay_rewards(lineup: Lineup, forecasts: dict[str, Forecast], reference: dict[int, float]) -> None:
    """What the lineup really won, against the scores that really paid in that gameweek."""
    lineup.actual = replay(lineup, forecasts)
    lineup.actual_cash = lineup.actual_essence = 0.0
    lineup.actual_card = False
    comp = lineup.comp
    if comp.is_room:
        return
    for tier in comp.paying_tiers:
        threshold = score_at_rank(reference, tier.hi)
        if threshold is not None and lineup.actual >= threshold:
            lineup.actual_cash, lineup.actual_essence, lineup.actual_card = tier.cash, float(tier.essence), tier.card
            return


# --------------------------------------------------------------------------- building lineups
def _slot_candidates(comp: Competition, pool: list[Card], forecasts: dict[str, Forecast]) -> dict[int, list[Card]]:
    value = {c.slug: forecasts[c.player].p_play * forecasts[c.player].mu * comp.multiplier(c) for c in pool}
    out: dict[int, list[Card]] = {}
    for i, slot in enumerate(comp.starters):
        fits = sorted((c for c in pool if c.positions[0] in slot), key=lambda c: -value[c.slug])
        if comp.cap is None:
            out[i] = fits[:CANDIDATES_PER_SLOT]
        else:  # capped rooms need the cheap cards as well as the good ones
            best_rate = sorted(fits, key=lambda c: -value[c.slug] / max(c.average, 20.0))
            keep = {c.slug: c for c in fits[:40]}
            keep.update({c.slug: c for c in best_rate[:40]})
            out[i] = list(keep.values())
    return out


def best_starters(
    comp: Competition,
    pool: list[Card],
    forecasts: dict[str, Forecast],
    keep: int = 3,
    beam: int = BEAM,
) -> list[list[Card]]:
    """Beam search over the starting slots: the highest expected points under every rule."""
    playable = [c for c in pool if comp.allows(c) and forecasts.get(c.player) and forecasts[c.player].p_play > 0]
    if len(playable) < comp.size:
        return []
    value = {c.slug: forecasts[c.player].p_play * forecasts[c.player].mu * comp.multiplier(c) for c in playable}
    candidates = _slot_candidates(comp, playable, forecasts)
    order = sorted(range(comp.size), key=lambda i: len(comp.starters[i]))
    cheapest = {i: min((c.average for c in candidates[i]), default=0.0) for i in order}

    beams: list[tuple[float, list[Card | None], float, int]] = [(0.0, [None] * comp.size, 0.0, 0)]
    for step, i in enumerate(order):
        left = len(order) - step - 1
        rest = sum(cheapest[j] for j in order[step + 1 :])
        nxt: list[tuple[float, list[Card | None], float, int]] = []
        for score, chosen, averages, in_season in beams:
            used = {c.player for c in chosen if c}
            for card in candidates[i]:
                if card.player in used:
                    continue
                total_avg = averages + card.average
                if comp.cap is not None and total_avg + rest > comp.cap:
                    continue
                seasons = in_season + (1 if card.in_season else 0)
                if comp.min_in_season and seasons + left < comp.min_in_season:
                    continue
                picked: list[Card | None] = list(chosen)
                picked[i] = card
                nxt.append((score + value[card.slug], picked, total_avg, seasons))
        nxt.sort(key=lambda b: -b[0])
        seen: set[frozenset[str]] = set()
        beams = []
        for candidate in nxt:
            signature = frozenset(c.slug for c in candidate[1] if c)
            if signature in seen:
                continue
            seen.add(signature)
            beams.append(candidate)
            if len(beams) >= beam:
                break
        if not beams:
            return []
    return [[c for c in b[1] if c] for b in beams[:keep]]


def build(
    comp: Competition,
    pool: list[Card],
    forecasts: dict[str, Forecast],
    rng: np.random.Generator,
    keep: int = 2,
    draws: int = DRAWS,
) -> list[Lineup]:
    """The best lineups this competition can take from the pool — starters only; benches come later."""
    out = []
    for starters in best_starters(comp, pool, forecasts, keep=keep):
        captain = max(
            range(len(starters)), key=lambda i: forecasts[starters[i].player].p_play * forecasts[starters[i].player].mu
        )
        lineup = Lineup(comp=comp, starters=list(starters), subs=[None] * len(comp.subs), captain=captain)
        out.append(evaluate(lineup, forecasts, rng, draws))
    return out


def fill_bench(
    lineups: list[Lineup],
    pool: list[Card],
    forecasts: dict[str, Forecast],
    rng: np.random.Generator,
    draws: int = DRAWS,
) -> list[Card]:
    """Put the cards no lineup wanted on the benches, one at a time, while they add value.

    A substitute is only kept when the lineup is worth more with him than without: he covers a starter who
    might not play, but the moment he comes in the lineup loses its multi-club and cap bonuses.
    """
    free = list(pool)
    improving = True
    while improving and free:
        improving = False
        best: tuple[float, Lineup, int, Card] | None = None
        # the same simulated gameweeks for "with him" and "without him", so a difference is really his
        probe = int(rng.integers(1 << 31))
        for lineup in lineups:
            evaluate(lineup, forecasts, np.random.default_rng(probe), draws)
            comp = lineup.comp
            for slot, taken in enumerate(lineup.subs):
                if taken is not None:
                    continue
                for card in free:
                    if card.positions[0] not in comp.subs[slot] or not comp.allows(card):
                        continue
                    if card.player in {c.player for c in lineup.cards}:
                        continue
                    if forecasts.get(card.player) is None or forecasts[card.player].p_play <= 0:
                        continue
                    trial = Lineup(comp=comp, starters=lineup.starters, subs=list(lineup.subs), captain=lineup.captain)
                    trial.subs[slot] = card
                    if not any(_can_replace(trial, slot, i) for i in range(comp.size)):
                        continue  # he could never come in (position, or the in-season rule)
                    evaluate(trial, forecasts, np.random.default_rng(probe), draws)
                    gain = (trial.p_return - lineup.p_return) + (trial.expected - lineup.expected) / 1000
                    if gain > 0.0005 and (best is None or gain > best[0]):
                        best = (gain, lineup, slot, card)
        if best:
            _, lineup, slot, card = best
            lineup.subs[slot] = card
            evaluate(lineup, forecasts, rng, draws)
            free = [c for c in free if c.slug != card.slug]
            improving = True
    return free


# --------------------------------------------------------------------------- whole gameweek
@dataclass
class Plan:
    lineups: list[Lineup]

    @property
    def cash(self) -> float:
        return sum(lu.e_cash for lu in self.lineups)

    @property
    def essence(self) -> float:
        return sum(lu.e_essence for lu in self.lineups)

    @property
    def rewards_expected(self) -> float:
        return sum(lu.p_return for lu in self.lineups)

    @property
    def cards_used(self) -> int:
        return sum(len(lu.cards) for lu in self.lineups)

    def chance_of_any(self) -> float:
        miss = 1.0
        for lineup in self.lineups:
            miss *= 1 - lineup.p_return
        return 1 - miss

    def signature(self) -> set[tuple[str, str]]:
        return {(lu.comp.key, c.slug) for lu in self.lineups for c in lu.cards}


def value(lineup: Lineup, cash_norm: float, essence_norm: float) -> float:
    """Cash and essence count at once, each against the best any single lineup reaches this gameweek."""
    return lineup.e_cash / cash_norm + lineup.e_essence / essence_norm


def make_plan(
    comps: list[Competition],
    cards: list[Card],
    forecasts: dict[str, Forecast],
    rng: np.random.Generator,
    cash_norm: float,
    essence_norm: float,
    temperature: float = 0.0,
    draws: int = DRAWS,
) -> Plan:
    pool = list(cards)
    entered: dict[str, int] = {}
    chosen: list[Lineup] = []
    cache: dict[str, list[Lineup]] = {}
    while True:
        options: list[tuple[float, Lineup]] = []
        for comp in comps:
            if entered.get(comp.key, 0) >= comp.teams_cap:
                continue
            if comp.key not in cache:
                cache[comp.key] = build(comp, pool, forecasts, rng, draws=draws)
            for lineup in cache[comp.key]:
                worth = value(lineup, cash_norm, essence_norm)
                if worth > 0 and lineup.p_return >= MIN_CHANCE and (lineup.e_essence > 0 or lineup.e_cash > 0):
                    options.append((worth, lineup))
        if not options:
            break
        options.sort(key=lambda o: -o[0])
        if temperature > 0 and len(options) > 1:
            top = options[:4]
            weights = np.exp(np.array([o[0] for o in top]) / max(temperature * top[0][0], 1e-9))
            picked = top[int(rng.choice(len(top), p=weights / weights.sum()))]
        else:
            picked = options[0]
        lineup = picked[1]
        chosen.append(lineup)
        entered[lineup.comp.key] = entered.get(lineup.comp.key, 0) + 1
        taken = {c.slug for c in lineup.cards}
        pool = [c for c in pool if c.slug not in taken]
        for key in list(cache):
            if key == lineup.comp.key or any(c.slug in taken for lu in cache[key] for c in lu.cards):
                del cache[key]
    fill_bench(chosen, pool, forecasts, rng, draws=draws)
    return Plan(chosen)


def plans(
    comps: list[Competition],
    cards: list[Card],
    forecasts: dict[str, Forecast],
    count: int = 5,
    runs: int = 40,
    seed: int = 11,
    draws: int = DRAWS,
) -> list[Plan]:
    """The best whole-gameweek plans, each different enough from the others to be a real choice."""
    rng = np.random.default_rng(seed)
    firsts = [lu for comp in comps for lu in build(comp, cards, forecasts, rng, keep=1, draws=draws)]
    cash_norm = max([lu.e_cash for lu in firsts] + [0.01])
    essence_norm = max([lu.e_essence for lu in firsts] + [1.0])
    found = [make_plan(comps, cards, forecasts, rng, cash_norm, essence_norm, 0.0, draws)]
    for _ in range(runs):
        found.append(make_plan(comps, cards, forecasts, rng, cash_norm, essence_norm, 0.35, draws))
    best_cash = max((p.cash for p in found), default=0.0) or 0.01
    best_essence = max((p.essence for p in found), default=0.0) or 1.0
    ranked = sorted(found, key=lambda p: -(p.cash / best_cash + p.essence / best_essence))
    picked: list[Plan] = []
    for plan in ranked:
        signature = plan.signature()
        if all(
            len(signature ^ other.signature()) / max(len(signature | other.signature()), 1) >= 0.2 for other in picked
        ):
            picked.append(plan)
        if len(picked) == count:
            break
    return picked
