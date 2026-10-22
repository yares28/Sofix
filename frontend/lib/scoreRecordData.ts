import { cache } from "./cache";
import { database, readModelAt, stamp } from "./db";
import { SORARE_TAG } from "./play";

/** Reassemble after the cached reads: a complete record can exceed Next's per-entry limit. */
export async function loadScoreRecord<T>(slug: string): Promise<T | null> {
  if (!/^[a-z0-9][a-z0-9-]{0,80}$/.test(slug)) return null;
  const key = `score_record:${slug}`;
  const written = cache(async () => {
    const rows = await database()!`SELECT updated_at FROM read_models WHERE key = ${key}` as { updated_at: string | Date }[];
    return rows[0] ? stamp(rows[0].updated_at) : null;
  }, ["score-record-written-v1", slug], { tags: [SORARE_TAG], revalidate: 3600 });
  const at = await written();
  if (!at) return null;
  const [head, ...players] = await Promise.all([-1, 0, 1, 2, 3].map(part => readModelAt(key, at, part)));
  if (!head || players.some(part => part === null || part === undefined)) return null;
  return { ...head as object, players: Object.assign({}, ...players) } as T;
}
