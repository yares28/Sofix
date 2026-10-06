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
import zlib
from dataclasses import dataclass, field

import numpy as np

from app.sorare import links
from app.sorare.model import ESSENCE_ORDER, Card, Competition, Forecast

SCORE_SD = 17.6
"""How far a player's real score lands from his forecast, in points (measured on the owner's players,
1–18 Sep 2026, against the same forecast the planner uses)."""

DRAWS = 3000
BEAM = 120
MIN_CHANCE = 0.005  # under half a percent a lineup is not worth the cards, even where entry is free
PRIORITY_FLOOR = (
    0.05  # under 5% a lineup of a preferred essence gets no priority: it only takes cards nothing else wants
)
CANDIDATES_PER_SLOT = 18
CAPTAIN_CANDIDATES = 3  # starters with the best expected points that are tried as captain
CAPTAIN_DRAWS = 600  # simulated gameweeks for each try


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
    e_essence: float = 0.0  # what it wins on average, before a Room's entry fee (`net_essence` takes the fee off)
    p_card: float = 0.0
    p_cash: float = 0.0  # the chance of ending on a level that pays cash
    p_essence: float = 0.0  # ... that pays essence
    p_xp: float = 0.0  # ... that gives XP only (never counted as being paid)
    tier_probs: list[float] = field(
        default_factory=list
    )  # one per `comp.rewarding_tiers`: the chance of ending exactly there
    actual: float | None = None
    actual_cash: float = 0.0
    actual_essence: float = 0.0
    actual_card: bool = False
    actual_xp: int = 0
    came_in: list[tuple[str, str]] = field(default_factory=list)  # (substitute, the starter he replaced)
    bonus_lost: bool = False

    @property
    def cards(self) -> list[Card]:
        return [*self.starters, *[s for s in self.subs if s]]

    @property
    def bench(self) -> list[Card]:
        return [s for s in self.subs if s]

    @property
    def net_essence(self) -> float:
        return self.e_essence - self.comp.fee


def _seed(comp: Competition, starters: list[Card]) -> int:
    """The same competition and starters always draw the same simulated weeks: a lineup's numbers never change from one look to
    the next, and a substitute or a captain is judged on the very weeks the lineup without him was (the captain and the bench are
    left out of the seed on purpose)."""
    return zlib.crc32("|".join([comp.key, *sorted(c.slug for c in starters)]).encode())


def _draw(
    cards: list[Card], forecasts: dict[str, Forecast], rng: np.random.Generator, draws: int
) -> tuple[np.ndarray, np.ndarray]:
    """Who plays and what each scores in every simulated week. Drawn card by card, so a card added at the end (a substitute)
    leaves the others' draws exactly as they were."""
    n = len(cards)
    uniform = np.empty((draws, n))
    normal = np.empty((draws, n))
    for i in range(n):
        uniform[:, i] = rng.random(draws)
        normal[:, i] = rng.standard_normal(draws)
    p = np.array([forecasts[c.player].p_play for c in cards])
    mu = np.array([forecasts[c.player].mu for c in cards])
    sd = np.array([SCORE_SD if forecasts[c.player].sd is None else forecasts[c.player].sd for c in cards])
    plays = uniform < p
    together = links.matrix([c.positions[0] for c in cards], [forecasts[c.player].links for c in cards])
    # players of one game score together: a keeper and his defenders up and down, a keeper against the other side's forwards
    shocks = normal if np.array_equal(together, np.eye(n)) else normal @ np.linalg.cholesky(together).T
    return plays, np.clip(mu + sd * shocks, 0, 100)


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
    plays, scores = _draw(lineup.cards, forecasts, rng, draws)
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


def landed(lineup: Lineup, scores: np.ndarray, rng: np.random.Generator) -> np.ndarray:
    """For each simulated (or real) week, the index in `comp.rewarding_tiers` the lineup ends on, or -1 for nothing.

    A reward is all or nothing: the score that reached a level in the reference week wins that level whole. A Room's place comes
    from nine real Room scores drawn at random."""
    comp = lineup.comp
    tiers = comp.rewarding_tiers
    out = np.full(len(scores), -1)
    if comp.is_room:
        if not comp.reference_rooms:
            return out
        others = rng.choice(np.array(comp.reference_rooms), size=(len(scores), max(comp.room_size - 1, 9)))
        place = 1 + (others > scores[:, None]).sum(axis=1)
        for k, tier in enumerate(tiers):
            out[(out < 0) & (place >= tier.lo) & (place <= tier.hi)] = k
        return out
    for k, tier in enumerate(tiers):  # best first: a week is given the best level it reaches
        threshold = score_at_rank(comp.reference, tier.hi)
        if threshold is not None:
            out[(out < 0) & (scores >= threshold)] = k
    return out


def _rewards(lineup: Lineup, scores: np.ndarray, rng: np.random.Generator) -> None:
    tiers = lineup.comp.rewarding_tiers
    where = landed(lineup, scores, rng)
    probs = [float((where == k).mean()) for k in range(len(tiers))]
    pairs = list(zip(probs, tiers, strict=True))
    lineup.tier_probs = probs
    lineup.p_return = sum(p for p, t in pairs if t.pays)
    lineup.p_xp = sum(p for p, t in pairs if not t.pays)
    lineup.p_cash = sum(p for p, t in pairs if t.cash)
    lineup.p_essence = sum(p for p, t in pairs if t.essence)
    lineup.p_card = sum(p for p, t in pairs if t.card)
    lineup.e_cash = sum(p * t.cash for p, t in pairs)
    lineup.e_essence = sum(p * t.essence for p, t in pairs)


def evaluate(
    lineup: Lineup, forecasts: dict[str, Forecast], rng: np.random.Generator | None = None, draws: int = DRAWS
) -> Lineup:
    """Fill in a lineup's expected score, its range and what it can be expected to win.

    Without `rng` the simulated weeks are the lineup's own (`_seed`): the same lineup always gets the same numbers."""
    rng = rng if rng is not None else np.random.default_rng(_seed(lineup.comp, lineup.starters))
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
    lineup.actual_xp = 0
    comp = lineup.comp
    if comp.is_room:
        return
    for tier in comp.rewarding_tiers:
        threshold = score_at_rank(reference, tier.hi)
        if threshold is not None and lineup.actual >= threshold:
            lineup.actual_cash, lineup.actual_essence, lineup.actual_card = tier.cash, float(tier.essence), tier.card
            lineup.actual_xp = tier.xp
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


def _captain(comp: Competition, starters: list[Card], forecasts: dict[str, Forecast], rng: np.random.Generator) -> int:
    """The captain: of the three starters with the best expected points, the one whose captaincy gives the lineup the best chance of a
    reward (then the best expected score), the same simulated gameweeks for each. The captain's bonus multiplies a score, so a player with a
    big ceiling can earn more of it than a steady one with a higher average."""
    ranked = sorted(
        range(len(starters)), key=lambda i: -(forecasts[starters[i].player].p_play * forecasts[starters[i].player].mu)
    )[:CAPTAIN_CANDIDATES]
    if len(ranked) == 1:
        return ranked[0]
    best, best_key = ranked[0], (-1.0, -1.0)
    for i in ranked:  # the same simulated weeks for every try (`_seed` leaves the captain out)
        trial = Lineup(comp=comp, starters=list(starters), subs=[None] * len(comp.subs), captain=i)
        evaluate(trial, forecasts, draws=CAPTAIN_DRAWS)
        key = (round(trial.p_return, 3), trial.expected)
        if key > best_key:
            best, best_key = i, key
    return best


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
        lineup = Lineup(
            comp=comp,
            starters=list(starters),
            subs=[None] * len(comp.subs),
            captain=_captain(comp, starters, forecasts, rng),
        )
        out.append(evaluate(lineup, forecasts, draws=draws))
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
        # the same simulated gameweeks for "with him" and "without him" (`_seed`), so a difference is really his
        for lineup in lineups:
            evaluate(lineup, forecasts, draws=draws)
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
                    evaluate(trial, forecasts, draws=draws)
                    gain = (trial.p_return - lineup.p_return) + (trial.expected - lineup.expected) / 1000
                    if gain > 0.0005 and (best is None or gain > best[0]):
                        best = (gain, lineup, slot, card)
        if best:
            _, lineup, slot, card = best
            lineup.subs[slot] = card
            evaluate(lineup, forecasts, draws=draws)
            free = [c for c in free if c.slug != card.slug]
            improving = True
    return free


# --------------------------------------------------------------------------- whole gameweek
@dataclass
class Outcomes:
    """What a whole plan can end the week with, from one set of simulated weeks shared by all its lineups: two lineups holding
    the same player, or players of the same game, rise and fall together, so the chances are not multiplied as if apart."""

    p_any: float = 0.0  # paid anything: cash, essence or a card (XP never counts)
    p_cash: float = 0.0
    p_essence: float = 0.0
    p_card: float = 0.0
    p_xp: float = 0.0  # some lineup ends on an XP level and nothing pays
    by_kind: dict[str, float] = field(default_factory=dict)  # paid anything by a lineup of that essence kind
    likely: dict[str, float] = field(
        default_factory=dict
    )  # the most likely winnings (essence, cash, cards), fees not taken off
    p_likely: float = 0.0


@dataclass
class Plan:
    lineups: list[Lineup]
    outcomes: Outcomes | None = None

    @property
    def cash(self) -> float:
        return sum(lu.e_cash for lu in self.lineups)

    @property
    def essence(self) -> float:
        """Essence won on average, entry fees not taken off (`fees` says what entering costs)."""
        return sum(lu.e_essence for lu in self.lineups)

    @property
    def fees(self) -> int:
        return sum(lu.comp.fee for lu in self.lineups)

    @property
    def rewards_expected(self) -> float:
        return sum(lu.p_return for lu in self.lineups)

    @property
    def cards_used(self) -> int:
        return sum(len(lu.cards) for lu in self.lineups)

    def chance_of_any(self) -> float:
        if self.outcomes is not None:
            return self.outcomes.p_any
        miss = 1.0
        for lineup in self.lineups:
            miss *= 1 - lineup.p_return
        return 1 - miss

    def signature(self) -> set[tuple[str, str]]:
        return {(lu.comp.key, c.slug) for lu in self.lineups for c in lu.cards}


def plan_outcomes(
    plan: Plan, forecasts: dict[str, Forecast], order: tuple[str, ...] = ESSENCE_ORDER, draws: int = DRAWS
) -> Outcomes:
    """Simulate every lineup of a plan on the same weeks: each player plays and scores once a week, whichever lineups hold him."""
    if not plan.lineups:
        return Outcomes()
    rank = {kind: i for i, kind in enumerate(order)}
    # Players of the preferred kinds first: their correlated draws then do not depend on who else the plan holds.
    first: dict[str, Card] = {}
    for lineup in sorted(plan.lineups, key=lambda lu: rank.get(lu.comp.essence_kind, len(rank))):
        for card in lineup.cards:
            first.setdefault(card.player, card)
    people = list(first.values())
    plays, scores = _draw(people, forecasts, np.random.default_rng(zlib.crc32(b"plan")), draws)
    column = {card.player: i for i, card in enumerate(people)}
    paid = np.zeros(draws, dtype=bool)
    xp = np.zeros(draws, dtype=bool)
    cash, essence, cards = np.zeros(draws), np.zeros(draws), np.zeros(draws)
    has = {
        "cash": np.zeros(draws, dtype=bool),
        "essence": np.zeros(draws, dtype=bool),
        "card": np.zeros(draws, dtype=bool),
    }
    by_kind: dict[str, np.ndarray] = {}
    for lineup in plan.lineups:
        cols = [column[c.player] for c in lineup.cards]
        total = totals(lineup, plays[:, cols], scores[:, cols])
        tiers = lineup.comp.rewarding_tiers
        where = landed(lineup, total, np.random.default_rng(_seed(lineup.comp, lineup.starters)))
        won = np.zeros(draws, dtype=bool)
        for k, tier in enumerate(tiers):
            hit = where == k
            if tier.pays:
                won |= hit
            else:
                xp |= hit
            cash += hit * tier.cash
            essence += hit * tier.essence
            cards += hit * tier.card
            has["cash"] |= hit & bool(tier.cash)
            has["essence"] |= hit & bool(tier.essence)
            has["card"] |= hit & tier.card
        paid |= won
        kind = lineup.comp.essence_kind
        by_kind[kind] = by_kind.get(kind, np.zeros(draws, dtype=bool)) | won
    results: dict[tuple[float, float, float], int] = {}
    for result in zip(np.round(essence), np.round(cash, 2), cards, strict=True):
        results[result] = results.get(result, 0) + 1
    (e, c, n), count = max(results.items(), key=lambda item: item[1])
    return Outcomes(
        p_any=float(paid.mean()),
        p_cash=float(has["cash"].mean()),
        p_essence=float(has["essence"].mean()),
        p_card=float(has["card"].mean()),
        p_xp=float((xp & ~paid).mean()),
        by_kind={kind: float(hit.mean()) for kind, hit in by_kind.items()},
        likely={"essence": float(e), "cash": float(c), "cards": float(n)},
        p_likely=count / draws,
    )


def value(lineup: Lineup, cash_norm: float, essence_norm: float) -> float:
    """Cash and essence count at once, each against the best any single lineup reaches this gameweek (a Room's fee taken off)."""
    return lineup.e_cash / cash_norm + lineup.net_essence / essence_norm


def worth_entering(lineup: Lineup) -> bool:
    """A lineup goes in a plan when it has a real chance of being paid, and a Room only when it wins back more than its fee on
    average (the owner, 6 Oct 2026: never a Room that loses essence)."""
    if lineup.p_return < MIN_CHANCE:
        return False
    return not lineup.comp.is_room or lineup.net_essence > 0


def priority(lineup: Lineup, order: tuple[str, ...]) -> int:
    """Where a lineup stands in the owner's essence order: his first kind is 0. A long shot (under 5%) comes after every kind."""
    if lineup.p_return < PRIORITY_FLOOR:
        return len(order) + 1
    kind = lineup.comp.essence_kind
    return order.index(kind) if kind in order else len(order)


def make_plan(
    comps: list[Competition],
    cards: list[Card],
    forecasts: dict[str, Forecast],
    rng: np.random.Generator,
    cash_norm: float,
    essence_norm: float,
    temperature: float = 0.0,
    draws: int = DRAWS,
    order: tuple[str, ...] = ESSENCE_ORDER,
) -> Plan:
    pool = list(cards)
    entered: dict[str, int] = {}
    chosen: list[Lineup] = []
    cache: dict[str, list[Lineup]] = {}
    while True:
        options: list[tuple[int, float, Lineup]] = []
        for comp in comps:
            if entered.get(comp.key, 0) >= comp.teams_cap:
                continue
            if comp.key not in cache:
                cache[comp.key] = build(comp, pool, forecasts, rng, draws=draws)
            for lineup in cache[comp.key]:
                if worth_entering(lineup):
                    # the owner's essence order first (6 Oct 2026); inside a kind, the lineup most likely to be paid, what it
                    # pays breaking a tie (5 Oct 2026: a reward is all or nothing)
                    options.append(
                        (
                            priority(lineup, order),
                            lineup.p_return + value(lineup, cash_norm, essence_norm) / 1000,
                            lineup,
                        )
                    )
        if not options:
            break
        options.sort(key=lambda o: (o[0], -o[1]))
        top = [o for o in options if o[0] == options[0][0]][:4]
        if temperature > 0 and len(top) > 1:
            weights = np.exp(np.array([o[1] for o in top]) / max(temperature * top[0][1], 1e-9))
            picked = top[int(rng.choice(len(top), p=weights / weights.sum()))]
        else:
            picked = options[0]
        lineup = picked[2]
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
    order: tuple[str, ...] = ESSENCE_ORDER,
) -> list[Plan]:
    """The best whole-gameweek plans, each different enough from the others to be a real choice.

    The best is the one most likely to be paid by the owner's first essence kind, then his second and his third (6 Oct 2026), then
    the one most likely to be paid anything (5 Oct 2026: a reward is all or nothing); what a plan pays only breaks a tie.
    """
    rng = np.random.default_rng(seed)
    firsts = [lu for comp in comps for lu in build(comp, cards, forecasts, rng, keep=1, draws=draws)]
    cash_norm = max([lu.e_cash for lu in firsts] + [0.01])
    essence_norm = max([lu.net_essence for lu in firsts] + [1.0])
    found = [make_plan(comps, cards, forecasts, rng, cash_norm, essence_norm, 0.0, draws, order)]
    for _ in range(runs):
        found.append(make_plan(comps, cards, forecasts, rng, cash_norm, essence_norm, 0.35, draws, order))
    for plan in found:
        plan.outcomes = plan_outcomes(plan, forecasts, order, draws)
    best_cash = max((p.cash for p in found), default=0.0) or 0.01
    best_essence = max((p.essence - p.fees for p in found), default=0.0) or 1.0

    def key(plan: Plan) -> tuple[float, ...]:
        kinds = (plan.outcomes.by_kind if plan.outcomes else {}) or {}
        return (
            *(-round(kinds.get(kind, 0.0), 2) for kind in order),
            -round(plan.chance_of_any(), 3),
            -(plan.cash / best_cash + (plan.essence - plan.fees) / best_essence),
        )

    picked: list[Plan] = []
    for plan in sorted(found, key=key):
        signature = plan.signature()
        if all(
            len(signature ^ other.signature()) / max(len(signature | other.signature()), 1) >= 0.2 for other in picked
        ):
            picked.append(plan)
        if len(picked) == count:
            break
    return picked
