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

/** The short name a small number wears next to a card: SF and SO are the app's own short names for the two sources. */
export const SCORE_TAGS: Record<ScoreView, string> = { actual: "Pts", sofix: "SF", sorare: "SO" };

/**
 * The numbers that go next to the main one under a card, so what was expected and what happened are read together: both
 * expected scores next to the real one, the real one next to an expected score. A number nobody gave is left out.
 */
export function sideScores(player: LineupPlayer, view: { show: ScoreView; values: MatchScores }): { view: ScoreView; n: number }[] {
  const one = player.slug ? view.values[player.slug] : undefined;
  const others: ScoreView[] = view.show === "actual" ? ["sofix", "sorare"] : ["actual"];
  return others.flatMap((other) => (typeof one?.[other] === "number" ? [{ view: other, n: one[other]! }] : []));
}

/** The bench of the Scores page: who scored most first; a player who did not play keeps his place after them. */
export function byScore(players: LineupPlayer[], scores: MatchScores): LineupPlayer[] {
  const of = (player: LineupPlayer) => (player.slug ? scores[player.slug]?.actual : null) ?? -Infinity;
  return [...players].sort((a, b) => of(b) - of(a));
}

const said = (view: ScoreView, n: number) => (view === "actual" ? `scored ${Math.round(n)}` : `${SCORE_VIEWS[view]} expected ${Math.round(n)}`);

/** A card's numbers said aloud: the screen reader's line and the tooltip. */
export function scoreWords(player: LineupPlayer, view: { show: ScoreView; values: MatchScores }): string {
  const n = player.slug ? (view.values[player.slug]?.[view.show] ?? null) : null;
  const role = player.actual === "bench" ? "bench" : "started";
  const main = n !== null ? said(view.show, n) : view.show === "actual" ? "no score" : `no ${SCORE_VIEWS[view.show]} number`;
  return [player.name, role, main, ...sideScores(player, view).map((one) => said(one.view, one.n))].join(", ");
}
