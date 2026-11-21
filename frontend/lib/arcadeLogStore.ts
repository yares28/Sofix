import { mergeLog, LOG_PREFIX, type ArcadeLog, type LogBatch } from "./arcadeLog";
import { database } from "./db";
import { putBlock } from "./r2";

/** Merge one read into the set's block and copy it to R2 for the jobs. Returns how many lineups the block holds. */
export async function saveLog(batch: LogBatch, now = new Date()): Promise<number> {
  const sql = database();
  if (!sql) throw new Error("No database configured.");
  const key = LOG_PREFIX + batch.set;
  const rows = (await sql`SELECT payload FROM read_models WHERE key = ${key}`) as { payload: ArcadeLog | null }[];
  const merged = mergeLog(rows[0]?.payload ?? null, batch, now.getTime());
  const text = JSON.stringify(merged);
  await sql`INSERT INTO read_models (key, payload, updated_at) VALUES (${key}, ${text}::json, ${now.toISOString()})
    ON CONFLICT (key) DO UPDATE SET payload = EXCLUDED.payload, updated_at = EXCLUDED.updated_at`;
  await putBlock(key, merged, now);
  return Object.keys(merged.lineups).length;
}
