import { unstable_cache } from "next/cache";
import { database, readModel } from "./db";
import { SORARE_TAG, type GameweekPlan, type Sorare, type SorarePlans } from "./play";

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

/**
 * The early plan the job made for a LaLiga round Sorare has not opened (`read_models` key `sorare_ahead:<round>`), or null
 * when there is none. It is rewritten every run, so it is cached for as long as the page is and dropped with it.
 */
export async function loadProjectedWeek(round: number): Promise<GameweekPlan | null> {
  if (!Number.isInteger(round) || round < 1 || round > 60) return null;
  const read = unstable_cache(
    async (): Promise<GameweekPlan | null> => {
      if (database()) {
        const row = await readModel<GameweekPlan>(`sorare_ahead:${round}`);
        return row?.payload ?? null;
      }
      const response = await fetch(`${API_BASE}/api/sorare/ahead/${round}`, { cache: "no-store", signal: AbortSignal.timeout(8000) });
      if (!response.ok) return null;
      const body = (await response.json()) as { success?: boolean; data?: GameweekPlan };
      return body?.success ? (body.data ?? null) : null;
    },
    ["sorare-ahead-v1", String(round)],
    { tags: [SORARE_TAG], revalidate: 3600 },
  );
  try {
    return await read();
  } catch (error) {
    console.error(`[sorare] early plan for round ${round} could not be read: ${error instanceof Error ? error.message : "unknown"}`);
    return null;
  }
}

/** A slug from Sorare's own list ("football-25-29-sep-2026"): nothing else is a key the job wrote a week under. */
const WEEK_SLUG = /^[a-z0-9][a-z0-9-]{0,80}$/;

/**
 * One finished gameweek the job kept whole (`read_models` key `sorare_week:<slug>`), or null when it did not keep
 * that one. Weeks before the job started keeping them are not here; the page says so and shows what Sorare holds.
 * A finished week never changes, so this is the same read as the page's, cached under the same tag.
 */
export async function loadSorareWeek(slug: string): Promise<GameweekPlan | null> {
  if (!WEEK_SLUG.test(slug)) return null;
  const read = unstable_cache(
    async (): Promise<GameweekPlan | null> => {
      if (database()) {
        const row = await readModel<GameweekPlan>(`sorare_week:${slug}`);
        return row?.payload ?? null;
      }
      const response = await fetch(`${API_BASE}/api/sorare/week/${slug}`, { cache: "no-store", signal: AbortSignal.timeout(8000) });
      if (!response.ok) return null;
      const body = (await response.json()) as { success?: boolean; data?: GameweekPlan };
      return body?.success ? (body.data ?? null) : null;
    },
    ["sorare-week-v1", slug],
    { tags: [SORARE_TAG], revalidate: 3600 },
  );
  try {
    return await read();
  } catch (error) {
    console.error(`[sorare] week ${slug} could not be read: ${error instanceof Error ? error.message : "unknown"}`);
    return null;
  }
}

/**
 * The week being planned again on Sorare's own projections (`read_models` key `sorare_alt:<slug>`), or null when the job has not
 * written one. Rewritten every run until the lock, so cached as long as the page is and dropped with it.
 */
export async function loadSorareAlt(slug: string): Promise<SorarePlans | null> {
  if (!WEEK_SLUG.test(slug)) return null;
  const read = unstable_cache(
    async (): Promise<SorarePlans | null> => {
      if (database()) {
        const row = await readModel<SorarePlans>(`sorare_alt:${slug}`);
        return row?.payload ?? null;
      }
      const response = await fetch(`${API_BASE}/api/sorare/alt/${slug}`, { cache: "no-store", signal: AbortSignal.timeout(8000) });
      if (!response.ok) return null;
      const body = (await response.json()) as { success?: boolean; data?: SorarePlans };
      return body?.success ? (body.data ?? null) : null;
    },
    ["sorare-alt-v1", slug],
    { tags: [SORARE_TAG], revalidate: 3600 },
  );
  try {
    const alt = await read();
    // a cached entry from before a field existed must not break the page (next-cache-survives-deploys)
    return alt && Array.isArray(alt.plans) ? alt : null;
  } catch (error) {
    console.error(`[sorare] Sorare plans for ${slug} could not be read: ${error instanceof Error ? error.message : "unknown"}`);
    return null;
  }
}
