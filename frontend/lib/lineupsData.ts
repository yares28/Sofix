import { cache } from "./cache";
import { database, readModel } from "./db";
import { LINEUPS_KEY, readable, type LineupsData } from "./lineups";
import { SORARE_TAG } from "./play";

// Local development and the browser tests have no Neon: they ask the FastAPI stand-in instead.
const API_BASE = process.env.API_BASE_URL ?? "http://127.0.0.1:8000";

/**
 * Futbol Fantasy's lineups the job published (`read_models` key `lineups`): one read, cached for an hour under the `sorare` tag
 * and refreshed when a run ends (POST /api/revalidate), so each refresh, the half-hourly ones before a lock included, shows up.
 */
const cachedLineups = cache(
  async (): Promise<LineupsData | null> => {
    if (database()) {
      const row = await readModel(LINEUPS_KEY);
      return readable(row?.payload);
    }
    const response = await fetch(`${API_BASE}/api/lineups`, { cache: "no-store", signal: AbortSignal.timeout(8000) });
    if (!response.ok) return null;
    const body = (await response.json()) as { success?: boolean; data?: unknown };
    return body?.success ? readable(body.data) : null;
  },
  ["lineups-v1"],
  { tags: [SORARE_TAG], revalidate: 3600 },
);

/** Null while the site has never been read (no key yet, or the first run has not happened). */
export async function loadLineups(): Promise<LineupsData | null> {
  try {
    // Read again after the cache: Next keeps an entry across deploys, so one written by an older build lacks the fields this build
    // added. The defaults are applied to it here, never only before it is stored.
    const cached = await cachedLineups();
    return cached ? readable(cached) : null;
  } catch (error) {
    console.error(`[lineups] could not be read: ${error instanceof Error ? error.message : "unknown"}`);
    return null;
  }
}
