import { z } from "zod";

/** The Targets page's block: each competition's score to be paid anything, averaged over the finished gameweeks
 * (backend/app/sorare/reward_bars.py, written by the refresh's Sorare step). */
export const REWARD_BARS_KEY = "reward_bars";

const score = z.number().finite().nullable();
const level = z.object({ lo: z.number().int(), hi: z.number().int(), cash: z.number(), essence: z.number(), card: z.boolean(), bar: score });
const competition = z.object({
  key: z.string(), name: z.string(), rarity: z.string().nullable(), group: z.string().nullable(),
  kind: z.enum(["rank", "room", "target"]), size: z.number().int().nullable(), paidTo: z.number().int().nullable(),
  bar: score, low: score, high: score, latest: score, samples: z.number().int().nonnegative(),
  byWeek: z.array(z.object({ week: z.string(), score })),
  reward: z.object({ cash: z.number(), essence: z.number(), card: z.boolean() }).nullable(),
  ladder: z.array(level),
});
const unread = z.object({ key: z.string(), name: z.string(), rarity: z.string().nullable(), why: z.string() });
const bars = z.object({
  version: z.literal(1), latest: z.string().nullable(), weeks: z.array(z.string()),
  competitions: z.array(competition), unread: z.array(unread),
});

export type RewardBars = z.infer<typeof bars>;
export type BarCompetition = z.infer<typeof competition>;
export type BarLevel = z.infer<typeof level>;
export type Unread = z.infer<typeof unread>;

export function readable(raw: unknown): RewardBars | null {
  const parsed = bars.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

/** The groups the list switches between, in the order Sorare's lobby shows them. */
export const GROUPS = [
  { value: "In-season", label: "In-season" },
  { value: "Classic", label: "Classic" },
  { value: "Room", label: "Rooms" },
  { value: "Pro", label: "Pro" },
] as const;

const fmt = new Intl.NumberFormat("en-GB");

/** Where the bar sits: "Top 1,500", "Top 3 of 10", "Step 2". */
export function placeLabel(c: Pick<BarCompetition, "kind" | "paidTo" | "size" | "ladder">): string | null {
  if (c.kind === "target") return c.ladder[0] ? `Step ${c.ladder[0].lo}` : null;
  if (c.paidTo === null) return null;
  return c.kind === "room" ? `Top ${c.paidTo} of ${c.size ?? 10}` : `Top ${fmt.format(c.paidTo)}`;
}

/** What that level pays, in Sorare's own units: "$10", "50 essence", "a card". */
export function prizeLabel(p: { cash: number; essence: number; card: boolean } | null): string | null {
  if (!p) return null;
  const parts = [p.cash ? `$${fmt.format(p.cash)}` : "", p.essence ? `${fmt.format(p.essence)} essence` : "", p.card ? "a card" : ""];
  return parts.filter(Boolean).join(" + ") || null;
}

/** The shared score scale of the ruler: whole fifties around every bar, ticks every hundred (fifty when narrow). */
export function scaleOf(values: number[]): { lo: number; hi: number; ticks: number[] } {
  if (!values.length) return { lo: 0, hi: 700, ticks: [0, 100, 200, 300, 400, 500, 600, 700] };
  const lo = Math.floor((Math.min(...values) - 15) / 50) * 50;
  const hi = Math.ceil((Math.max(...values) + 15) / 50) * 50;
  const step = hi - lo <= 200 ? 50 : 100;
  const ticks: number[] = [];
  for (let t = Math.ceil(lo / step) * step; t <= hi; t += step) ticks.push(t);
  return { lo, hi, ticks };
}

export const at = (value: number, scale: { lo: number; hi: number }): number =>
  Math.min(100, Math.max(0, ((value - scale.lo) / (scale.hi - scale.lo || 1)) * 100));

/** Each pinned flag's row above the ruler: a flag closer than `gap` percent to the last one in a row goes up a row. */
export function lanes(points: { key: string; at: number }[], gap: number): Map<string, number> {
  const ends: number[] = [];
  const out = new Map<string, number>();
  for (const p of [...points].sort((a, b) => a.at - b.at)) {
    let lane = ends.findIndex((end) => p.at - end >= gap);
    if (lane < 0) lane = ends.length;
    ends[lane] = p.at;
    out.set(p.key, lane);
  }
  return out;
}

/** Your pins and hidden competitions, kept in this browser. */
export type Prefs = { pinned: string[]; hidden: string[] };
export const PREFS_KEY = "sofix.targets.v1";
export const DEFAULT_PREFS: Prefs = { pinned: ["LALIGA EA SPORTS | Limited"], hidden: [] };

export function readPrefs(raw: string | null): Prefs {
  try {
    const parsed = z.object({ pinned: z.array(z.string()), hidden: z.array(z.string()) }).safeParse(JSON.parse(raw ?? "null"));
    return parsed.success ? parsed.data : DEFAULT_PREFS;
  } catch {
    return DEFAULT_PREFS;
  }
}

export function toggle(prefs: Prefs, key: string, what: "pin" | "hide"): Prefs {
  const has = (list: string[]) => list.includes(key);
  const without = (list: string[]) => list.filter((k) => k !== key);
  if (what === "pin") return has(prefs.pinned) ? { ...prefs, pinned: without(prefs.pinned) } : { pinned: [...prefs.pinned, key], hidden: without(prefs.hidden) };
  return has(prefs.hidden) ? { ...prefs, hidden: without(prefs.hidden) } : { pinned: without(prefs.pinned), hidden: [...prefs.hidden, key] };
}
