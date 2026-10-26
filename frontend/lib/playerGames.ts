import { cache } from "./cache";
import { published, readModel, readModelAt } from "./db";
import { blockVersions } from "./r2";
import { SORARE_TAG } from "./play";
import type { Sheets } from "./playerSheet";

import type { PlayerHistory } from "./playerHistory";
export type { SavedGame, Absence, PlayerHistory } from "./playerHistory";
const SLUG = /^[a-z0-9][a-z0-9-]{0,80}$/;
const API_BASE = process.env.API_BASE_URL ?? "http://127.0.0.1:8000";

async function local<T>(path: string): Promise<T | null> {
  const res = await fetch(`${API_BASE}/api/${path}`, { cache: "no-store", signal: AbortSignal.timeout(8000) });
  if (!res.ok) return null;
  const body = await res.json() as { success?: boolean; data?: T };
  return body.success ? body.data ?? null : null;
}

/**
 * Every game and absence the jobs keep for one player, as published to R2 (`player_games:<slug>`, backend
 * app/services/player_blocks.py), newest first. A game shows once it has started.
 */
export async function loadPlayerGames(slug: string): Promise<PlayerHistory | null> {
  if (!SLUG.test(slug)) return null;
  const read = cache(async (): Promise<PlayerHistory | null> => {
    if (!published()) return local<PlayerHistory>(`players/${slug}/games`);
    return ((await readModel<PlayerHistory>(`player_games:${slug}`))?.payload ?? { games: [], absences: [] });
  }, ["player-games-v4", slug], { tags: [SORARE_TAG], revalidate: 3600 });
  try {
    const history = await read();
    return history && { ...history, games: history.games.filter((game) => Date.parse(game.date) <= Date.now()) };
  } catch { return null; }
}

/** These players' published histories (one R2 listing for their versions); a player with none is left out. */
export async function loadPlayerHistories(slugs: string[]): Promise<Map<string, PlayerHistory>> {
  const wanted = [...new Set(slugs.filter((slug) => SLUG.test(slug)))];
  if (!wanted.length || !published()) return new Map();
  const versions = await blockVersions("player_games:");
  const found = await Promise.all(wanted.map(async (slug) => {
    const version = versions.get(`player_games:${slug}`);
    return [slug, version ? (await readModelAt(`player_games:${slug}`, version)) as PlayerHistory | null : null] as const;
  }));
  return new Map(found.filter((entry): entry is readonly [string, PlayerHistory] => entry[1] !== null));
}

const savedSheets = cache(async (): Promise<Sheets | null> => {
  if (published()) return (await readModel<Sheets>("player_sheets"))?.payload ?? null;
  return local<Sheets>("player-sheets");
}, ["player-sheets-v1"], { tags: [SORARE_TAG], revalidate: 3600 });

export async function loadPlayerSheets(): Promise<Sheets> {
  try { return await savedSheets() ?? { asOf: "", players: {} }; } catch { return { asOf: "", players: {} }; }
}
