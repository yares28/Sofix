import { neon, type NeonQueryFunction } from "@neondatabase/serverless";
import { unstable_cache } from "next/cache";
import { isDatabasePaused } from "./control";
import { GRID_TAG } from "./refresh";

/**
 * Server-only access to Neon over HTTP (no pool, no socket: fine for serverless functions).
 * Production reads the pages the jobs published into `read_models`; local development without
 * DATABASE_URL falls back to the FastAPI server (see lib/api.ts).
 *
 * Two free Neon projects take turns (DATABASE_URL and DATABASE_URL_SPARE: Sofix and FDR). The live one is the one whose
 * `read_models` was written last, the rule the jobs use too (backend/app/jobs/neon_switch.py, which moves the data across
 * when the live one nears its monthly limit). A query refused for quota goes to the other project straight away.
 */
type Sql = (strings: TemplateStringsArray, ...values: unknown[]) => Promise<Record<string, unknown>[]>;

type Client = NeonQueryFunction<false, false>;
let clients: Client[] | null = null;
let refused: number | null = null; // a project that answered "exceeded the quota" in this server instance

const projects = (): Client[] =>
  (clients ??= [process.env.DATABASE_URL, process.env.DATABASE_URL_SPARE].filter((u): u is string => !!u).map((u) => neon(u)));
/** Project `i`, or the first one: database() only hands out `live` when DATABASE_URL is set. */
const project = (i: number): Client => projects()[i] ?? projects()[0] ?? neon(process.env.DATABASE_URL ?? "");

/** Index of the project written last. Re-checked hourly and whenever a job's run ends (its revalidate call). */
const liveIndex = unstable_cache(
  async (): Promise<number> => {
    if (projects().length < 2) return 0;
    const lastWrite = (sql: Client) =>
      sql`SELECT max(updated_at) AS at FROM read_models`.then(
        (rows) => (rows[0]?.at ? Date.parse(String(rows[0].at)) : 0),
        () => -1,
      );
    const [a, b] = await Promise.all([lastWrite(project(0)), lastWrite(project(1))]);
    return b > a ? 1 : 0;
  },
  ["neon-live-v1"],
  { tags: [GRID_TAG], revalidate: 3600 },
);

const live: Sql = async (strings, ...values) => {
  const two = projects().length > 1;
  const i = refused !== null && two ? 1 - refused : await liveIndex();
  try {
    return await project(i)(strings, ...values);
  } catch (error) {
    if (!two || !(error instanceof Error) || !isDatabasePaused(error.message)) throw error;
    refused = i;
    return project(1 - i)(strings, ...values);
  }
};

export function database(): Sql | null {
  return process.env.DATABASE_URL ? live : null;
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
