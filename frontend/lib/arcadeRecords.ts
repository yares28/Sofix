import { z } from "zod";

/**
 * Arcade's sources ranked by measured accuracy, and each player's start record (read model `arcade_outlook`, written with the Audit by
 * backend/app/sorare/arcade_outlook.py; plans/arcade-trust.md §4). The owner's rule (20 Nov 2026): "put the one with the best accuracy
 * at the top and each time fallback to the second, third, etc." A card takes the best-ranked source that has a number for his game.
 */

const Ranked = z.object({ source: z.string(), error: z.number(), n: z.number(), here: z.literal(false).optional() });
const PlayerRecord = z.object({
  /** Settled club games in his record (at most ten). */
  n: z.number(),
  /** His chance to start and to come on, smoothed as Sofix's forecast does. */
  s: z.number(),
  o: z.number(),
  /** His score from his last five starts (three at least), and as a substitute (smoothed toward a usual substitute's). */
  x: z.number().nullable(),
  b: z.number(),
  short: z.literal(true).optional(),
});
export const ArcadeRecordsSchema = z.object({
  ranking: z.object({ start: z.record(z.string(), z.array(Ranked)), score: z.record(z.string(), z.array(Ranked)) }),
  players: z.record(z.string(), PlayerRecord),
});
export type ArcadeRecords = z.infer<typeof ArcadeRecordsSchema>;
export type PlayerRecord = z.infer<typeof PlayerRecord>;

export type StartRank = "sorare" | "futbolfantasy" | "sofix" | "record";
export type ScoreRank = "sofix" | "sorare" | "form";
/** Before the job has measured anything: the main app's order, then the record. */
const START_ORDER: StartRank[] = ["futbolfantasy", "sorare", "sofix", "record"];
const SCORE_ORDER: ScoreRank[] = ["sofix", "sorare", "form"];

function order<T extends string>(ranked: Record<string, z.infer<typeof Ranked>[]> | undefined, competition: string, fallback: T[]): T[] {
  const listed = (ranked?.[competition] ?? ranked?.["*"] ?? []).map((r) => r.source).filter((s): s is T => fallback.includes(s as T));
  // A source the job did not rank (too few games anywhere) still comes after the ranked ones, never before.
  return [...listed, ...fallback.filter((s) => !listed.includes(s))];
}

export const startOrder = (records: ArcadeRecords | null, competition: string) => order(records?.ranking.start, competition, START_ORDER);
export const scoreOrder = (records: ArcadeRecords | null, competition: string) => order(records?.ranking.score, competition, SCORE_ORDER);

/** The first source in `ranked` with a number, and which one it was. */
export function firstOf<T extends string>(ranked: T[], values: Partial<Record<T, number | null>>): [number, T] | null {
  for (const source of ranked) {
    const value = values[source];
    if (value != null) return [value, source];
  }
  return null;
}
