import { unstable_cache } from "next/cache";
import { cache } from "./cache";
import { published, readModel, readModelAt } from "./db";
import { blockAt, blockVersion, blockVersions } from "./r2";
import { scoreRecordBucket } from "./scoreRecordParts";
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

/** One piece of the sheets: -1 the head, 0-3 a group of players (the md5 group score records use). */
export function sheetsPart(sheets: Sheets, part: number): unknown {
  const { players, ...head } = sheets;
  return part < 0 ? head : Object.fromEntries(Object.entries(players ?? {}).filter(([slug]) => scoreRecordBucket(slug) === part));
}

// The sheets are over Next's 2 MB cache limit in one piece (2.3 MB on 26 Oct 2026), which made every view of a player page
// download them again. Each piece is kept under the block's version; the whole block is downloaded once per change and server.
const sheetsPiece = unstable_cache(
  async (part: number, version: string): Promise<unknown> => {
    const whole = (await blockAt("player_sheets", version))?.payload as Sheets | undefined;
    return whole ? sheetsPart(whole, part) : null;
  },
  ["player-sheets-part-v1"],
  { revalidate: 86400 },
);
const sheetsVersion = cache(async (): Promise<string | null> => blockVersion("player_sheets"), ["player-sheets-version-v1"], { tags: [SORARE_TAG], revalidate: 3600 });

async function savedSheets(): Promise<Sheets | null> {
  if (!published()) return local<Sheets>("player-sheets");
  const version = await sheetsVersion();
  if (!version) return null;
  const [head, ...groups] = await Promise.all([-1, 0, 1, 2, 3].map((part) => sheetsPiece(part, version)));
  return head ? { ...(head as Omit<Sheets, "players">), players: Object.assign({}, ...(groups as Sheets["players"][])) } : null;
}

export async function loadPlayerSheets(): Promise<Sheets> {
  try { return await savedSheets() ?? { asOf: "", players: {} }; } catch { return { asOf: "", players: {} }; }
}
