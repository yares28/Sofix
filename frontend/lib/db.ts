import { neon, type NeonQueryFunction } from "@neondatabase/serverless";
import { createHash } from "node:crypto";
import { mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { unstable_cache } from "next/cache";
import { isDatabasePaused } from "./control";
import { blockFromR2 } from "./r2";
import { GRID_TAG } from "./refresh";

/**
 * Server-only access to Neon over HTTP (no pool, no socket: fine for serverless functions).
 * Production reads the pages the jobs published into `read_models`; local development without
 * DATABASE_URL falls back to the FastAPI server (see lib/api.ts).
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
  if (size > 50_000) console.warn(`[neon] ${SERVER} ${(size / 1e6).toFixed(2)} MB: ${strings.join("?").replace(/\s+/g, " ").slice(0, 70)} [${String(values[0] ?? "").slice(0, 40)}] (this server: ${(servedBytes / 1e6).toFixed(1)} MB)`);
}

export function database(): Sql | null {
  return process.env.DATABASE_URL ? live : null;
}

/**
 * Dev only: a payload read at a given write time, kept on disk. `npm run dev` skips Next's cache whenever the browser sends
 * `Cache-Control: no-cache` (every `fetch(..., { cache: "no-store" })` and every hard reload), and a deleted `.next` or a new
 * NEXT_DIST_DIR starts it empty; on 12-14 Oct 2026 that re-downloaded the same payloads until Sofix's 5 GB ran out. The id
 * holds the write time, so a kept copy is never stale. Copies older than three days are deleted when the server starts.
 */
const DEV_CACHE = path.join(process.cwd(), "node_modules", ".cache", "sofix-neon");
let pruned = false;
export async function keptInDev<T>(id: string, read: () => Promise<T>): Promise<T> {
  if (process.env.NODE_ENV !== "development") return read();
  const file = path.join(DEV_CACHE, `${createHash("sha1").update(id).digest("hex")}.json`);
  try {
    return JSON.parse(await readFile(file, "utf8")) as T;
  } catch {
    // not kept yet
  }
  const value = await read();
  if (value !== null) {
    await mkdir(DEV_CACHE, { recursive: true })
      .then(() => writeFile(file, JSON.stringify(value)))
      .catch(() => undefined);
  }
  if (!pruned) {
    pruned = true;
    void readdir(DEV_CACHE)
      .then((names) =>
        Promise.all(
          names.map(async (name) => {
            const at = path.join(DEV_CACHE, name);
            if (Date.now() - (await stat(at)).mtimeMs > 3 * 86_400_000) await rm(at, { force: true });
          }),
        ),
      )
      .catch(() => undefined);
  }
  return value;
}

export type ReadModelRow<T> = { payload: T; updatedAt: string };

export const stamp = (at: string | Date): string => (at instanceof Date ? at.toISOString() : String(at));

/**
 * One payload as written at `updatedAt`, kept in Next's cache under that time. Neon's free plan counts every byte it sends
 * (5 GB a month, then the database is suspended), so a payload is downloaded once per change: not once per page view, per
 * refresh or per localhost reload. The time is part of the cache key, so this is never stale and is safe under `npm run dev`.
 * Next does not cache an item over 2 MB (about 1.6 MB of JSON): read a bigger payload in pieces, as lib/missionsPool.ts and loadSorare (lib/playData.ts) do.
 */
export const readModelAt = unstable_cache(
  async (key: string, updatedAt: string): Promise<unknown> =>
    keptInDev(`${key}@${updatedAt}`, async () => {
      const fromR2 = await blockFromR2(key, updatedAt); // free to send; Neon only when R2 lacks this version
      if (fromR2 !== undefined) return fromR2;
      const rows = (await database()!`SELECT payload FROM read_models WHERE key = ${key}`) as { payload: unknown }[];
      return rows[0]?.payload ?? null;
    }),
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
