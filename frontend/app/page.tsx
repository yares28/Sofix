import FixtureBoard from "../components/FixtureBoard";
import UpdatedAt from "../components/UpdatedAt";
import type { ApiResponse, FixtureGrid, GridMeta } from "../lib/types";

// Server-only: this page fetches on the server, so the API address never needs to reach the browser.
const API_BASE = process.env.API_BASE_URL ?? "http://127.0.0.1:8000";

type Loaded = { grid: FixtureGrid; meta: GridMeta | null; error: null } | { grid: null; meta: null; error: string };

async function loadGrid(): Promise<Loaded> {
  try {
    const response = await fetch(`${API_BASE}/api/fixture-grid`, { cache: "no-store", signal: AbortSignal.timeout(8000) });
    if (!response.ok) return { grid: null, meta: null, error: "Fixture data is temporarily unavailable." };
    const body = (await response.json()) as ApiResponse<FixtureGrid>;
    if (!body.success || !body.data) return { grid: null, meta: null, error: body.error ?? "No fixture data yet." };
    return { grid: body.data, meta: body.meta ?? null, error: null };
  } catch {
    return { grid: null, meta: null, error: "Fixture data is temporarily unavailable." };
  }
}

export default async function Home() {
  const { grid, meta, error } = await loadGrid();

  return (
    <>
      <nav className="nav">
        <div className="nav-inner">
          <div className="brand">
            <div className="brand-mark" />
            FixtureDiff
          </div>
          {meta?.last_predicted_at && (
            <div className="nav-meta">
              Updated <UpdatedAt iso={meta.last_predicted_at} />
            </div>
          )}
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
