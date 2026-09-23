import { unstable_cache } from "next/cache";
import { database, readModel } from "./db";
import { SORARE_TAG, type Sorare } from "./play";

// Local development and the browser tests have no Neon: they ask the FastAPI stand-in instead.
const API_BASE = process.env.API_BASE_URL ?? "http://127.0.0.1:8000";

/**
 * The Sorare gameweek the job published (`read_models` key `sorare`). Everything on the page — the plans,
 * the chances, the reasons — is computed by the job, so this is one read, cached for an hour under the
 * `sorare` tag and refreshed when a run ends (POST /api/revalidate).
 */
const cachedSorare = unstable_cache(
  async (): Promise<Sorare | null> => {
    if (database()) {
      const row = await readModel<Sorare>(SORARE_TAG);
      return row?.payload ?? null;
    }
    const response = await fetch(`${API_BASE}/api/sorare`, { cache: "no-store", signal: AbortSignal.timeout(8000) });
    if (!response.ok) return null;
    const body = (await response.json()) as { success?: boolean; data?: Sorare };
    return body?.data ?? null;
  },
  ["sorare-v1"],
  { tags: [SORARE_TAG], revalidate: 3600 },
);

/** Null while Sorare has never been synced (no key yet, or the first run hasn't happened). */
export async function loadSorare(): Promise<Sorare | null> {
  try {
    return await cachedSorare();
  } catch (error) {
    console.error(`[sorare] could not be read: ${error instanceof Error ? error.message : "unknown"}`);
    return null;
  }
}
