import { cache } from "./cache";
import { database, readModel } from "./db";
import { SORARE_TAG } from "./play";
import { playerBucket, type ForeignBlock, type ForeignDirectory, type ForeignLeague } from "./foreignPlayers";

const API_BASE = process.env.API_BASE_URL ?? "http://127.0.0.1:8000";
const SLUG = /^[a-z0-9][a-z0-9-]{0,80}$/;

async function block<T>(key: string, path: string): Promise<T | null> {
  const read = cache(async () => {
    if (database()) return (await readModel<T>(key))?.payload ?? null;
    const response = await fetch(`${API_BASE}/api/sorare/${path}`, { cache: "no-store", signal: AbortSignal.timeout(8000) });
    if (!response.ok) return null;
    const body = await response.json() as { success?: boolean; data?: T };
    return body.success ? body.data ?? null : null;
  }, ["foreign-player-block-v1", key], { tags: [SORARE_TAG], revalidate: 3600 });
  try { return await read(); } catch { return null; }
}

export async function loadForeignDirectory(): Promise<ForeignDirectory | null> {
  const directory = await block<ForeignDirectory>("player_index", "player-index");
  if (!directory) return null;
  // The first publication did not carry positions. Reuse its cached league blocks during that transition;
  // new directories resolve directly without downloading either full league for search or a detail page.
  const legacy = (["PL", "BL1"] as const).filter(code => directory.players.some(p => p.league === code && p.pos === undefined));
  const indexed = await Promise.all(legacy.map(async code => [code, await loadLeaguePlayers(code)] as const));
  const allowed = new Map(indexed.filter(([, value]) => value).map(([code, value]) => [code, new Set(value!.market.filter(p => ["GK", "DEF", "MID", "FWD"].includes(p.pos)).map(p => p.slug))]));
  return { players: directory.players.filter(p => p.pos === undefined ? !allowed.has(p.league) || allowed.get(p.league)!.has(p.slug) : p.pos !== null) };
}
export const loadLeaguePlayers = (code: ForeignLeague) => block<ForeignBlock>(`players:${code}`, `players/${code}`);

/** A small directory resolves identity before reading one bounded detail shard. */
export async function loadForeignPlayer(slug: string): Promise<ForeignBlock | null> {
  if (!SLUG.test(slug)) return null;
  const directory = await loadForeignDirectory();
  const code = directory?.players.find(p => p.slug === slug)?.league;
  if (code !== "PL" && code !== "BL1") return null;
  const bucket = playerBucket(slug);
  return block<ForeignBlock>(`players:${code}:${bucket}`, `players/${code}/${bucket}`);
}
