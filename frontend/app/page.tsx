import { unstable_cache } from "next/cache";
import { connection } from "next/server";
import FixtureBoard from "../components/FixtureBoard";
import Freshness from "../components/Freshness";
import RefreshButton from "../components/RefreshButton";
import { GRID_TAG } from "../lib/refresh";
import type { ApiResponse, FixtureGrid, GridMeta } from "../lib/types";

// Server-only: this page fetches on the server, so the API address never needs to reach the browser.
const API_BASE = process.env.API_BASE_URL ?? "http://127.0.0.1:8000";
const UNAVAILABLE = "Fixture data is temporarily unavailable.";

type Loaded = { grid: FixtureGrid; meta: GridMeta | null; error: null } | { grid: null; meta: null; error: string };

class GridUnavailable extends Error {}

/**
 * The grid only changes when a refresh runs, and every API call wakes Neon (free tier: 100 CU-hours/month).
 * Cache it for an hour; the refresh route revalidates the tag as soon as a run finishes.
 * Failures throw, so they are never cached.
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

async function loadGrid(): Promise<Loaded> {
  try {
    const { grid, meta } = await cachedGrid();
    return { grid, meta, error: null };
  } catch (error) {
    return { grid: null, meta: null, error: error instanceof GridUnavailable ? error.message : UNAVAILABLE };
  }
}

export default async function Home() {
  await connection(); // render per request (from the cache), never prerender at build time when the API may be down
  const { grid, meta, error } = await loadGrid();
  const refreshEnabled = Boolean(process.env.REFRESH_TOKEN);

  return (
    <>
      <nav className="nav">
        <div className="nav-inner">
          <div className="brand">
            <div className="brand-mark" />
            FixtureDiff
          </div>
          <div className="nav-meta">
            <Freshness syncedAt={meta?.last_synced_at ?? null} predictedAt={meta?.last_predicted_at ?? null} />
            {refreshEnabled && <RefreshButton />}
          </div>
        </div>
      </nav>
      <main>
        {grid ? (
          <FixtureBoard grid={grid} />
        ) : (
          <section className="card empty-state">
            <h1>Fixtures &amp; Difficulty</h1>
            <p>{error}</p>
            <p className="muted">
              Start the API, then load data with <code>python -m app.jobs.refresh</code> in <code>backend/</code>.
            </p>
          </section>
        )}
      </main>
    </>
  );
}
