import { cache } from "./cache";
import { database, readModel } from "./db";
import { SORARE_TAG } from "./play";
import type { Sheets } from "./playerSheet";

import type { SavedGame, Absence, PlayerHistory } from "./playerHistory";
export type { SavedGame, Absence, PlayerHistory } from "./playerHistory";
const SLUG = /^[a-z0-9][a-z0-9-]{0,80}$/;
const API_BASE = process.env.API_BASE_URL ?? "http://127.0.0.1:8000";
type DatabaseGame = Omit<SavedGame, "date" | "read_at"> & { date: string | Date; read_at: string | Date | null };
type DatabaseAbsence = Omit<Absence, "first_seen" | "last_seen" | "back"> & { first_seen: string | Date; last_seen: string | Date; back: string | Date | null };
const iso = (date: string | Date): string => date instanceof Date ? date.toISOString() : date;

async function local<T>(path: string): Promise<T | null> {
  const res = await fetch(`${API_BASE}/api/${path}`, { cache: "no-store", signal: AbortSignal.timeout(8000) });
  if (!res.ok) return null;
  const body = await res.json() as { success?: boolean; data?: T };
  return body.success ? body.data ?? null : null;
}

export async function loadPlayerGames(slug: string): Promise<PlayerHistory | null> {
  if (!SLUG.test(slug)) return null;
  const read = cache(async (): Promise<PlayerHistory | null> => {
    const sql = database();
    if (!sql) return local<PlayerHistory>(`players/${slug}/games`);
    const games = await sql`SELECT game_id, date, competition, home, away, status, score, played, started, mins, yellow, red, sofix_x, sorare_x, read_at
      FROM player_games WHERE player = ${slug} AND date <= CURRENT_TIMESTAMP ORDER BY date DESC, game_id` as DatabaseGame[];
    const absences = await sql`SELECT id, kind, cause, first_seen, last_seen, back,
      (SELECT CASE WHEN payload->'links'->${slug}->>'slug' IS NOT NULL THEN 'https://www.futbolfantasy.com/jugadores/' || (payload->'links'->${slug}->>'slug') END FROM read_models WHERE key = 'ff_links') AS url
      FROM player_absences WHERE player = ${slug} ORDER BY first_seen DESC, id DESC` as DatabaseAbsence[];
    return {
      games: games.map(game => ({ ...game, date: iso(game.date), read_at: game.read_at === null ? null : iso(game.read_at) })),
      absences: absences.map(absence => ({ ...absence, first_seen: iso(absence.first_seen), last_seen: iso(absence.last_seen), back: absence.back === null ? null : iso(absence.back) })),
    };
  }, ["player-games-v2", slug], { tags: [SORARE_TAG], revalidate: 3600 });
  try { return await read(); } catch { return null; }
}

const savedSheets = cache(async (): Promise<Sheets | null> => {
  if (database()) return (await readModel<Sheets>("player_sheets"))?.payload ?? null;
  return local<Sheets>("player-sheets");
}, ["player-sheets-v1"], { tags: [SORARE_TAG], revalidate: 3600 });

export async function loadPlayerSheets(): Promise<Sheets> {
  try { return await savedSheets() ?? { asOf: "", players: {} }; } catch { return { asOf: "", players: {} }; }
}
