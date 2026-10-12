import { z } from "zod";
import type { LineupPlayer } from "./lineups";

/** What the Scores page can show under a card: what he scored, or what Sofix or Sorare expected of him. */
export type ScoreView = "actual" | "sofix" | "sorare";
export const SCORE_VIEWS: Record<ScoreView, string> = { actual: "Actual", sofix: "Sofix", sorare: "Sorare" };
/** `actual` is null until he has played in the game: a player left on the bench has no score, not a zero. */
export type PlayerScore = Record<ScoreView, number | null>;
export type MatchScores = Record<string, PlayerScore>;
/** The part of a week's kept record (`score_record:<slug>`) the page reads: Sofix's number for each game, written before the lock. */
export type SofixRecord = { players: Record<string, { mu?: number | null; games: { id?: string | null; sofix?: number | null }[] }> };

const Row = z.object({
  score: z.number().nullable(),
  projection: z.object({ score: z.number().nullable() }).nullable(),
  anyPlayer: z.object({ slug: z.string().min(1) }),
  anyPlayerGameStats: z.object({ playedInGame: z.boolean().nullable() }).nullable(),
});

/** Sorare's public scores of one game, by player. A row that does not read is left out rather than guessed. */
export function readScores(rows: unknown[]): MatchScores {
  const scores: MatchScores = {};
  for (const row of rows) {
    const parsed = Row.safeParse(row);
    if (!parsed.success) continue;
    const { score, projection, anyPlayer, anyPlayerGameStats } = parsed.data;
    scores[anyPlayer.slug] = { actual: anyPlayerGameStats?.playedInGame && score !== null ? score : null, sofix: null, sorare: projection?.score ?? null };
  }
  return scores;
}

/** Sofix's expected score of every player in one Sorare game: the game's own number, else (his first game only) the week's. */
export function sofixScores(records: SofixRecord[], game: string): Record<string, number> {
  const found: Record<string, number> = {};
  for (const record of records) for (const [slug, player] of Object.entries(record.players ?? {})) {
    const index = (player.games ?? []).findIndex((one) => one.id === game);
    if (index < 0) continue;
    const said = player.games[index]!.sofix ?? (index === 0 ? player.mu : null);
    if (typeof said === "number" && Number.isFinite(said)) found[slug] = said;
  }
  return found;
}

/**
 * How close one source was for a team: 100 minus the average gap, in points, between what it expected and what each player
 * scored (a Sorare score runs 0 to 100). Only players who played and had a number count; null when there is none.
 */
export function accuracy(players: LineupPlayer[], scores: MatchScores, source: "sofix" | "sorare"): { percent: number; off: number; players: number } | null {
  const gaps = players.flatMap((player) => {
    const one = player.slug ? scores[player.slug] : undefined;
    const said = one?.[source];
    return one && one.actual !== null && said !== null && said !== undefined ? [Math.abs(one.actual - said)] : [];
  });
  if (!gaps.length) return null;
  const off = gaps.reduce((sum, gap) => sum + gap, 0) / gaps.length;
  return { percent: Math.max(0, Math.round(100 - off)), off: Math.round(off), players: gaps.length };
}

/** A card's number said aloud: the screen reader's line and the tooltip. */
export function scoreWords(player: LineupPlayer, view: { show: ScoreView; values: MatchScores }): string {
  const n = player.slug ? (view.values[player.slug]?.[view.show] ?? null) : null;
  const role = player.actual === "bench" ? "bench" : "started";
  if (view.show === "actual") return `${player.name}, ${role}, ${n === null ? "no score" : `scored ${Math.round(n)}`}`;
  return `${player.name}, ${role}, ${n === null ? `no ${SCORE_VIEWS[view.show]} number` : `${SCORE_VIEWS[view.show]} expected ${Math.round(n)}`}`;
}
