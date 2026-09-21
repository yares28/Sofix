import { neon, type NeonQueryFunction } from "@neondatabase/serverless";

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

/** One published page payload, or null when that key has never been written. */
export async function readModel<T = unknown>(key: string): Promise<ReadModelRow<T> | null> {
  const sql = database();
  if (!sql) return null;
  const rows = (await sql`SELECT payload, updated_at FROM read_models WHERE key = ${key}`) as {
    payload: T;
    updated_at: string | Date;
  }[];
  const row = rows[0];
  if (!row) return null;
  const updated = row.updated_at;
  return { payload: row.payload, updatedAt: updated instanceof Date ? updated.toISOString() : String(updated) };
}
