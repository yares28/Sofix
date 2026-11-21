import { ArcadeAuditSchema, chanceCheck, mergeLog, LOG_PREFIX, type ArcadeAudit, type ArcadeLog, type ChanceCheck, type LogBatch } from "./arcadeLog";
import { database, published, readModel } from "./db";

const CARDS_PREFIX = "arcade_cards:";
import { putBlock } from "./r2";

/** Merge one read into the set's block and copy it to R2 for the jobs. Returns how many lineups the block holds. */
export async function saveLog(batch: LogBatch, now = new Date()): Promise<number> {
  const sql = database();
  if (!sql) throw new Error("No database configured.");
  const key = LOG_PREFIX + batch.set;
  const rows = (await sql`SELECT payload FROM read_models WHERE key = ${key}`) as { payload: ArcadeLog | null }[];
  const merged = mergeLog(rows[0]?.payload ?? null, { ...batch, cards: undefined }, now.getTime());
  const text = JSON.stringify(merged);
  await sql`INSERT INTO read_models (key, payload, updated_at) VALUES (${key}, ${text}::json, ${now.toISOString()})
    ON CONFLICT (key) DO UPDATE SET payload = EXCLUDED.payload, updated_at = EXCLUDED.updated_at`;
  await putBlock(key, merged, now);
  if (batch.cards) {
    // The set's commons for the Arcade audit (step 10): replaced whole, only sent when they changed.
    const cards = { set: batch.set, start: batch.cards.start, end: batch.cards.end, cards: batch.cards.list };
    await sql`INSERT INTO read_models (key, payload, updated_at) VALUES (${CARDS_PREFIX + batch.set}, ${JSON.stringify(cards)}::json, ${now.toISOString()})
      ON CONFLICT (key) DO UPDATE SET payload = EXCLUDED.payload, updated_at = EXCLUDED.updated_at`;
    await putBlock(CARDS_PREFIX + batch.set, cards, now);
  }
  return Object.keys(merged.lineups).length;
}

/** How the chances Sofix printed have fared for a set (lib/arcadeLog.ts chanceCheck), from its block as R2 holds it. */
export async function loadChanceCheck(set: string): Promise<ChanceCheck | null> {
  if (!published()) return null;
  const row = await readModel<ArcadeLog>(LOG_PREFIX + set).catch(() => null);
  return row ? chanceCheck(row.payload) : null;
}

/** The set's hindsight audit as the job published it; null before the job has run with its cards. */
export async function loadArcadeAudit(set: string): Promise<ArcadeAudit | null> {
  if (!published()) return null;
  const row = await readModel<unknown>(`arcade_audit:${set}`).catch(() => null);
  const parsed = ArcadeAuditSchema.safeParse(row?.payload);
  return parsed.success ? parsed.data : null;
}
