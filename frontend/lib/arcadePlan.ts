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
  scoreSource: "sofix" | "sorare" | "form" | null;
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
const PLAN_RUNS = 400; // the climb's look-ahead compares days; 400 games are enough for that and keep the page responsive
const PLAN_SHORTLIST = 15; // and the 15 likeliest lineups by expected points, not 60

/**
 * How much two starters of the same side in one game score together: the correlation of each one's score against his own usual,
 * measured on 9,341 starts in 449 LaLiga 2025/26 games (Sorare's own scores): 0.09 (95% 0.07 to 0.11). Opponents: −0.08, left out.
 */
export const TEAMMATES = 0.09;

/** The standard normal's cumulative chance (Abramowitz and Stegun 7.1.26, error under 1.5e-7). */
function phi(x: number): number {
  const t = 1 / (1 + 0.3275911 * Math.abs(x) / Math.SQRT2);
  const y = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-(x * x) / 2);
  return x >= 0 ? (1 + y) / 2 : (1 - y) / 2;
}

/**
 * The lineup's total over RUNS simulated games, low to high. Each card starts with his chance (none: he starts), and then scores one of
 * his own past games, scaled so they average his score if he plays; with under 3 past games he scores that number. 0 when he does not start.
 * Teammates in one game share how their side's day goes (TEAMMATES): a good day lifts each of them up his own range together.
 */
export function simulate(picks: { outlook: Outlook; captain: boolean }[], captainBonus: number, runs = RUNS, seed = 7, link = TEAMMATES): number[] {
  const next = random(seed);
  const normal = () => Math.sqrt(-2 * Math.log(1 - next())) * Math.cos(2 * Math.PI * next());
  const sides = new Map<string, number>();
  const cards = picks.map(({ outlook: o, captain }) => {
    const mean = o.past.length ? o.past.reduce((a, b) => a + b, 0) / o.past.length : 0;
    const scale = o.score !== null && mean > 0 ? o.score / mean : 1;
    const side = `${o.game.id}|${o.card.teamSlug ?? o.card.player}`;
    if (!sides.has(side)) sides.set(side, sides.size);
    return {
      p: o.start ?? 1, m: multiplier(o, captain, captainBonus), side: sides.get(side)!,
      past: o.past.length >= 3 ? o.past.map((s) => s * scale).sort((a, b) => a - b) : null, score: o.score ?? 0,
    };
  });
  const day = new Array<number>(sides.size).fill(0);
  const shared = Math.sqrt(link);
  const own = Math.sqrt(1 - link);
  const totals: number[] = [];
  for (let r = 0; r < runs; r++) {
    for (let i = 0; i < day.length; i++) day[i] = normal();
    let total = 0;
    for (const c of cards) {
      if (next() >= c.p) continue;
      if (!c.past) { total += c.score * c.m; continue; }
      const u = phi(shared * day[c.side]! + own * normal());
      total += c.past[Math.min(c.past.length - 1, Math.floor(u * c.past.length))]! * c.m;
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
export function bestLineup(outlooks: Outlook[], target: number, captainBonus: number, runs = RUNS, shortlist = SHORTLIST): Lineup | null {
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
  for (const combo of combos.slice(0, shortlist)) {
    // The captain worth trying: the two who add the most.
    const gains = combo.picks.map((o, i) => ({ i, gain: predicted(o, true, captainBonus)! - predicted(o)! })).sort((a, b) => b.gain - a.gain).slice(0, 2);
    for (const { i } of gains) {
      const picks = combo.picks.map((outlook, j) => ({ slot: SLOTS[j]!, outlook, captain: i === j }));
      const totals = simulate(picks, captainBonus, runs);
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

/** The Madrid date of a kick-off ("2026-10-24"): a day runs until its last game, and none of the set's leagues plays past midnight. */
export const madridDate = (iso: string) => new Date(iso).toLocaleDateString("en-CA", { timeZone: "Europe/Madrid" });

export type StepInfo = { number: number; target: number; lives: number; big: boolean };
export type Planned = {
  lineup: Lineup;
  /** The step it is aimed at, and its chance there. */
  step: number;
  chance: number;
  settles: string;
  /** An earlier lineup that may clear the step after this one has locked: if it does, this one is lost. */
  lostIf: number | null;
  /** An earlier lineup whose miss this one retries (same step) and whose clear moves it on. */
  after: number | null;
};

/** A step's big reward: 30 gems or more, or money (owner: hold the last life of those unless today is the best chance left). */
export const bigReward = (rewards: string[]) => rewards.some((r) => r.startsWith("€") || r.startsWith("$") || (/^([\d,]+) gems$/.test(r) && Number(r.replace(/\D/g, "")) >= 30));

/**
 * "Pick a day": up to the lives left, lineups from the day's games, no card in two, in the order they settle. Each is aimed at the step it
 * will be on: the next step after each earlier lineup that is more likely than not to clear and settles before this one's first game
 * (a waiting lineup moves on only while none of its cards has played); one that locks first is marked lost if that earlier one clears.
 */
export function planDay(outlooks: Outlook[], steps: StepInfo[], current: number, captainBonus: number, busy: Set<string> = new Set()): Planned[] {
  const stepOf = (n: number) => steps.find((s) => s.number === n) ?? steps.at(-1)!;
  const lives = Math.min(4, stepOf(current).lives);
  const used = new Set(busy);
  const free = () => outlooks.filter((o) => !used.has(o.card.slug));
  const built: Lineup[] = [];
  for (let i = 0; i < lives; i++) {
    const lineup = bestLineup(free(), stepOf(current).target, captainBonus);
    if (!lineup) break;
    built.push(lineup);
    lineup.picks.forEach((p) => used.add(p.outlook.card.slug));
  }
  built.sort((a, b) => a.last.localeCompare(b.last) || a.first.localeCompare(b.first));

  const plan: Planned[] = [];
  for (const [k, original] of built.entries()) {
    let step = current;
    let lostIf: number | null = null;
    for (const [j, earlier] of plan.entries()) {
      if (earlier.step !== step) continue;
      if (Date.parse(earlier.settles) > Date.parse(original.first)) lostIf ??= j; // locked before it settles: lost if it clears
      else if (earlier.chance >= 0.5) step = Math.min(step + 1, steps.at(-1)!.number);
    }
    // The last earlier lineup on the same step: if it misses, this one is the retry.
    const sameStep = plan.flatMap((p, j) => (p.step === step ? [j] : []));
    const after = sameStep.length ? sameStep.at(-1)! : null;
    // Re-aim it at its own step from the same cards, unless an earlier lineup locks it out.
    let lineup = original;
    if (step !== current) {
      const others = new Set([...busy, ...built.filter((_, i) => i !== k).flatMap((l) => l.picks.map((p) => p.outlook.card.slug))]);
      lineup = bestLineup(outlooks.filter((o) => !others.has(o.card.slug) && Date.parse(o.game.kickoff) >= Date.parse(original.first)), stepOf(step).target, captainBonus) ?? original;
    }
    plan.push({ lineup, step, chance: chanceOf(lineup.totals, stepOf(step).target), settles: settlesAt(lineup), lostIf, after });
  }
  return plan;
}

/** Where the climb starts: the step and its lives, from when (a waiting lineup must settle first), and cards held until a time. */
export type ClimbStart = { step: number; lives: number; notBefore: number | null; held: { card: string; until: number }[]; /** The highest step already cleared (default: the one below `step`). */ best?: number };
/**
 * One leg of the climb: from `day` to `to` (a lineup may take games from up to SPAN days), the step and lives it starts with on the likely
 * path, how many lineups to play, the chance one clears, and those lineups (each step on the path has its own, not only the current one).
 */
export type ClimbDay = {
  day: string; to: string; step: number; lives: number; /** The highest step cleared before it. */ best: number; play: number; clear: number;
  /** Lineups the leg's free cards can make. */ can: number;
  /** The leg's cards free to play (held ones left out): planDay builds the lineups shown. */ list: Outlook[];
  /** The lineups played, strongest first, aimed at this step (fewer simulated games than a shown lineup). */ lineups: Lineup[];
};
export type Climb = {
  days: ClimbDay[];
  /** Chance to clear each step by the set's end, playing as planned: step number → 0 to 1. */ odds: Record<number, number>;
  /** The likely path after a played leg if one of its lineups clears (true) or all miss (false): the outcome `days` does not show. */
  after: (leg: ClimbDay, cleared: boolean) => ClimbDay[];
};

/** A lineup may take games from up to 3 days in a row (Sorare's set board takes any of its games): a thin day joins the next. */
export const SPAN = 3;

/**
 * The climb to the set's end (owner: climb as high as possible, as fast as possible, before the set ends). A leg runs from one day to up to
 * SPAN days later and offers up to 4 lineups at a step from those days' games, no card twice; the next leg starts the day after it ends,
 * once its lineups have settled. For every day, step and lives, Sofix chooses the leg and how many lineups to play by looking ahead to the
 * set's end: a clear moves up a step with fresh lives; a miss costs a life; the last life lost sends the climb back to step 1 (Sorare's
 * rule), but a reward already won stays won, so what counts is the highest step cleared. Cards in a lineup still running are held until it
 * settles.
 */
export function climb(days: [string, Outlook[]][], steps: StepInfo[], start: ClimbStart, captainBonus: number): Climb {
  const last = steps.at(-1)?.number ?? 1;
  const fresh = (n: number) => Math.min(4, steps.find((s) => s.number === n)?.lives ?? 4) || 4;
  const pools = days.map(([day, all]) => ({ day, list: start.notBefore === null ? all : all.filter((o) => Date.parse(o.game.kickoff) >= start.notBefore!) }));
  // The cards free for a leg from day i to day j: held ones out while their lineup runs.
  const legList = (i: number, j: number) => {
    const list = pools.slice(i, j + 1).flatMap((p) => p.list);
    const opens = list.length ? Math.min(...list.map((o) => Date.parse(o.game.kickoff))) : 0;
    const busy = new Set(start.held.filter((h) => h.until > opens).map((h) => h.card));
    return list.filter((o) => !busy.has(o.card.slug));
  };

  // A leg's 4 best lineups, no card twice, built once (aimed at the start's step) and read at step n's target: what one more life buys,
  // strongest first. ponytail: aimed once per leg, not per step (6× the time, 3.6 s on his board); planDay re-aims the leg you open.
  const target = (n: number) => steps.find((s) => s.number === n)?.target ?? 0;
  const built = new Map<string, Lineup[]>();
  const offer = (i: number, j: number, n: number): Lineup[] => {
    const key = `${i}:${j}`;
    if (!built.has(key)) {
      const list = legList(i, j);
      const used = new Set<string>();
      const out: Lineup[] = [];
      for (let k = 0; k < 4 && list.length; k++) {
        const lineup = bestLineup(list.filter((o) => !used.has(o.card.slug)), target(start.step), captainBonus, PLAN_RUNS, PLAN_SHORTLIST);
        if (!lineup) break;
        out.push(lineup);
        lineup.picks.forEach((p) => used.add(p.outlook.card.slug));
      }
      built.set(key, out);
    }
    return [...built.get(key)!].sort((a, b) => chanceOf(b.totals, target(n)) - chanceOf(a.totals, target(n)));
  };

  // Best expected highest step cleared from day i, on step n with `lives`, `best` already cleared; the leg's last day and how many to play.
  type Choice = { value: number; to: number; play: number; clear: number };
  const memo = new Map<string, Choice>();
  const value = (i: number, n: number, lives: number, best: number): Choice => {
    if (i >= pools.length || n > last) return { value: best, to: i, play: 0, clear: 0 };
    const key = `${i}:${n}:${lives}:${best}`;
    const known = memo.get(key);
    if (known) return known;
    let choice: Choice = { value: value(i + 1, n, lives, best).value, to: i, play: 0, clear: 0 };
    for (let j = i; j < Math.min(pools.length, i + SPAN); j++) {
      if (!pools[j]!.list.length) continue;
      const chances = offer(i, j, n).map((l) => chanceOf(l.totals, target(n)));
      let miss = 1;
      for (let k = 1; k <= Math.min(lives, chances.length); k++) {
        miss *= 1 - chances[k - 1]!;
        const clear = 1 - miss;
        const up = value(j + 1, n + 1, fresh(n + 1), Math.max(best, n)).value;
        const down = lives - k > 0 ? value(j + 1, n, lives - k, best).value : value(j + 1, 1, 4, best).value;
        const v = clear * up + (1 - clear) * down;
        if (v > choice.value + 1e-9) choice = { value: v, to: j, play: k, clear };
      }
    }
    memo.set(key, choice);
    return choice;
  };

  // Chance to clear each step: every path of the plan, weighted. States wait at the day their next leg can start.
  const odds: Record<number, number> = {};
  type State = { n: number; lives: number; best: number; p: number };
  const at = Array.from({ length: pools.length + 1 }, () => new Map<string, State>());
  const add = (i: number, n: number, lives: number, best: number, p: number) => {
    const key = `${n}:${lives}:${best}`;
    at[i]!.set(key, { n, lives, best, p: (at[i]!.get(key)?.p ?? 0) + p });
  };
  add(0, start.step, start.lives, start.best ?? start.step - 1, 1);
  for (let i = 0; i < pools.length; i++) {
    for (const s of at[i]!.values()) {
      const { play, clear, to } = s.n > last ? { play: 0, clear: 0, to: i } : value(i, s.n, s.lives, s.best);
      if (!play) { add(i + 1, s.n, s.lives, s.best, s.p); continue; }
      add(to + 1, s.n + 1, fresh(s.n + 1), Math.max(s.best, s.n), s.p * clear);
      if (s.lives - play > 0) add(to + 1, s.n, s.lives - play, s.best, s.p * (1 - clear));
      else add(to + 1, 1, 4, s.best, s.p * (1 - clear));
    }
  }
  for (const s of at[pools.length]!.values()) for (let n = 1; n <= s.best; n++) odds[n] = (odds[n] ?? 0) + s.p;

  // The likely path from day i, leg by leg: a leg whose lineups more likely than not clear moves it up.
  const walk = (from: number, n: number, lives: number, best: number): ClimbDay[] => {
    const out: ClimbDay[] = [];
    for (let i = from; i < pools.length && n <= last;) {
      if (!pools[i]!.list.length) { i += 1; continue; }
      const { play, clear, to } = value(i, n, lives, best);
      const lineups = play ? offer(i, to, n).slice(0, play) : [];
      out.push({ day: pools[i]!.day, to: pools[to]!.day, step: n, lives, best, play, clear, can: offer(i, to, n).length, list: legList(i, to), lineups });
      i = to + 1;
      if (!play) continue;
      ({ n, lives, best } = outcome({ step: n, lives, best, play }, clear >= 0.5));
    }
    return out;
  };
  // A played leg's result: a clear moves up a step with fresh lives; a miss costs its lives, and the last one lost restarts at step 1.
  const outcome = (leg: Pick<ClimbDay, "step" | "lives" | "best" | "play">, cleared: boolean) =>
    cleared ? { n: leg.step + 1, lives: fresh(leg.step + 1), best: Math.max(leg.best, leg.step) }
      : leg.lives - leg.play > 0 ? { n: leg.step, lives: leg.lives - leg.play, best: leg.best } : { n: 1, lives: 4, best: leg.best };
  const after = (leg: ClimbDay, cleared: boolean) => {
    const next = outcome(leg, cleared);
    return walk(pools.findIndex((p) => p.day === leg.to) + 1, next.n, next.lives, next.best);
  };
  return { days: walk(0, start.step, start.lives, start.best ?? start.step - 1), odds, after };
}

export type Advice = { play: boolean; why: string; better: { day: string; chance: number } | null };

/**
 * When to spend a life (plans/set.md, Rules decided). Step 1: always play. From step 2: play unless a later day before the set ends gives a
 * better chance at that step; play anyway when the days left are fewer than the steps still to climb. A big reward's last life: hold
 * unless today is the best chance left. Later days whose lineup has no start % for most cards are not compared: Sorare has not said yet.
 */
export function lifeAdvice(today: { chance: number; step: StepInfo; days: number; stepsLeft: number }, later: { day: string; lineup: Lineup | null }[]): Advice {
  const compared = later.flatMap(({ day, lineup }) => {
    if (!lineup) return [];
    const known = lineup.picks.filter((p) => p.outlook.start !== null).length;
    return known * 2 >= lineup.picks.length ? [{ day, chance: chanceOf(lineup.totals, today.step.target) }] : [];
  });
  const better = compared.filter((d) => d.chance > today.chance).sort((a, b) => b.chance - a.chance)[0] ?? null;
  if (today.step.number === 1) return { play: true, why: "Step 1 has nothing to lose: play the best lineup.", better: null };
  if (today.days < today.stepsLeft) return { play: true, why: "Fewer days left than steps to climb: play.", better };
  const unknown = later.length - compared.length;
  const note = unknown ? ` (${unknown} later day${unknown > 1 ? "s have" : " has"} no start % yet, so not compared)` : "";
  if (!better) return { play: true, why: `No later day gives a better chance at this step${note}.`, better: null };
  if (today.step.lives <= 1 && today.step.big) return { play: false, why: `Last life on a big reward: hold for a better day${note}.`, better };
  return { play: false, why: `A later day gives a better chance at this step: hold the life${note}.`, better };
}

/** Each slot's draw odds as Sorare publishes them: player slug → chance (0 to 1). */
export type PackOdds = Record<string, Record<string, number>[]>;

/**
 * The players you would get that you do not have yet, on average, from one pack: for each player, the chance at least one slot draws
 * him (1 − the product of each slot missing him), summed over the players you lack. Duplicates of yours add nothing to a lineup.
 */
export function newPlayers(slots: Record<string, number>[], owned: Set<string>): number {
  const miss = new Map<string, number>();
  for (const slot of slots) for (const [player, p] of Object.entries(slot)) if (!owned.has(player)) miss.set(player, (miss.get(player) ?? 1) * (1 - p));
  let total = 0;
  for (const m of miss.values()) total += 1 - m;
  return total;
}

export type PackPick = { slug: string; title: string; league: string | null; price: number; currency: string; cards: number; fresh: number; affordable: boolean };

/**
 * Every pack with its expected new players, best first; packs whose odds were not read are left out. One best pick across essence and
 * gems: the pack you can afford now with the most new players a pack (each currency buys only packs, so a pack is what it is worth).
 */
export function rankPacks(packs: Omit<PackPick, "fresh" | "affordable">[], odds: PackOdds, owned: Set<string>, wallet: { gems: number | null; essence: number | null }): PackPick[] {
  const can = (p: { currency: string; price: number }) => (p.currency === "COMMON_GEM" ? (wallet.gems ?? 0) : p.currency === "COMMON_ESSENCE" ? (wallet.essence ?? 0) : 0) >= p.price;
  return packs.filter((p) => odds[p.slug]?.length)
    .map((p) => ({ ...p, fresh: newPlayers(odds[p.slug]!, owned), affordable: can(p) }))
    .sort((a, b) => Number(b.affordable) - Number(a.affordable) || b.fresh - a.fresh);
}

/** A game lasts about 115 minutes: after that its card has played (Sorare counts the score 5 minutes later). */
const GAME_MS = 115 * 60_000;
export type LiveCard = { slug: string | null; name: string; state: "played" | "live" | "to play"; points: number; best: number | null; outlook: Outlook | null; bonus: number };
export type LiveVerdict = { cards: LiveCard[]; now: number; ceiling: number; dead: boolean; chance: number };

/**
 * An entered lineup while it plays. Points so far = each played or live card's score × Sorare's multiplier for it. Its ceiling adds, for
 * every card still able to score, his best score of his last games he played (his own record, never a guess); with no record the
 * ceiling stays open. Dead when even the ceiling misses the target. Chance left: the cards still to play simulated as for a plan
 * (start % and past games), the live ones counted as they stand.
 */
export function liveLineup(cards: { slug: string | null; name: string | null; score: number | null; kickoff: string | null; bonus: number | null }[], target: number, outlookOf: (slug: string | null) => Outlook | null, now: number): LiveVerdict {
  const live: LiveCard[] = cards.map((c) => {
    const start = c.kickoff ? Date.parse(c.kickoff) : NaN;
    const state = !Number.isFinite(start) || now < start ? "to play" : now < start + GAME_MS ? "live" : "played";
    const bonus = c.bonus ?? 1;
    const outlook = outlookOf(c.slug);
    const past = outlook?.past ?? [];
    return { slug: c.slug, name: c.name ?? "?", state, points: state === "to play" ? 0 : (c.score ?? 0) * bonus, best: past.length ? Math.max(...past) * bonus : null, outlook, bonus };
  });
  const sum = live.reduce((total, c) => total + c.points, 0);
  const open = live.some((c) => c.state !== "played" && c.best === null);
  const ceiling = open ? Infinity : sum + live.reduce((total, c) => total + (c.state === "played" ? 0 : Math.max(0, c.best! - c.points)), 0);
  const dead = ceiling < target;
  const toPlay = live.filter((c) => c.state === "to play" && c.outlook);
  const totals = toPlay.length ? simulate(toPlay.map((c) => ({ outlook: { ...c.outlook!, bonus: c.bonus - 1 }, captain: false })), 0) : [0];
  return { cards: live, now: sum, ceiling, dead, chance: dead ? 0 : chanceOf(totals, target - sum) };
}

/** Cut losses = cancel (it costs the life a miss would): only when its cards still to play add more to another planned lineup than it has left. */
export const cutLosses = (verdict: Pick<LiveVerdict, "chance">, gain: number, cancellable: boolean) => cancellable && gain > verdict.chance;

/** The decisive actions a Decisive Picker counts when Sorare names none (as Sorare's detailed score names them). */
export const DECISIVE_STATS = ["goals", "goal_assist", "assist_penalty_won", "clearance_off_line", "last_man_tackle", "penalty_save"];

/** His share of games he played (minutes > 0) with one of the counted actions; null under 3 such games (no made-up rate). */
export function decisiveRate(games: { mins: number; stats: string[] }[], counted: string[]): number | null {
  const played = games.filter((g) => g.mins > 0);
  if (played.length < 3) return null;
  const want = new Set(counted.length ? counted : DECISIVE_STATS);
  return played.filter((g) => g.stats.some((s) => want.has(s))).length / played.length;
}

export type DecisivePick = { outlook: Outlook; rate: number | null; chance: number | null };
/** A Decisive Picker's candidates, best first: his chance = his start % (none: counted as starting) × his own decisive rate. */
export function rankDecisive(candidates: { outlook: Outlook; rate: number | null }[]): DecisivePick[] {
  return candidates
    .map((c) => ({ ...c, chance: c.rate === null ? null : (c.outlook.start ?? 1) * c.rate }))
    .sort((a, b) => (b.chance ?? -1) - (a.chance ?? -1) || (predicted(b.outlook) ?? 0) - (predicted(a.outlook) ?? 0));
}

/** A streak mission's points target, from Sorare's own words ("Score 400+ in …"); null when it names none. */
export const streakTarget = (description: string | null) => {
  const found = /(\d[\d,]*)\s*\+/.exec(description ?? "");
  return found ? Number(found[1]!.replace(/,/g, "")) : null;
};
