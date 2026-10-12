import { neon, type NeonQueryFunction } from "@neondatabase/serverless";
import { unstable_cache } from "next/cache";

/**
 * Server-only access to Neon over HTTP (no pool, no socket: fine for serverless functions).
 * Production reads the pages the jobs published into `read_models`; local development without
 * DATABASE_URL falls back to the FastAPI server (see lib/api.ts).
 */
let client: NeonQueryFunction<false, false> | null = null;

export function database(): NeonQueryFunction<false, false> | null {
  const url = process.env.DATABASE_URL;
  if (!url) return null;
  client ??= neon(url);
  return client;
}

export type ReadModelRow<T> = { payload: T; updatedAt: string };

export const stamp = (at: string | Date): string => (at instanceof Date ? at.toISOString() : String(at));

/**
 * One payload as written at `updatedAt`, kept in Next's cache under that time. Neon's free plan counts every byte it sends
 * (5 GB a month, then the database is suspended), so a payload is downloaded once per change: not once per page view, per
 * refresh or per localhost reload. The time is part of the cache key, so this is never stale and is safe under `npm run dev`.
 * Next does not cache an item over 2 MB (about 1.6 MB of JSON): read a bigger payload in pieces, as lib/missionsPool.ts does.
 */
export const readModelAt = unstable_cache(
  async (key: string, updatedAt: string): Promise<unknown> => {
    void updatedAt;
    const rows = (await database()!`SELECT payload FROM read_models WHERE key = ${key}`) as { payload: unknown }[];
    return rows[0]?.payload ?? null;
  },
  ["read-model-at-v1"],
  { revalidate: 86400 },
);

/** One published page payload, or null when that key has never been written. Asks Neon only for the write time. */
export async function readModel<T = unknown>(key: string): Promise<ReadModelRow<T> | null> {
  const sql = database();
  if (!sql) return null;
  const rows = (await sql`SELECT updated_at FROM read_models WHERE key = ${key}`) as { updated_at: string | Date }[];
  if (!rows[0]) return null;
  const updatedAt = stamp(rows[0].updated_at);
  const payload = (await readModelAt(key, updatedAt)) as T | null;
  return payload === null ? null : { payload, updatedAt };
}
