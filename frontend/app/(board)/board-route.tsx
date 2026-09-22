import { connection } from "next/server";
import FixtureBoard from "../../components/FixtureBoard";
import SiteNav from "../../components/SiteNav";
import { loadGrid } from "../../lib/api";
import { loadSystem } from "../../lib/system";
import { DEFAULT_VIEW, parseViewState, type View } from "../../lib/grid";

export type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const TITLES: Record<View, string> = { plain: "Fixtures", fdr: "Fixtures & Difficulty", table: "Table" };

/**
 * The board, shared by /fixtures, /difficulty and /table: the route picks the tab, the query string the rest.
 * Switching tabs in the page doesn't navigate: the board rewrites the path itself (hooks/useViewState.ts).
 */
export async function BoardRoute({ view, searchParams }: { view: View; searchParams: SearchParams }) {
  await connection(); // render per request (from the cache), never prerender at build time when the API may be down
  const [{ grid, meta, error }, rawParams, system] = await Promise.all([loadGrid(), searchParams, loadSystem()]);

  // View state from the URL is applied on the server, so a shared link renders the right view with no flash.
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(rawParams)) {
    if (typeof value === "string") params.set(key, value);
  }
  const initialView = grid
    ? { ...DEFAULT_VIEW, ...parseViewState(params, new Set(grid.teams.map((team) => team.code))), view }
    : { ...DEFAULT_VIEW, view };

  return (
    <>
      <SiteNav meta={meta} system={system} />
      <main>
        {grid ? (
          <FixtureBoard grid={grid} notes={meta?.model_notes ?? []} initialView={initialView} pinsInUrl={params.has("pins")} />
        ) : (
          <section className="card empty-state" role="status">
            <h1>{TITLES[view]}</h1>
            <p>{error}</p>
          </section>
        )}
      </main>
    </>
  );
}
