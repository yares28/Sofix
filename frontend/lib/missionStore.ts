import { database } from "./db";

/** Optimistic per-record merge. A job/import/edit never replaces a concurrent writer's fields. */
export async function mergeMissionRecord<T>(key: string, merge: (before: T | null) => T): Promise<T> {
  const sql = database();
  if (!sql) throw new Error("Mission storage unavailable");
  for (let attempt = 0; attempt < 5; attempt++) {
    const rows = (await sql`SELECT payload FROM read_models WHERE key = ${key}`) as { payload: T }[];
    const before = rows[0]?.payload ?? null;
    const next = merge(before);
    if (JSON.stringify(before) === JSON.stringify(next)) return next;
    const changed = before === null
      ? await sql`INSERT INTO read_models (key, payload, updated_at) VALUES (${key}, ${JSON.stringify(next)}::json, now()) ON CONFLICT (key) DO NOTHING RETURNING key`
      : await sql`UPDATE read_models SET payload = ${JSON.stringify(next)}::json, updated_at = now() WHERE key = ${key} AND payload::jsonb = ${JSON.stringify(before)}::jsonb RETURNING key`;
    if (changed.length) return next;
  }
  throw new Error("Missions changed while saving; retry");
}
