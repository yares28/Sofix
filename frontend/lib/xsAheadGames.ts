import { z } from "zod";

/**
 * Sofix's xS for every upcoming game of every tracked player, not only his next one (plans/xs-ahead.md; read models `xs_ahead:<code>`,
 * written by the refresh's Sorare step, backend/app/sorare/ahead.py): [kick-off, competition, venue, opponent, xS if he starts,
 * xS if he comes on, chance of a decisive action, v3's model]. A game no board covers is not in it. Safe for the browser; lib/xsAhead.ts reads it.
 *
 * v3's whole model for one game (backend publish.v3_shape): [decisive chance, normal score, decisive score, their spreads].
 */
export const V3ShapeSchema = z.tuple([z.number(), z.number(), z.number(), z.number(), z.number()]);
export type V3Shape = z.infer<typeof V3ShapeSchema>;
// The eighth item (v3's model) came with the 24 Nov 2026 refresh; a row without it keeps v1's number alone.
const Game = z.tuple([z.string(), z.string(), z.enum(["H", "A"]), z.string(), z.number(), z.number().nullable(), z.number()]).rest(V3ShapeSchema.nullable());
export type AheadGame = z.infer<typeof Game>;
export const XsAheadSchema = z.record(z.string(), z.array(Game));
export type XsAhead = z.infer<typeof XsAheadSchema>;

/** A club plays one game in 36 hours at most: the same competition within that is the same game, whatever time each list gives it
 * (a time not set yet reads midnight on one list and the real time on another). */
const SAME_GAME_MS = 36 * 3_600_000;

/** His row for one game, or null when no board has it. */
export function aheadGame(rows: AheadGame[] | undefined, competition: string, kickoff: number): AheadGame | null {
  let best: AheadGame | null = null;
  for (const row of rows ?? []) {
    const gap = Math.abs(Date.parse(row[0]) - kickoff);
    if (row[1] === competition && gap <= SAME_GAME_MS && (!best || gap < Math.abs(Date.parse(best[0]) - kickoff))) best = row;
  }
  return best;
}
