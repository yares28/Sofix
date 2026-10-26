import { cache } from "./cache";
import { published, readModel, readModelAt } from "./db";
import { blockVersions } from "./r2";
import { DAY_PREFIX, LINEUPS_KEY, readable, type KeptLineups, type LineupMatch, type LineupsData } from "./lineups";
import { SORARE_TAG } from "./play";

// Local development and the browser tests have no Neon: they ask the FastAPI stand-in instead.
const API_BASE = process.env.API_BASE_URL ?? "http://127.0.0.1:8000";

/**
 * Futbol Fantasy's lineups the job published (`read_models` key `lineups`): one read, cached for an hour under the `sorare` tag
 * and refreshed when a run ends (POST /api/revalidate), so each refresh, the half-hourly ones before a lock included, shows up.
 */
const cachedLineups = cache(
  async (): Promise<LineupsData | null> => {
    if (published()) {
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

/** Which of these days were kept and each one's version (one R2 listing). The job that writes them clears the `sorare` tag when it ends. */
const keptIndex = cache(
  async (keys: string[]): Promise<{ key: string; at: string }[]> => {
    const versions = await blockVersions(DAY_PREFIX);
    return keys.flatMap((key) => {
      const at = versions.get(key);
      return at ? [{ key, at }] : [];
    });
  },
  ["lineups-kept-index-v2"],
  { tags: [SORARE_TAG], revalidate: 3600 },
);

/**
 * The matches kept for these days (`lineups_day:<date>`, backend `ff_lineups.kept_days`): what a week shows once the site has dropped
 * its matches. The write times are cached like the lineups; each day's payload is downloaded once per change (`readModelAt`), all
 * days at once. Nothing without a database (local development on the stand-in API, the browser tests).
 */
export async function loadKeptDays(days: string[]): Promise<KeptLineups> {
  const out: KeptLineups = { matches: [], cards: {}, art: {} };
  const keys = [...new Set(days.filter((day) => /^\d{4}-\d{2}-\d{2}$/.test(day)))].map((day) => DAY_PREFIX + day);
  if (!published() || !keys.length) return out;
  try {
    const rows = await keptIndex(keys);
    const read = await Promise.all(rows.map((row) => readModelAt(row.key, row.at)));
    for (const payload of read) {
      // A day's first write holds its played matches under `old` (the merge that folds them in runs from the second write on).
      const day = payload as { matches?: Record<string, LineupMatch>; old?: Record<string, LineupMatch>; cards?: KeptLineups["cards"]; art?: KeptLineups["art"] } | null;
      if (!day) continue;
      out.matches.push(...Object.values({ ...day.old, ...day.matches }));
      Object.assign(out.cards, day.cards);
      Object.assign(out.art, day.art);
    }
  } catch (error) {
    console.error(`[lineups] kept days could not be read: ${error instanceof Error ? error.message : "unknown"}`);
  }
  return out;
}

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
