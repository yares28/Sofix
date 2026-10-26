import { neon, type NeonQueryFunction } from "@neondatabase/serverless";
import { randomUUID } from "node:crypto";
import { unstable_cache } from "next/cache";
import { isDatabasePaused } from "./control";
import { LEDGER_EVERY_BYTES, LEDGER_EVERY_MS, ledgerLabel, ledgerRow } from "./neonLedger";
import { blockAt, blocksAvailable, blockVersion, type Block } from "./r2";
import { GRID_TAG } from "./refresh";
import { scoreRecordPart } from "./scoreRecordParts";

/**
 * Server-only access to Neon over HTTP (no pool, no socket: fine for serverless functions), for writes. Pages read the
 * blocks the jobs publish from R2 (`readModel` below, lib/r2.ts); with no blocks (the browser tests) they ask the FastAPI
 * stand-in (see lib/api.ts).
 *
 * Free Neon projects take turns (DATABASE_URL, plus DATABASE_URL_SPARE: one or more URLs separated by spaces). The live one
 * is the one whose `read_models` was written last, the rule the jobs use too (backend/app/jobs/neon_switch.py, which moves
 * the data across when the live one nears its monthly limit). A query refused for quota goes to the next project at once.
 */
type Sql = (strings: TemplateStringsArray, ...values: unknown[]) => Promise<Record<string, unknown>[]>;

type Client = NeonQueryFunction<false, false>;
let clients: Client[] | null = null;
const refused = new Set<number>(); // projects that answered "exceeded the quota" in this server instance

const urls = (): string[] => [process.env.DATABASE_URL ?? "", ...(process.env.DATABASE_URL_SPARE ?? "").split(/\s+/)].filter((u) => u);
const projects = (): Client[] => (clients ??= urls().map((u) => neon(u)));

/**
 * Project indexes, written last first. Re-checked hourly and whenever a job's run ends (its revalidate call). Keyed by the
 * projects' hosts, so an order cached for another list of projects is never used for this one.
 */
const liveOrder = unstable_cache(
  async (hosts: string): Promise<number[]> => {
    void hosts;
    const all = projects();
    if (all.length < 2) return [0];
    const stamps = await Promise.all(
      all.map((sql) =>
        sql`SELECT max(updated_at) AS at FROM read_models`.then(
          (rows) => (rows[0]?.at ? Date.parse(String(rows[0].at)) : 0),
          () => -1,
        ),
      ),
    );
    return all.map((_, i) => i).sort((a, b) => (stamps[b] ?? -1) - (stamps[a] ?? -1));
  },
  ["neon-live-v3"],
  { tags: [GRID_TAG], revalidate: 3600 },
);

const live: Sql = async (strings, ...values) => {
  const count = projects().length;
  const cached = (await liveOrder(urls().map((u) => URL.canParse(u) ? new URL(u).host : "?").join(","))).filter((i) => i < count);
  const order = [...cached, ...Array.from({ length: count }, (_, i) => i).filter((i) => !cached.includes(i))];
  const tries = order.filter((i) => !refused.has(i));
  let lastError: unknown = new Error("No database configured.");
  for (const i of tries.length ? tries : order) {
    const sql = projects()[i];
    if (!sql) continue;
    try {
      const rows = await sql(strings, ...values);
      countBytes(strings, values, rows);
      return rows;
    } catch (error) {
      if (!(error instanceof Error) || !isDatabasePaused(error.message)) throw error;
      refused.add(i);
      lastError = error;
    }
  }
  throw lastError;
};

/**
 * Neon's free plan counts every byte sent, so every server (dev, and Vercel's functions: their runtime logs) logs each read
 * over 50 kB, the dev server or Vercel region it came from, and its running total.
 */
let servedBytes = 0;
const SERVER = process.env.NODE_ENV === "development" ? "dev" : `vercel ${process.env.VERCEL_REGION ?? "?"}`;
function countBytes(strings: TemplateStringsArray, values: unknown[], rows: unknown): void {
  const size = JSON.stringify(rows).length;
  servedBytes += size;
  noteForLedger(ledgerLabel(strings.join("?"), values[0]), size);
  if (size > 50_000) console.warn(`[neon] ${SERVER} ${(size / 1e6).toFixed(2)} MB: ${strings.join("?").replace(/\s+/g, " ").slice(0, 70)} [${String(values[0] ?? "").slice(0, 40)}] (this server: ${(servedBytes / 1e6).toFixed(1)} MB)`);
}

/** The ledger (lib/neonLedger.ts): this server's reads by reader, written down every ten minutes or every 1 MB. */
const SERVER_ID = randomUUID().slice(0, 8);
const readers = new Map<string, number>();
let pending = 0;
let lastLedger = Date.now();
let ledgerSeq = 0;
function noteForLedger(label: string, size: number): void {
  if (label === "write") return;
  readers.set(label, (readers.get(label) ?? 0) + size);
  pending += size;
  if (pending < LEDGER_EVERY_BYTES && Date.now() - lastLedger < LEDGER_EVERY_MS) return;
  const { key, payload } = ledgerRow(readers, SERVER_ID, SERVER, ledgerSeq++, new Date());
  readers.clear();
  pending = 0;
  lastLedger = Date.now();
  void live`INSERT INTO read_models (key, payload, updated_at) VALUES (${key}, ${JSON.stringify(payload)}::json, to_timestamp(0))
    ON CONFLICT (key) DO UPDATE SET payload = EXCLUDED.payload`.catch(() => undefined);
}

/**
 * Neon, for the web app's writes (and the few reads a write needs). Pages never read it: they read published blocks
 * (`readModel`). A dev server never reaches it unless started with SOFIX_PRODUCTION=1 (docs: plans/neon-write-mostly.md).
 */
export function database(): Sql | null {
  if (process.env.NODE_ENV === "development" && process.env.SOFIX_PRODUCTION !== "1") return null;
  return process.env.DATABASE_URL ? live : null;
}

export type ReadModelRow<T> = { payload: T; updatedAt: string };

export const stamp = (at: string | Date): string => (at instanceof Date ? at.toISOString() : String(at));

/** Whether pages have published blocks to read (R2, or the local copy under `npm run dev`); else they ask the stand-in API. */
export const published = blocksAvailable;

/**
 * One block as published at `version` (its R2 ETag, lib/r2.ts), kept in Next's cache under that version: downloaded once per
 * change, from R2, never from Neon. Next does not cache an item over 2 MB (about 1.6 MB of JSON): read a bigger payload in
 * pieces, as lib/missionsPool.ts, loadSorare (lib/playData.ts) and score records (`playersPart`) do.
 */
const cachedBlock = unstable_cache(
  async (key: string, version: string): Promise<Block | null> => blockAt(key, version),
  ["block-at-v1"],
  { revalidate: 86400 },
);
const cachedRecordPart = unstable_cache(
  async (key: string, version: string, part: number): Promise<unknown> => {
    if (!key.startsWith("score_record:") || !Number.isInteger(part) || part < -1 || part > 3) throw new Error("Invalid score record part");
    const block = await blockAt(key, version);
    return block ? scoreRecordPart(block.payload, part) : null;
  },
  ["block-record-part-v1"],
  { revalidate: 86400 },
);

export async function readModelAt(key: string, version: string, playersPart?: number): Promise<unknown> {
  if (playersPart !== undefined) return cachedRecordPart(key, version, playersPart);
  return (await cachedBlock(key, version))?.payload ?? null;
}

/** One published block, or null when that key has never been published. Asks R2 (or the local copy) for its version only. */
export async function readModel<T = unknown>(key: string): Promise<ReadModelRow<T> | null> {
  if (!published()) return null;
  const version = await blockVersion(key);
  if (!version) return null;
  const block = await cachedBlock(key, version);
  return block ? { payload: block.payload as T, updatedAt: block.updatedAt } : null;
}
