import { fits, likely, madridDate, multiplier, phi, predicted, SETTLES_AFTER_MS, SLOTS, type Outlook, type Slot, type StepInfo } from "./arcadePlan";

/**
 * The climb, as Sorare's board really runs (plans/arcade-rework.md, read 29 Oct 2026): a lineup is entered on the step you are on,
 * settles 5 minutes after its last game, and a clear opens the next step at once. So the climb moves window by window, not day by
 * day: a lineup on the 14:00 games settles about 16:00 and the next step can take the 18:30 games the same day. Several lineups on one
 * step at once are insurance only: when one clears, Sorare cancels the others (21 Oct: 313.93 cleared step 2, and a 371.76 that would
 * have cleared step 3 was cancelled with two more). A miss costs a life; the last life lost sends you back to step 1.
 * Every clear pays its step's reward again, and clearing the last step (€1,000) starts the climb again from step 1 (owner, 29 Oct
 * 2026: "each time you get to the last step you get 1000eur").
 *
 * Plain arithmetic, fast enough to run on every change: each card's score is a start chance times a spread around his score if he
 * plays, and a lineup's total is treated as normal (sum of the cards' means and variances). The lineups shown are then built exactly
 * (`bestLineup`, simulated).
 */

/** Games kicking off within 75 minutes of a window's first game share it (Sorare's slots: 13:00/14:00, 16:15, 18:30/18:45, 21:00). */
export const WINDOW_MS = 75 * 60_000;
/**
 * A score's spread if he plays, as a share of his score, for a player with under 3 played games: the median of 884 HyperGlitch
 * commons with 5 or more played games was 0.327 (owner's kept board, 22 Oct 2026; quartiles 0.264 and 0.385). Before, such a card
 * scored the same number in every simulated game, which made a thin record look safe.
 */
export const THIN_SPREAD = 0.33;
const LIVES = 4;
/** The longest a planned lineup may wait for its last game: a lineup over more days settles later and holds the climb. */
const LONGEST_LEG_MS = 26 * 3_600_000;
const COMBINE_MS = 3 * 3_600_000;
/** Two plans whose chance at every prize is within this (half a point) are a tie, and a tie goes to speed: play now. */
const PLAY_TIE = 0.005;
/** A lineup over a wider span of kick-offs must beat the window's own games by this much (2 points) at some prize. */
const LEG_TIE = 0.02;

export type Window = { at: number; list: Outlook[] };

/** The future games' cards, grouped into kick-off windows, earliest first. */
export function windowsOf(outlooks: Outlook[], from: number): Window[] {
  const out: Window[] = [];
  for (const o of [...outlooks].filter((x) => Date.parse(x.game.kickoff) >= from).sort((a, b) => Date.parse(a.game.kickoff) - Date.parse(b.game.kickoff))) {
    const at = Date.parse(o.game.kickoff);
    const last = out.at(-1);
    if (last && at - last.at <= WINDOW_MS) last.list.push(o);
    else out.push({ at, list: [o] });
  }
  return out;
}

/** His score's spread if he plays: his own played games, scaled to his score, or THIN_SPREAD of it with under 3 games. */
export function spread(o: Pick<Outlook, "score" | "past">): number {
  if (o.score === null) return 0;
  if (o.past.length < 3) return THIN_SPREAD * o.score;
  const mean = o.past.reduce((a, b) => a + b, 0) / o.past.length;
  const sd = Math.sqrt(o.past.reduce((a, b) => a + (b - mean) ** 2, 0) / (o.past.length - 1));
  return mean > 0 ? (sd * o.score) / mean : THIN_SPREAD * o.score;
}

/** A card's expected points and their variance: he starts with his chance (none known: he starts), then scores around his number. */
export function moments(o: Outlook, captain: boolean, captainBonus: number): [number, number] {
  const mu = o.score ?? 0;
  const p = o.start ?? 1;
  const m = multiplier(o, captain, captainBonus);
  const sd = spread(o);
  return [p * mu * m, m * m * (p * (sd * sd + mu * mu) - (p * mu) ** 2)];
}

export type Quick = { picks: { slot: Slot; outlook: Outlook; captain: boolean }[]; mean: number; sd: number; first: number; last: number };

/**
 * The strongest lineup by expected points: GK, DEF, MID, FWD and one more outfield card, each player once. The captain is the card
 * that adds most among those with a known start chance (a card with none is never captain while another has one).
 */
export function quickLineup(list: Outlook[], captainBonus: number): Quick | null {
  const byPlayer = new Map<string, Outlook>();
  for (const o of list) {
    const v = predicted(o);
    if (v === null) continue;
    const held = byPlayer.get(o.card.player);
    if (!held || v > predicted(held)!) byPlayer.set(o.card.player, o);
  }
  const sorted = [...byPlayer.values()].sort((a, b) => predicted(b)! - predicted(a)!);
  const used = new Set<string>();
  const chosen: { slot: Slot; outlook: Outlook }[] = [];
  for (const slot of SLOTS) {
    const o = sorted.find((x) => !used.has(x.card.player) && fits(x.card, slot) && likely(x)) ?? sorted.find((x) => !used.has(x.card.player) && fits(x.card, slot));
    if (!o) return null;
    used.add(o.card.player);
    chosen.push({ slot, outlook: o });
  }
  const gain = (o: Outlook) => predicted(o, true, captainBonus)! - predicted(o)!;
  const pool = chosen.some((c) => c.outlook.start !== null) ? chosen.filter((c) => c.outlook.start !== null) : chosen;
  const captain = pool.reduce((a, b) => (gain(b.outlook) > gain(a.outlook) ? b : a)).outlook;
  const picks = chosen.map((c) => ({ ...c, captain: c.outlook === captain }));
  let mean = 0, variance = 0;
  for (const p of picks) {
    const [m, v] = moments(p.outlook, p.captain, captainBonus);
    mean += m;
    variance += v;
  }
  const kickoffs = picks.map((p) => Date.parse(p.outlook.game.kickoff));
  return { picks, mean, sd: Math.sqrt(variance), first: Math.min(...kickoffs), last: Math.max(...kickoffs) };
}

/** The chance a lineup's total reaches the target. */
export const quickChance = (q: Pick<Quick, "mean" | "sd">, target: number) => (q.sd <= 0 ? (q.mean >= target ? 1 : 0) : 1 - phi((target - q.mean) / q.sd));

export type ClimbStart = { step: number; lives: number; notBefore: number | null; held: { card: string; until: number }[]; /** Highest step already cleared. */ best?: number };

/** One played move: from window `from` to `to`, `play` lineups on `step`, the chance one clears, and when they have all settled. */
export type Move = { from: number; to: number; at: number; step: number; lives: number; best: number; play: number; clear: number; settles: number; lineups: Quick[]; list: Outlook[] };

/** The chance to clear each step at least once by the last known game (index = step number; index 0 unused). */
export type Reach = number[];

export type Verdict = {
  kind: "play" | "wait" | "spend" | "none";
  /** Each step's chance to be cleared by the last known game: playing the best move now, and holding until the next window. */
  now: Reach;
  wait: Reach;
  /** Best single lineup's chance now, and in the window the plan would wait for. */
  chanceNow: number | null;
  waitFor: { at: number; chance: number } | null;
  /** Windows skipped before the waited-for one. */
  skipped: number;
};

export type Climb = {
  windows: Window[];
  /** The likely path: each played move, a clear when it is more likely than not. */
  path: Move[];
  /** Chance to clear each step at least once by the last known game, playing the plan. */
  odds: Record<number, number>;
  verdict: Verdict;
  /** The likely path after a played move's other outcome. */
  after: (move: Move, cleared: boolean) => Move[];
};

/**
 * Which of two plans is better, by the prizes each can actually win (owner, 29 Oct 2026: "do not use probability-weighted averages
 * instead of attainable prizes"): the higher chance at the biggest prize, the top step's, decides; within `tie` of each other the next
 * prize down decides, and so on. Returns > 0 when `a` is better, < 0 when `b` is, 0 when every prize is within `tie`.
 */
export function comparePrizes(a: Reach, b: Reach, tie: number): number {
  for (let k = Math.max(a.length, b.length) - 1; k >= 1; k--) {
    const d = (a[k] ?? 0) - (b[k] ?? 0);
    if (Math.abs(d) > tie) return d;
  }
  return 0;
}

/**
 * The plan from now to the last game Sorare lists. At every window, on every step, with every number of lives, it chooses between
 * playing 1 to `lives` lineups and holding, for the best chances at the prizes (`comparePrizes`). Lineups come from the window's own
 * games first: a wider span (the next 3 hours, the rest of the day, up to 26 hours) is used only when it is clearly better, because
 * close kick-offs climb faster and every card's start % is known before the lineup is entered (owner, 29 Oct). A hold costs the window
 * it skips, so the plan waits only when a coming window is clearly better; a near tie is played. Every clear pays again, and clearing
 * the top starts the climb again from step 1.
 */
export function climbWindows(outlooks: Outlook[], steps: StepInfo[], start: ClimbStart, captainBonus: number, now: number): Climb {
  const top = steps.at(-1)?.number ?? 1;
  const target = (n: number) => steps.find((s) => s.number === n)?.target ?? Infinity;
  const fresh = (n: number) => Math.min(LIVES, steps.find((s) => s.number === n)?.lives ?? LIVES) || LIVES;
  const up = (n: number) => (n >= top ? 1 : n + 1);
  const upLives = (n: number) => (n >= top ? LIVES : fresh(n + 1));
  const windows = windowsOf(outlooks, Math.max(now, start.notBefore ?? 0));
  const W = windows.length;
  const firstAfter = (time: number, from: number) => { let i = from; while (i < W && windows[i]!.at < time) i++; return i; };
  const done = (best: number): Reach => Array.from({ length: top + 1 }, (_, k) => (k >= 1 && k <= best ? 1 : 0));
  const mix = (p: number, a: Reach, b: Reach): Reach => a.map((x, k) => p * x + (1 - p) * b[k]!);

  // The legs from each window: its own games, then wider spans; each up to 4 lineups, no card twice, cards in a running lineup held.
  const legs = new Map<number, { to: number; list: Outlook[]; lineups: Quick[] }[]>();
  const legsFrom = (i: number) => {
    const known = legs.get(i);
    if (known) return known;
    const at = windows[i]!.at;
    const day = madridDate(new Date(at).toISOString());
    let within3h = i, sameDay = i, within26h = i;
    for (let j = i + 1; j < W && windows[j]!.at - at <= LONGEST_LEG_MS; j++) {
      within26h = j;
      if (windows[j]!.at - at <= COMBINE_MS) within3h = j;
      if (madridDate(new Date(windows[j]!.at).toISOString()) === day) sameDay = j;
    }
    const chosen = [...new Set([i, within3h, sameDay, within26h])].sort((a, b) => a - b);
    const busy = new Set(start.held.filter((h) => h.until > at).map((h) => h.card));
    const out = chosen.map((to) => {
      const list = windows.slice(i, to + 1).flatMap((w) => w.list).filter((o) => !busy.has(o.card.slug));
      const used = new Set<string>();
      const lineups: Quick[] = [];
      for (let k = 0; k < LIVES; k++) {
        const q = quickLineup(list.filter((o) => !used.has(o.card.player)), captainBonus);
        if (!q) break;
        lineups.push(q);
        q.picks.forEach((p) => used.add(p.outlook.card.player));
      }
      return { to, list, lineups };
    }).filter((l) => l.lineups.length);
    legs.set(i, out);
    return out;
  };

  type Choice = { reach: Reach; to: number; play: number; clear: number; next: number; settles: number; lineups: Quick[]; list: Outlook[] };
  const memo = new Map<string, Choice>();
  const value = (i: number, n: number, lives: number, best: number): Choice => {
    const hold: Choice = { reach: done(best), to: i, play: 0, clear: 0, next: i + 1, settles: 0, lineups: [], list: [] };
    if (i >= W) return hold;
    // The top cleared: that prize is won, and the climb starts again from step 1 for the next one (every clear pays again).
    if (best >= top) return { ...value(i, n, lives, 0), reach: done(top) };
    const key = `${i}:${n}:${lives}:${best}`;
    const known = memo.get(key);
    if (known) return known;
    let choice: Choice = { ...hold, reach: value(i + 1, n, lives, best).reach };
    for (const leg of legsFrom(i)) {
      const ranked = [...leg.lineups].sort((a, b) => quickChance(b, target(n)) - quickChance(a, target(n)));
      let miss = 1;
      let settles = 0;
      for (let k = 1; k <= Math.min(lives, ranked.length); k++) {
        miss *= 1 - quickChance(ranked[k - 1]!, target(n));
        settles = Math.max(settles, ranked[k - 1]!.last + SETTLES_AFTER_MS);
        const clear = 1 - miss;
        const next = firstAfter(settles, i + 1);
        const won = value(next, up(n), upLives(n), Math.max(best, n)).reach;
        const lost = lives - k > 0 ? value(next, n, lives - k, best).reach : value(next, 1, LIVES, best).reach;
        const reach = mix(clear, won, lost);
        // Speed first: a move as good as holding (within PLAY_TIE) is played. A wider leg or more lives must be clearly better.
        const better = choice.play ? comparePrizes(reach, choice.reach, leg.to > choice.to ? LEG_TIE : PLAY_TIE) > 0 : comparePrizes(reach, choice.reach, PLAY_TIE) >= 0;
        if (better) choice = { reach, to: leg.to, play: k, clear, next, settles, lineups: ranked.slice(0, k), list: leg.list };
      }
    }
    memo.set(key, choice);
    return choice;
  };

  const startBest = start.best ?? start.step - 1;
  const outcome = (m: Pick<Move, "step" | "lives" | "best" | "play">, cleared: boolean) =>
    cleared ? { n: up(m.step), lives: upLives(m.step), best: Math.max(m.best, m.step) }
      : m.lives - m.play > 0 ? { n: m.step, lives: m.lives - m.play, best: m.best } : { n: 1, lives: LIVES, best: m.best };
  const walk = (from: number, n: number, lives: number, best: number): Move[] => {
    const out: Move[] = [];
    for (let i = from; i < W && out.length < 24;) {
      const c = value(i, n, lives, best);
      if (!c.play) { i += 1; continue; }
      out.push({ from: i, to: c.to, at: windows[i]!.at, step: n, lives, best, play: c.play, clear: c.clear, settles: c.settles, lineups: c.lineups, list: c.list });
      ({ n, lives, best } = outcome({ step: n, lives, best, play: c.play }, c.clear >= 0.5));
      i = c.next;
    }
    return out;
  };

  // Now against holding one window: the prizes each can reach, and what the hold waits for.
  const first = W ? value(0, start.step, start.lives, startBest) : null;
  const held = W ? value(1, start.step, start.lives, startBest) : null;
  const odds: Record<number, number> = Object.fromEntries((first?.reach ?? done(startBest)).flatMap((p, k) => (k ? [[k, p]] : [])));
  // "Now" is the next window's own games: a lineup reaching into later windows is not playing now.
  const own = W ? legsFrom(0).find((l) => l.to === 0) ?? null : null;
  const chanceNow = own ? Math.max(0, ...own.lineups.map((q) => quickChance(q, target(start.step)))) : null;
  let waitFor: Verdict["waitFor"] = null;
  let skipped = 0;
  if (first && !first.play) {
    let i = 1;
    while (i < W && !value(i, start.step, start.lives, startBest).play) i++;
    if (i < W) {
      const c = value(i, start.step, start.lives, startBest);
      waitFor = { at: windows[i]!.at, chance: Math.max(...c.lineups.map((q) => quickChance(q, target(start.step)))) };
      skipped = i;
    }
  }
  // Playing now = the best lineup of the next window's own games, one life.
  const nowReach = own ? (() => {
    const q = [...own.lineups].sort((a, b) => quickChance(b, target(start.step)) - quickChance(a, target(start.step)))[0]!;
    const clear = quickChance(q, target(start.step));
    const next = firstAfter(q.last + SETTLES_AFTER_MS, 1);
    const won = value(next, up(start.step), upLives(start.step), Math.max(startBest, start.step)).reach;
    const lost = start.lives > 1 ? value(next, start.step, start.lives - 1, startBest).reach : value(next, 1, LIVES, startBest).reach;
    const reach = mix(clear, won, lost);
    return first?.play && first.to === 0 && comparePrizes(first.reach, reach, 0) > 0 ? first.reach : reach;
  })() : done(startBest);
  const kind: Verdict["kind"] = !first ? "none" : !first.play ? (waitFor ? "wait" : "none")
    : first.play >= start.lives && first.clear < 0.5 && start.step > 1 ? "spend" : "play";

  return {
    windows,
    path: W ? walk(0, start.step, start.lives, startBest) : [],
    odds,
    verdict: { kind, now: nowReach, wait: held?.reach ?? done(startBest), chanceNow, waitFor, skipped },
    after: (move, cleared) => { const next = outcome(move, cleared); return walk(firstAfter(move.settles, move.from + 1), next.n, next.lives, next.best); },
  };
}
