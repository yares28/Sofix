import { z } from "zod";

/** The Pro page's block (backend/app/sorare/publish.py `pro_plan_payload`, written by the refresh's Sorare step; plans/pro-page.md). */
export const PRO_KEY = "sorare_pro";

const fixture = z.object({
  opponent: z.string().nullable(), opponentCrest: z.string().nullable(), venue: z.string().nullable(),
  kickoff: z.string().nullable(), bucket: z.number().int().nullable().default(null),
});
const proCard = z.object({
  slug: z.string(), player: z.string(), name: z.string(), pos: z.string(), pic: z.string().nullable(), inSeason: z.boolean(),
  mult: z.number(), start: z.number(), x: z.number(), club: z.string().nullable(), crest: z.string().nullable(),
  fixture: fixture.nullable(), l5: z.array(z.tuple([z.number(), z.number()])),
});
const starter = proCard.extend({
  slot: z.string(), captain: z.boolean(), late: z.string().nullable(), subs: z.array(proCard),
});
const planned = z.object({
  start: z.string(), span: z.string(), reach: z.array(z.number()), x: z.number(), starters: z.array(starter),
});
const board = z.object({
  key: z.string(), name: z.string(), slug: z.string(), minInSeason: z.number().int(),
  steps: z.array(z.object({ level: z.number().int(), target: z.number(), cash: z.number(), essence: z.number() })),
  batches: z.array(z.object({ from: z.string(), to: z.string(), cards: z.array(proCard) })),
  byBatch: z.array(planned), bestFive: z.array(planned),
});
/** A player of yours with free cards after the Sorare page's lineups (backend `pro_spare`). */
const spare = z.object({
  player: z.string(), name: z.string(), pos: z.string(), pic: z.string().nullable().default(null), crest: z.string().nullable().default(null),
  inSeason: z.boolean(), free: z.number().int().positive(), start: z.number(), x: z.number(),
});
const block = z.object({
  version: z.literal(1), builtAt: z.string(),
  weeks: z.array(z.object({
    slug: z.string(), number: z.number().int(), start: z.string(), end: z.string(), boards: z.array(board),
    leftovers: z.array(spare).default([]), notPlaced: z.array(spare).default([]),
  })),
});
export type ProSpare = z.infer<typeof spare>;
/** A list longer than this is paginated (AGENTS.md, page design). */
export const PAGE_SIZE = 12;

export type ProBlock = z.infer<typeof block>;
export type ProBoard = z.infer<typeof board>;
export type ProPlanned = z.infer<typeof planned>;
export type ProStarter = z.infer<typeof starter>;
export type ProCard = z.infer<typeof proCard>;

export function readable(raw: unknown): ProBlock | null {
  const parsed = block.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

export type Result = "open" | "cleared" | "missed";
export const LIVES = 4;
/** Two plans whose chances are within this are a tie (Arcade's LEG_TIE): a tie plays now. */
export const TIE = 0.02;

/**
 * The step each lineup plays, in kick-off order: the board's current step plus the lineups before it marked cleared
 * ("what happens if a lineup cleared the step", the owner, 25 Nov 2026). Index 0 is the board's current step.
 */
export function stepsPlayed(lineups: ProPlanned[], results: Result[]): number[] {
  let cleared = 0;
  return lineups.map((_, i) => {
    const at = cleared;
    if (results[i] === "cleared") cleared += 1;
    return at;
  });
}

/** The chance of each lineup at the step it plays (0 past the board's last step). */
export function chanceAt(lineup: ProPlanned, step: number): number {
  return lineup.reach[step] ?? 0;
}

/**
 * The chance of reaching each step this matchday (index k: at least k + 1 steps cleared), every open lineup played in order at the
 * step it would then play, cleared and missed ones fixed.
 */
export function reachChances(lineups: ProPlanned[], results: Result[], steps: number): number[] {
  let dist = new Map<number, number>([[0, 1]]);
  lineups.forEach((lineup, i) => {
    const next = new Map<number, number>();
    for (const [at, q] of dist) {
      const r = results[i] ?? "open";
      const p = r === "cleared" ? 1 : r === "missed" ? 0 : chanceAt(lineup, at);
      next.set(at + 1, (next.get(at + 1) ?? 0) + q * p);
      next.set(at, (next.get(at) ?? 0) + q * (1 - p));
    }
    dist = next;
  });
  return Array.from({ length: steps }, (_, k) => [...dist].reduce((sum, [at, q]) => sum + (at > k ? q : 0), 0));
}

export type Move = { tag: "play" | "hold" | "cleared" | "missed"; chance: number; step: number };

/**
 * Hold or play, for the matchday (the owner, 25 Nov 2026: "do I miss out on the other lineups?" No). Lineups use different cards and a
 * step's four lives last the matchday, so every lineup is played in kick-off order; one is held only when more than four would play
 * the same step (the weakest wait) or when it cannot clear its step.
 */
export function moves(lineups: ProPlanned[], results: Result[]): Move[] {
  const at = stepsPlayed(lineups, results);
  const held = new Set<number>();
  for (const step of new Set(at)) {
    const here = lineups.map((l, i) => ({ i, c: chanceAt(l, at[i]!) })).filter(({ i }) => at[i] === step);
    const spent = here.filter(({ i }) => (results[i] ?? "open") !== "open").length;
    here.filter(({ i }) => (results[i] ?? "open") === "open").sort((a, b) => b.c - a.c).slice(Math.max(0, LIVES - spent)).forEach(({ i }) => held.add(i));
    here.forEach(({ i, c }) => { if (c === 0 && (results[i] ?? "open") === "open") held.add(i); });
  }
  return lineups.map((l, i) => {
    const r = results[i] ?? "open";
    return { tag: r === "cleared" ? "cleared" : r === "missed" ? "missed" : held.has(i) ? "hold" : "play", chance: chanceAt(l, at[i]!), step: at[i]! };
  });
}

/** The chance of clearing the board's current step this matchday with the lineups the moves play. */
export function clearChance(lineups: ProPlanned[], results: Result[]): number {
  const m = moves(lineups, results);
  let miss = 1;
  m.forEach((move, i) => {
    if (move.step !== 0) return;
    const r = results[i] ?? "open";
    const p = r === "cleared" ? 1 : r === "missed" || move.tag === "hold" ? 0 : move.chance;
    miss *= 1 - p;
  });
  return 1 - miss;
}

/**
 * This matchday against the next one (the owner, 25 Nov 2026: "Yes, add it"). Skipping a matchday is free and the step clock only
 * starts with a lineup, so the matchday is held when the next one is clearly better (more than TIE); a tie plays now.
 */
export function holdMatchday(now: number, next: number | null): boolean {
  return next !== null && next - now > TIE;
}
