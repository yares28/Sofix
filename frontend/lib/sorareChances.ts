import { z } from "zod";
import { cache } from "./cache";
import { database } from "./db";
import type { LineupChances, SorareGameLink } from "./lineupChances";

/**
 * Sorare's starting chances as the extension read them from Sorare's own page (plans/sorare-start-chances.md). The public
 * API answers null for them, so this is the only way Sofix has the number. One row per game, `read_models` key
 * `sorare_chances:<Game id>`: `{ players: { <player slug>: [basis points, seen at in epoch seconds] } }`.
 */
export const CHANCES_TAG = "sorare-chances";
const PREFIX = "sorare_chances:";
const GAME = /^Game:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const ChanceBatch = z.object({
  version: z.literal(1),
  rows: z.array(z.object({
    game: z.string().regex(GAME),
    player: z.string().regex(/^[a-z0-9-]{1,160}$/),
    basisPoints: z.number().int().min(0).max(10_000),
  })).min(1).max(600),
});
export type ChanceRow = z.infer<typeof ChanceBatch>["rows"][number];
export type SavedChances = Record<string, Record<string, [number, number]>>; // game id -> player slug -> [basis points, seen at]

/** One document per game, the newest reading of each player. */
export function byGame(rows: ChanceRow[], seenAt: number): SavedChances {
  const out: SavedChances = {};
  for (const row of rows) (out[row.game] ??= {})[row.player] = [row.basisPoints, seenAt];
  return out;
}

/** Add readings to what is kept. The merge runs inside Postgres, so saving never downloads a row. Returns the games written. */
export async function saveChances(rows: ChanceRow[], now = new Date()): Promise<number> {
  const sql = database();
  if (!sql) throw new Error("No database configured.");
  const games = Object.entries(byGame(rows, Math.floor(now.getTime() / 1000)));
  for (const [game, players] of games) {
    const text = JSON.stringify({ players });
    await sql`INSERT INTO read_models (key, payload, updated_at) VALUES (${PREFIX + game}, ${text}::json, ${now.toISOString()})
      ON CONFLICT (key) DO UPDATE SET updated_at = EXCLUDED.updated_at,
        payload = jsonb_build_object('players', COALESCE(read_models.payload::jsonb -> 'players', '{}'::jsonb) || (EXCLUDED.payload::jsonb -> 'players'))::json`;
  }
  return games.length;
}

const kept = cache(
  async (games: string[]): Promise<SavedChances> => {
    const sql = database();
    if (!sql || !games.length) return {};
    const rows = (await sql`SELECT key, payload FROM read_models WHERE key = ANY(${games.map((game) => PREFIX + game)})`) as {
      key: string;
      payload: { players?: Record<string, [number, number]> };
    }[];
    return Object.fromEntries(rows.map((row) => [row.key.slice(PREFIX.length), row.payload.players ?? {}]));
  },
  ["sorare-chances-v1"],
  { tags: [CHANCES_TAG], revalidate: 300 },
);

/** The kept readings of these games; nothing without a database (local development on the stand-in API, the browser tests). */
export async function loadSavedChances(games: string[]): Promise<SavedChances> {
  try {
    return await kept([...new Set(games.filter((game) => GAME.test(game)))].sort());
  } catch {
    return {};
  }
}

/** Kept readings as the Lineups page's Sorare view: by Futbol Fantasy match and player, through each match's Sorare link. */
export function savedLineupChances(saved: SavedChances, links: Record<number, SorareGameLink>): LineupChances {
  const out: LineupChances = {};
  for (const [match, link] of Object.entries(links)) {
    for (const [slug, reading] of Object.entries(saved[link.id] ?? {})) {
      const player = link.players[slug];
      const basisPoints = reading?.[0];
      if (player && Number.isInteger(basisPoints) && basisPoints >= 0 && basisPoints <= 10_000) (out[match] ??= {})[player] = { sorare: basisPoints / 10_000 };
    }
  }
  return out;
}

/** How many players each linked match has a kept reading for, and when the newest was seen (ISO), for the page's status line. */
export function savedCoverage(saved: SavedChances, links: Record<number, SorareGameLink>): { players: number; games: number; at: string | null } {
  let players = 0, games = 0, newest = 0;
  for (const link of Object.values(links)) {
    const readings = Object.values(saved[link.id] ?? {});
    if (!readings.length) continue;
    games++;
    players += readings.length;
    newest = Math.max(newest, ...readings.map((reading) => reading[1] ?? 0));
  }
  return { players, games, at: newest ? new Date(newest * 1000).toISOString() : null };
}
