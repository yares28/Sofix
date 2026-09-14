import { connection } from "next/server";
import FixtureBoard from "../components/FixtureBoard";
import SiteNav from "../components/SiteNav";
import { loadGrid } from "../lib/api";
import { DEFAULT_VIEW, parseViewState } from "../lib/grid";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function Home({ searchParams }: { searchParams: SearchParams }) {
  await connection(); // render per request (from the cache), never prerender at build time when the API may be down
  const [{ grid, meta, error }, rawParams] = await Promise.all([loadGrid(), searchParams]);

  // View state from the URL is applied on the server, so a shared link renders the right view with no flash.
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(rawParams)) {
    if (typeof value === "string") params.set(key, value);
  }
  const initialView = grid
    ? { ...DEFAULT_VIEW, ...parseViewState(params, new Set(grid.teams.map((team) => team.code))) }
    : DEFAULT_VIEW;

  return (
    <>
      <SiteNav meta={meta} />
      <main>
        {grid ? (
          <FixtureBoard grid={grid} initialView={initialView} pinsInUrl={params.has("pins")} />
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
