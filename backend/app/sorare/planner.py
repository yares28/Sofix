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
from collections.abc import Callable, Mapping
from contextvars import ContextVar
from dataclasses import dataclass, field, replace

import numpy as np

from app.sorare import links
from app.sorare.model import CASH_IN_ESSENCE, ESSENCE_ORDER, Card, Competition, Forecast

SCORE_SD = 17.6
"""How far a player's real score lands from his forecast, in points (measured on the owner's players,
1–18 Sep 2026, against the same forecast the planner uses; 17.7 on the 461 LaLiga starts of GW21-24, 28 Oct 2026)."""

DRAWS = 3000
BEAM = 120
MIN_CHANCE = 0.005  # under half a percent a lineup waits: it is built from the cards and substitutes the others left
PRIORITY_FLOOR = (
    0.05  # under 5% a lineup of a preferred essence gets no priority: it only takes cards nothing else wants
)
MIN_PLAY = (
    0.30  # a starter who will probably not play is a zero in the lineup (GW21: keepers at 5 to 20%): he is never picked
)
CANDIDATES_PER_SLOT = 18
CAPTAIN_DRAWS = DRAWS  # simulated gameweeks for each try: big prizes are rare, 600 weeks picked noise (28 Oct 2026)


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
    """May this substitute slot cover that starter? (position, and an in-season competition's bench is in-season only)"""
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
    # Sorare: "Only In-Season cards can be used as subs in In-Season Arenas" (help.sorare.com, What is Arena)
    return not (comp.min_in_season and not sub.in_season)


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


def boost(lineup: Lineup) -> float:
    """Pro's Rare Reward Bonus: the prize grows with each Rare (or better) starter, more for the captain. 1 everywhere else."""
    rates = lineup.comp.reward_boosts
    out = 1.0
    for i, card in enumerate(lineup.starters):
        if card.rarity in rates:
            out += rates[card.rarity][(0 if card.in_season else 2) + (i == lineup.captain)]
    return out


def worth(lineup: Lineup) -> float:
    """What a lineup is expected to win, in essence: its essence plus its cash at `CASH_IN_ESSENCE` (the owner, 20 Oct 2026)."""
    return lineup.e_essence + CASH_IN_ESSENCE * lineup.e_cash


def weighted_worth(lineup: Lineup) -> float:
    """`worth` with each essence counted at its weight to the owner (`with_essence_weights`): what the plans are ranked on."""
    return lineup.e_essence * lineup.comp.essence_weight + CASH_IN_ESSENCE * lineup.e_cash


def with_essence_weights(comps: list[Competition], cards: list[Card]) -> list[Competition]:
    """Each competition with its essence weight: the share of the leagues its essence comes from that the owner plays (the owner, 28 Oct
    2026: "the main idea is getting players from the leagues I play, with the least dilution"). A league's own essence is 1 when he plays
    that league; Champion (five leagues) is his share of the five; a competition open to every league counts every league of the week.

    He plays a league when his cards fill a lineup of that league's own competition; with none, the leagues of his cards. No weight is 0:
    a lineup of a pool he does not play still beats none (the free competitions are always entered)."""
    every: set[str] = set().union(*(c.leagues for c in comps if c.leagues))
    mine = {
        league
        for c in comps
        if c.leagues and len(c.leagues) == 1 and sum(1 for card in cards if c.allows(card)) >= c.size
        for league in c.leagues
    } or {card.league for card in cards if card.league}
    # ponytail: every league counts the same, not by its number of players; weigh by players if the owner asks
    floor = 1 / max(len(every), 1)

    def weight(comp: Competition) -> float:
        pool = set(comp.leagues) if comp.leagues else every
        return 1.0 if not pool else round(max(len(pool & mine) / len(pool), floor), 3)

    return [replace(c, essence_weight=weight(c)) for c in comps]


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
    more = boost(lineup)
    lineup.e_cash = more * sum(p * t.cash for p, t in pairs)
    lineup.e_essence = more * sum(p * t.essence for p, t in pairs)


EVALUATED = ("expected", "low", "high", "p_return", "p_xp", "p_cash", "p_essence", "p_card", "e_cash", "e_essence")
# A search's lineups already priced, while `plans` runs: {(competition, forecasts, draws, captain, starters, bench): the numbers}. The
# same lineup is met again and again across a search's runs and benches (85% of the asks on 14 Oct 2026), and always draws the same
# weeks, so it is simulated once. Keyed by the objects' ids, which stay valid because `plans` holds them for as long as the memo lives.
_evaluated: ContextVar[dict[tuple[object, ...], tuple[object, ...]] | None] = ContextVar("evaluated", default=None)


def evaluate(
    lineup: Lineup, forecasts: dict[str, Forecast], rng: np.random.Generator | None = None, draws: int = DRAWS
) -> Lineup:
    """Fill in a lineup's expected score, its range and what it can be expected to win.

    Without `rng` the simulated weeks are the lineup's own (`_seed`): the same lineup always gets the same numbers."""
    memo = _evaluated.get() if rng is None else None
    key = (
        id(lineup.comp),
        id(forecasts),
        draws,
        lineup.captain,
        tuple(c.slug for c in lineup.starters),
        tuple(c.slug if c else None for c in lineup.subs),
    )
    if memo is not None and key in memo:
        *numbers, probs = memo[key]
        for name, number in zip(EVALUATED, numbers, strict=True):
            setattr(lineup, name, number)
        lineup.tier_probs = list(probs)  # type: ignore[call-overload]
        return lineup
    rng = rng if rng is not None else np.random.default_rng(_seed(lineup.comp, lineup.starters))
    scores = simulate(lineup, forecasts, rng, draws)
    lineup.expected = float(scores.mean())
    lineup.low, lineup.high = (float(v) for v in np.percentile(scores, [10, 90]))
    _rewards(lineup, scores, rng)
    if memo is not None:
        memo[key] = (*(getattr(lineup, name) for name in EVALUATED), tuple(lineup.tier_probs))
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
def _slot_candidates(comp: Competition, pool: list[Card], forecasts: Mapping[str, Forecast]) -> dict[int, list[Card]]:
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
    forecasts: Mapping[str, Forecast],
    keep: int = 3,
    beam: int = BEAM,
    rule: Callable[[list[Card | None]], bool] | None = None,
) -> list[list[Card]]:
    """Beam search over the starting slots: the highest expected points under every rule.

    `rule` is one more: it is asked about every partly filled lineup (None for a slot still open) and says whether it can still be
    completed in a way the rule allows (the strategy lab's constraints, `strategies.py`)."""
    playable = [
        c for c in pool if comp.allows(c) and forecasts.get(c.player) and forecasts[c.player].p_play >= MIN_PLAY
    ]
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
                if rule is not None and not rule(picked):
                    continue
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
    """The captain: of all the starters, the one whose captaincy wins the lineup the most on average, as the plans are ranked (then the
    best chance of a reward, then the best expected score), the same simulated gameweeks for each. The captain's bonus multiplies a score, so a player with a big ceiling can earn more of
    it than a steady one with a higher average (GW21-25: the top-three rule picked the week's best starter 9 times in 32)."""
    ranked = sorted(
        range(len(starters)), key=lambda i: -(forecasts[starters[i].player].p_play * forecasts[starters[i].player].mu)
    )
    if len(ranked) == 1:
        return ranked[0]
    best, best_key = ranked[0], (-1.0, -1.0, -1.0)
    for i in ranked:  # the same simulated weeks for every try (`_seed` leaves the captain out)
        trial = Lineup(comp=comp, starters=list(starters), subs=[None] * len(comp.subs), captain=i)
        evaluate(trial, forecasts, draws=CAPTAIN_DRAWS)
        key = (round(weighted_worth(trial), 1), round(trial.p_return, 3), trial.expected)
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
    view: Mapping[str, Forecast] | None = None,
    rule: Callable[[list[Card | None]], bool] | None = None,
) -> list[Lineup]:
    """The best lineups this competition can take from the pool — starters only; benches come later.

    `view` and `rule` are a strategy's way of picking (`strategies.py`): the starters are chosen on the players' numbers in `view` and
    under `rule`, then every lineup is priced on the real `forecasts`."""
    out = []
    for starters in best_starters(comp, pool, view if view is not None else forecasts, keep=keep, rule=rule):
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
    # A lineup's best substitute only changes when its own bench does or when that card goes to another bench: `evaluate` draws the
    # same weeks for the same starters (`_seed`), so the other lineups are not simulated again each round (14 Oct 2026: asking
    # every lineup again after every substitute was most of the refresh's planning time).
    bests: dict[int, tuple[float, int, Card] | None] = {}
    while free:
        best: tuple[float, int, int, Card] | None = None
        for i, lineup in enumerate(lineups):
            if i not in bests:
                bests[i] = _best_sub(lineup, free, forecasts, draws)
            found = bests[i]
            if found and (best is None or found[0] > best[0]):
                best = (found[0], i, found[1], found[2])
        if best is None:
            break
        _, i, slot, card = best
        lineup = lineups[i]
        lineup.subs[slot] = card
        evaluate(lineup, forecasts, draws=draws)
        free = [c for c in free if c.slug != card.slug]
        bests = {j: b for j, b in bests.items() if j != i and (b is None or b[2].slug != card.slug)}
    return free


def _best_sub(
    lineup: Lineup, free: list[Card], forecasts: dict[str, Forecast], draws: int
) -> tuple[float, int, Card] | None:
    """The substitute who adds the most to this lineup (gain, slot, card), the first of equals; none when no one adds value."""
    # the same simulated gameweeks for "with him" and "without him" (`_seed`), so a difference is really his
    evaluate(lineup, forecasts, draws=draws)
    comp = lineup.comp
    best: tuple[float, int, Card] | None = None
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
                best = (gain, slot, card)
    return best


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
        more = boost(lineup)
        won = np.zeros(draws, dtype=bool)
        for k, tier in enumerate(tiers):
            hit = where == k
            if tier.pays:
                won |= hit
            else:
                xp |= hit
            cash += hit * tier.cash * more
            essence += hit * tier.essence * more
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


POLISH_PLANS = 3  # the best plans of a search that are polished (`polish`)
POLISH_ROUNDS = 3
MIN_GAIN = 0.5  # essence: a move that adds less is not worth making


def _fits(
    comp: Competition,
    starters: list[Card],
    forecasts: Mapping[str, Forecast],
    rule: Callable[[list[Card | None]], bool] | None,
) -> bool:
    """Do these starters obey every rule `best_starters` obeys?"""
    if len({c.player for c in starters}) < len(starters):
        return False
    for slot, card in zip(comp.starters, starters, strict=True):
        f = forecasts.get(card.player)
        if card.positions[0] not in slot or not comp.allows(card) or f is None or f.p_play < MIN_PLAY:
            return False
    if comp.cap is not None and sum(c.average for c in starters) > comp.cap:
        return False
    if comp.min_in_season and sum(1 for c in starters if c.in_season) < comp.min_in_season:
        return False
    return rule is None or rule(list(starters))


def polish(
    plan: Plan,
    cards: list[Card],
    forecasts: dict[str, Forecast],
    draws: int = DRAWS,
    rule_for: Callable[[Competition], Callable[[list[Card | None]], bool] | None] | None = None,
    rounds: int = POLISH_ROUNDS,
) -> Plan:
    """Move cards between a plan's lineups, and in from the cards it left out, while that wins more.

    The plan is built one lineup at a time, best first, so the first lineup can take a card a later one needed more. Each move puts one
    card in a starting slot; when it came from another lineup, that lineup refills its slot with the card it gave up or a spare. Every
    lineup is priced on the same simulated weeks (each player plays and scores once a week), so a gain is the move's and not the dice's.
    Benches are made again afterwards, and the plan is kept as it was unless the polished one is worth more."""
    if not plan.lineups:
        return plan
    people: dict[str, Card] = {}
    for c in [*cards, *(c for lu in plan.lineups for c in lu.cards)]:
        if forecasts.get(c.player) is not None:
            people.setdefault(c.player, c)
    column = {player: i for i, player in enumerate(people)}
    plays, scores = _draw(list(people.values()), forecasts, np.random.default_rng(zlib.crc32(b"polish")), draws)
    pool = [c for c in cards if c.player in column]
    value = {c.slug: forecasts[c.player].p_play * forecasts[c.player].mu for c in pool}

    def priced(lu: Lineup) -> float:
        cols = [column[c.player] for c in lu.cards]
        where = landed(
            lu, totals(lu, plays[:, cols], scores[:, cols]), np.random.default_rng(_seed(lu.comp, lu.starters))
        )
        won = [(float((where == k).mean()), tier) for k, tier in enumerate(lu.comp.rewarding_tiers)]
        essence = sum(p * t.essence for p, t in won) * lu.comp.essence_weight
        return boost(lu) * (essence + CASH_IN_ESSENCE * sum(p * t.cash for p, t in won))

    lineups = [Lineup(lu.comp, list(lu.starters), [None] * len(lu.comp.subs), lu.captain) for lu in plan.lineups]
    rules = [rule_for(lu.comp) if rule_for else None for lu in lineups]
    now = [priced(lu) for lu in lineups]
    changed: set[int] = set()
    for _ in range(rounds):
        moved = False
        for i in range(len(lineups)):
            comp = lineups[i].comp
            for s in range(comp.size):
                owner = {c.slug: j for j, lu in enumerate(lineups) for c in lu.starters}
                fits = sorted(
                    (c for c in pool if c.positions[0] in comp.starters[s] and comp.allows(c)),
                    key=lambda c: -value[c.slug],
                )
                for cand in fits[:CANDIDATES_PER_SLOT]:
                    here = lineups[i]
                    out, j = here.starters[s], owner.get(cand.slug)
                    if j == i:
                        continue
                    new_i = list(here.starters)
                    new_i[s] = cand
                    if not _fits(comp, new_i, forecasts, rules[i]):
                        continue
                    trials = {i: Lineup(comp, new_i, [None] * len(comp.subs), here.captain)}
                    if j is not None:
                        there = lineups[j]
                        t = next(k for k, c in enumerate(there.starters) if c.slug == cand.slug)
                        taken = {c.slug for k, lu in enumerate(lineups) if k not in (i, j) for c in lu.starters}
                        taken |= {c.slug for c in new_i} | {c.slug for k, c in enumerate(there.starters) if k != t}
                        refill = sorted(
                            (
                                c
                                for c in [out, *pool]
                                if c.slug not in taken
                                and c.positions[0] in there.comp.starters[t]
                                and there.comp.allows(c)
                            ),
                            key=lambda c: -value.get(c.slug, 0.0),
                        )
                        for r in refill[:CANDIDATES_PER_SLOT]:
                            new_j = list(there.starters)
                            new_j[t] = r
                            if _fits(there.comp, new_j, forecasts, rules[j]):
                                trials[j] = Lineup(there.comp, new_j, [None] * len(there.comp.subs), there.captain)
                                break
                        else:
                            continue
                    prices = {k: priced(lu) for k, lu in trials.items()}
                    if sum(prices[k] - now[k] for k in trials) > MIN_GAIN:
                        for k, lu in trials.items():
                            lineups[k], now[k] = lu, prices[k]
                        changed |= set(trials)
                        moved = True
                        owner = {c.slug: j for j, lu in enumerate(lineups) for c in lu.starters}
        if not moved:
            break
    if not changed:
        return plan
    rng = np.random.default_rng(zlib.crc32(b"polish captain"))
    for k in changed:
        lu = lineups[k]
        lu.captain = _captain(lu.comp, lu.starters, forecasts, rng)
    for lu in lineups:
        evaluate(lu, forecasts, draws=draws)
    starting = {c.slug for lu in lineups for c in lu.starters}
    fill_bench(lineups, [c for c in cards if c.slug not in starting], forecasts, rng, draws=draws)
    polished = Plan(lineups)
    if sum(weighted_worth(lu) for lu in polished.lineups) <= sum(weighted_worth(lu) for lu in plan.lineups):
        return plan
    return polished


def value(lineup: Lineup, cash_norm: float, essence_norm: float) -> float:
    """Cash and essence count at once, each against the best any single lineup reaches this gameweek (a Room's fee taken off)."""
    return lineup.e_cash / cash_norm + lineup.net_essence / essence_norm


LAST = frozenset({"all_star"})  # essence kinds that are built after every other competition has taken its cards


def enterable(comp: Competition) -> bool:
    """The owner, 13 Oct 2026: a Room that charges a fee (All Star Cap 260) goes in no plan. An All Star lineup may: it is built last."""
    return not comp.fee


def worth_entering(lineup: Lineup, floor: float = MIN_CHANCE) -> bool:
    """A lineup goes in a plan when its competition may be entered and it has a real chance of being paid (`floor` 0: any chance)."""
    return enterable(lineup.comp) and lineup.p_return >= floor


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
    view: Mapping[str, Forecast] | None = None,
    rule_for: Callable[[Competition], Callable[[list[Card | None]], bool] | None] | None = None,
) -> Plan:
    pool = list(cards)
    entered: dict[str, int] = {}
    chosen: list[Lineup] = []
    cache: dict[str, list[Lineup]] = {}
    floor = MIN_CHANCE
    long_from: int | None = None
    while True:
        options: list[tuple[int, float, Lineup]] = []
        for comp in comps:
            if entered.get(comp.key, 0) >= comp.teams_cap:
                continue
            if comp.key not in cache:
                cache[comp.key] = build(
                    comp, pool, forecasts, rng, draws=draws, view=view, rule=rule_for(comp) if rule_for else None
                )
            for lineup in cache[comp.key]:
                if worth_entering(lineup, floor):
                    # The most expected reward first, cash counted in essence (20 Oct), essence by its weight (28 Oct); essence-kind
                    # priority breaks ties.
                    options.append((priority(lineup, order), weighted_worth(lineup), lineup))
        if not options:
            if long_from is not None:
                break
            # Every lineup with a real chance has its cards, and now its substitutes. What is left then fills each free competition,
            # whatever the chance (the owner, 13 Oct 2026: "if it costs nothing then just add it. What if it hits that 0.1%?").
            pool = fill_bench(chosen, pool, forecasts, rng, draws=draws)
            long_from, floor = len(chosen), 0.0
            cache.clear()
            continue
        # An All Star lineup is built last (13 Oct): only when no other competition can take the cards left.
        options = [o for o in options if o[2].comp.essence_kind not in LAST] or options
        options.sort(key=lambda o: (-o[1], o[0], -o[2].p_return, -value(o[2], cash_norm, essence_norm)))
        top = options[:4]
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
    fill_bench(chosen[long_from:], pool, forecasts, rng, draws=draws)
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
    view: Mapping[str, Forecast] | None = None,
    rule_for: Callable[[Competition], Callable[[list[Card | None]], bool] | None] | None = None,
) -> list[Plan]:
    """The best whole-gameweek plans, each different enough from the others to be a real choice.

    The best maximizes the expected reward, essence plus cash at `CASH_IN_ESSENCE` (the owner, 20 Oct 2026; essence alone
    from 11 Oct). The owner's essence-kind order and reward chance break ties.
    """
    token = _evaluated.set({})
    try:
        return _plans(comps, cards, forecasts, count, runs, seed, draws, order, view, rule_for)
    finally:
        _evaluated.reset(token)


def _plans(
    comps: list[Competition],
    cards: list[Card],
    forecasts: dict[str, Forecast],
    count: int,
    runs: int,
    seed: int,
    draws: int,
    order: tuple[str, ...],
    view: Mapping[str, Forecast] | None,
    rule_for: Callable[[Competition], Callable[[list[Card | None]], bool] | None] | None,
) -> list[Plan]:
    comps = with_essence_weights([comp for comp in comps if enterable(comp)], cards)
    rng = np.random.default_rng(seed)
    firsts = [
        lu
        for comp in comps
        for lu in build(
            comp, cards, forecasts, rng, keep=1, draws=draws, view=view, rule=rule_for(comp) if rule_for else None
        )
    ]
    cash_norm = max([lu.e_cash for lu in firsts] + [0.01])
    essence_norm = max([lu.net_essence for lu in firsts] + [1.0])
    found = [make_plan(comps, cards, forecasts, rng, cash_norm, essence_norm, 0.0, draws, order, view, rule_for)]
    for _ in range(runs):
        found.append(
            make_plan(comps, cards, forecasts, rng, cash_norm, essence_norm, 0.35, draws, order, view, rule_for)
        )
    if view is None:  # a strategy's plan keeps its own picks: polishing on Sofix's numbers would undo them
        found.sort(key=lambda plan: -sum(weighted_worth(lu) for lu in plan.lineups))
        found[:POLISH_PLANS] = [polish(plan, cards, forecasts, draws, rule_for) for plan in found[:POLISH_PLANS]]
    for plan in found:
        plan.outcomes = plan_outcomes(plan, forecasts, order, draws)
    best_cash = max((p.cash for p in found), default=0.0) or 0.01
    best_essence = max((p.essence - p.fees for p in found), default=0.0) or 1.0

    def key(plan: Plan) -> tuple[float, ...]:
        kinds = (plan.outcomes.by_kind if plan.outcomes else {}) or {}
        return (
            -sum(weighted_worth(lu) for lu in plan.lineups),
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
