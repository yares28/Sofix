import type { ArcadeCard, ArcadeGame } from "./arcade";

/**
 * Arcade planner (plans/set.md, steps 3 to 6). Pure: the page hands it what Sorare and Sofix said, it never reads anything.
 *
 * A card's score in a game = his score if he plays (Sorare's projection, else his own average of the games he played) × his chance
 * to start × Sorare's bonus. Sorare adds its bonuses (read 21 Oct: a captain with a 2% club bonus showed 1.52), so the bonus is
 * 1 + edition + club + captain. A card with no start % is kept and counted as playing (owner's answer 10), and marked.
 */

export type StartSource = "sorare" | "futbolfantasy" | "sofix";
export type Outlook = {
  card: ArcadeCard;
  game: ArcadeGame;
  /** His score if he plays, and whose number it is; null when Sorare has no projection and he has no game to average. */
  score: number | null;
  scoreSource: "sorare" | "form" | null;
  /** His chance to start, 0 to 1, and whose; null when no source has one yet. */
  start: number | null;
  startSource: StartSource | null;
  /** His last scores in games he played (minutes > 0), newest first. */
  past: number[];
  /** Edition plus club bonus, added: 0.09 for a +5% edition and a +4% club. Club null when it was not read. */
  bonus: number;
  club: number | null;
};

export const SLOTS = ["GK", "DEF", "MID", "FWD", "EXTRA"] as const;
export type Slot = (typeof SLOTS)[number];
const FITS: Record<Slot, string[]> = { GK: ["Goalkeeper"], DEF: ["Defender"], MID: ["Midfielder"], FWD: ["Forward"], EXTRA: ["Defender", "Midfielder", "Forward"] };
export const fits = (card: Pick<ArcadeCard, "positions">, slot: Slot) => card.positions.some((p) => FITS[slot].includes(p));

export type LineupPick = { slot: Slot; outlook: Outlook; captain: boolean };
export type Lineup = {
  picks: LineupPick[];
  /** Expected total, and Sorare's total sorted low to high over the simulated games (chanceOf reads it). */
  expected: number;
  totals: number[];
  /** When the last of its games kicks off, and when it settles (Sorare counts a score 5 minutes after the game ends). */
  first: string;
  last: string;
};

/** Sorare's multiplier for one card: 1 + its bonuses, plus the captain's when it is captain. */
export const multiplier = (o: Pick<Outlook, "bonus">, captain = false, captainBonus = 0) => 1 + o.bonus + (captain ? captainBonus : 0);

/** His expected score: if he plays × his chance to start (a card with no start % counts as starting) × Sorare's bonus. */
export function predicted(o: Outlook, captain = false, captainBonus = 0): number | null {
  if (o.score === null) return null;
  return o.score * (o.start ?? 1) * multiplier(o, captain, captainBonus);
}

const quantile = (sorted: number[], q: number) => {
  const at = (sorted.length - 1) * q;
  const lo = Math.floor(at);
  return sorted[lo]! + (sorted[Math.min(lo + 1, sorted.length - 1)]! - sorted[lo]!) * (at - lo);
};

/** Where he lands 6 games in 10 when he plays: the 20th to 80th percentile of his own played games, with Sorare's bonus. Null under 3 games. */
export function likelyRange(o: Outlook, captain = false, captainBonus = 0): [number, number] | null {
  if (o.past.length < 3) return null;
  const sorted = [...o.past].sort((a, b) => a - b);
  const m = multiplier(o, captain, captainBonus);
  return [quantile(sorted, 0.2) * m, quantile(sorted, 0.8) * m];
}

/** A fixed-seed generator, so the same cards always give the same chance. */
function random(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const RUNS = 2000;

/**
 * The lineup's total over RUNS simulated games, low to high. Each card starts with his chance (none: he starts), and then scores one of
 * his own past games, scaled so they average his score if he plays; with under 3 past games he scores that number. 0 when he does not start.
 */
export function simulate(picks: { outlook: Outlook; captain: boolean }[], captainBonus: number, runs = RUNS, seed = 7): number[] {
  const next = random(seed);
  const cards = picks.map(({ outlook: o, captain }) => {
    const mean = o.past.length ? o.past.reduce((a, b) => a + b, 0) / o.past.length : 0;
    const scale = o.score !== null && mean > 0 ? o.score / mean : 1;
    return { p: o.start ?? 1, m: multiplier(o, captain, captainBonus), past: o.past.length >= 3 ? o.past.map((s) => s * scale) : null, score: o.score ?? 0 };
  });
  const totals: number[] = [];
  for (let r = 0; r < runs; r++) {
    let total = 0;
    for (const c of cards) {
      if (next() >= c.p) continue;
      total += (c.past ? c.past[Math.floor(next() * c.past.length)]! : c.score) * c.m;
    }
    totals.push(total);
  }
  return totals.sort((a, b) => a - b);
}

/** The share of simulated games at or over the target. */
export function chanceOf(totals: number[], target: number): number {
  if (!totals.length) return 0;
  let lo = 0, hi = totals.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (totals[mid]! < target) lo = mid + 1;
    else hi = mid;
  }
  return (totals.length - lo) / totals.length;
}

const POOL = 6; // best cards per slot tried
const SHORTLIST = 60; // lineups simulated

/**
 * The lineup with the best chance to reach the target (points above it earn nothing): GK, DEF, MID, FWD and one more outfield card, one
 * card per player, from the outlooks given. Only cards Sofix can score are used. Null when a slot cannot be filled.
 */
export function bestLineup(outlooks: Outlook[], target: number, captainBonus: number): Lineup | null {
  // One outlook per player: his best card for his earliest game among those given.
  const byPlayer = new Map<string, Outlook>();
  for (const o of outlooks) {
    const value = predicted(o);
    if (value === null) continue;
    const held = byPlayer.get(o.card.player);
    if (!held || value > (predicted(held) ?? -1)) byPlayer.set(o.card.player, o);
  }
  const usable = [...byPlayer.values()].sort((a, b) => predicted(b)! - predicted(a)!);
  const pool = (slot: Slot) => usable.filter((o) => fits(o.card, slot)).slice(0, slot === "EXTRA" ? POOL + 4 : POOL);
  const pools = SLOTS.map(pool);
  if (pools.some((p) => !p.length)) return null;

  const combos: { picks: Outlook[]; expected: number }[] = [];
  const walk = (slot: number, chosen: Outlook[]) => {
    if (slot === SLOTS.length) {
      const values = chosen.map((o) => predicted(o)!);
      const best = Math.max(...chosen.map((o) => predicted(o, true, captainBonus)! - predicted(o)!));
      combos.push({ picks: [...chosen], expected: values.reduce((a, b) => a + b, 0) + best });
      return;
    }
    for (const o of pools[slot]!) if (!chosen.some((c) => c.card.player === o.card.player)) walk(slot + 1, [...chosen, o]);
  };
  walk(0, []);
  if (!combos.length) return null;
  combos.sort((a, b) => b.expected - a.expected);

  let best: { picks: LineupPick[]; totals: number[]; expected: number; chance: number } | null = null;
  for (const combo of combos.slice(0, SHORTLIST)) {
    // The captain worth trying: the two who add the most.
    const gains = combo.picks.map((o, i) => ({ i, gain: predicted(o, true, captainBonus)! - predicted(o)! })).sort((a, b) => b.gain - a.gain).slice(0, 2);
    for (const { i } of gains) {
      const picks = combo.picks.map((outlook, j) => ({ slot: SLOTS[j]!, outlook, captain: i === j }));
      const totals = simulate(picks, captainBonus);
      const chance = chanceOf(totals, target);
      const expected = picks.reduce((sum, p) => sum + predicted(p.outlook, p.captain, captainBonus)!, 0);
      if (!best || chance > best.chance + 1e-9 || (Math.abs(chance - best.chance) < 1e-9 && expected > best.expected)) best = { picks, totals, expected, chance };
    }
  }
  if (!best) return null;
  const kickoffs = best.picks.map((p) => p.outlook.game.kickoff).sort();
  return { picks: best.picks, expected: best.expected, totals: best.totals, first: kickoffs[0]!, last: kickoffs.at(-1)! };
}

/** A game ends about 115 minutes after kick-off, and Sorare counts the score 5 minutes later. */
export const SETTLES_AFTER_MS = 120 * 60_000;
export const settlesAt = (lineup: Pick<Lineup, "last">) => new Date(Date.parse(lineup.last) + SETTLES_AFTER_MS).toISOString();
