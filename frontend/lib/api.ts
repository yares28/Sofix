import { unstable_cache } from "next/cache";
import { GRID_TAG } from "./refresh";
import type { ApiResponse, FixtureGrid, GridMeta } from "./types";

// Server-only: pages fetch on the server, so the API address never needs to reach the browser.
const API_BASE = process.env.API_BASE_URL ?? "http://127.0.0.1:8000";
export const UNAVAILABLE = "Fixture data is temporarily unavailable.";

export type Loaded = { grid: FixtureGrid; meta: GridMeta | null; error: null } | { grid: null; meta: null; error: string };

class GridUnavailable extends Error {}

/**
 * The grid only changes when a refresh runs, and every API call wakes Neon (free tier: 100 CU-hours/month).
 * Cached for an hour under the fixture-grid tag; the refresh route revalidates it as soon as a run finishes.
 * Failures throw, so they are never cached. Shared by every page, so browsing between them costs nothing.
 */
const cachedGrid = unstable_cache(
  async (): Promise<{ grid: FixtureGrid; meta: GridMeta | null }> => {
    const response = await fetch(`${API_BASE}/api/fixture-grid`, { cache: "no-store", signal: AbortSignal.timeout(8000) });
    if (!response.ok) throw new GridUnavailable(UNAVAILABLE);
    const body = (await response.json()) as ApiResponse<FixtureGrid>;
    if (!body.success || !body.data) throw new GridUnavailable(body.error ?? "No fixture data yet.");
    return { grid: body.data, meta: body.meta ?? null };
  },
  ["fixture-grid"],
  { tags: [GRID_TAG], revalidate: 3600 },
);

export async function loadGrid(): Promise<Loaded> {
  try {
    const { grid, meta } = await cachedGrid();
    return { grid, meta, error: null };
  } catch (error) {
    return { grid: null, meta: null, error: error instanceof GridUnavailable ? error.message : UNAVAILABLE };
  }
}
