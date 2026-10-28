import type { ChanceRow } from "./sorareChances";

/**
 * Rebuild the plan on news, not only on the clock (plans/plan-algorithm-v2.md step 7). Each refresh publishes `plan_watch`: the
 * recommended plan's starters with the starting chance Sorare gave each when the plan was built. When the extension reads Sorare's
 * page and a starter's chance has moved by `NEWS_MOVE` or more, the plan stands on old news and a refresh is started (at most one
 * every `NEWS_GAP_MS`, and only while the week is still to lock).
 */
export type PlanWatch = { lock: string; builtAt: string; players: Record<string, number> };

export const NEWS_MOVE = 0.25;
export const NEWS_GAP_MS = 25 * 60_000;

/** The planned starters whose new reading moved by at least `NEWS_MOVE` from the one the plan was built on. */
export function newsFor(watch: PlanWatch | null, rows: ChanceRow[], now: number): string[] {
  if (!watch || Date.parse(watch.lock) <= now) return [];
  const moved = new Set<string>();
  for (const row of rows) {
    const known = watch.players[row.player];
    if (known !== undefined && Math.abs(row.basisPoints / 10_000 - known) >= NEWS_MOVE) moved.add(row.player);
  }
  return [...moved];
}

/** Whether news may start a refresh now: none running, and none started in the last `NEWS_GAP_MS`. */
export function mayRefresh(running: boolean, lastStart: number | null, now: number): boolean {
  return !running && (lastStart === null || now - lastStart >= NEWS_GAP_MS);
}
