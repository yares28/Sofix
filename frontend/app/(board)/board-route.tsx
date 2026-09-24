import { connection } from "next/server";
import FixtureBoard from "../../components/FixtureBoard";
import SiteNav from "../../components/SiteNav";
import { loadGrid } from "../../lib/api";
import { loadSorare } from "../../lib/playData";
import { weekPlan } from "../../lib/play";
import { weekContext, weekDates } from "../../lib/weeks";
import { loadSystem } from "../../lib/system";
import { DEFAULT_VIEW, openingColumn, parseViewState, type View } from "../../lib/grid";

export type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const TITLES: Record<View, string> = { plain: "Fixtures", fdr: "Fixtures & Difficulty", table: "Table" };

/**
 * The board, shared by /fixtures, /difficulty and /table: the route picks the tab, the query string the rest.
 * Switching tabs in the page doesn't navigate: the board rewrites the path itself (hooks/useViewState.ts).
 */
export async function BoardRoute({ view, searchParams }: { view: View; searchParams: SearchParams }) {
  await connection(); // render per request (from the cache), never prerender at build time when the API may be down
  const [{ grid, meta, error }, rawParams, system, sorare] = await Promise.all([
    loadGrid(),
    searchParams,
    loadSystem(),
    loadSorare(),
  ]);

  // View state from the URL is applied on the server, so a shared link renders the right view with no flash.
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(rawParams)) {
    if (typeof value === "string") params.set(key, value);
  }
  // One week drives the whole app: the board opens on the LaLiga round inside it, and an older ?gw= link
  // still decides which week that is. A week with no round at all stays itself — the board then shows the
  // games the owner's own players play, because there is no LaLiga to show.
  const opening = grid ? (grid.matchdays[openingColumn(grid)]?.number ?? null) : null;
  const week = weekContext(grid, sorare, new Date(), { w: params.get("w"), md: Number(params.get("gw")) || opening });
  const away = week.current && week.current.md === null ? week.current : null;
  // Only a week that was asked for pins the board: left alone it stays on its own opening gameweek, where the
  // table still projects the whole season (lib/grid.ts, `state.gw === null`).
  if (params.has("w") && week.current?.md) params.set("gw", String(week.current.md));

  const initialView = grid
    ? { ...DEFAULT_VIEW, ...parseViewState(params, new Set(grid.teams.map((team) => team.code))), view }
    : { ...DEFAULT_VIEW, view };

  return (
    <>
      <SiteNav meta={meta} system={system} week={week} />
      <main>
        {grid ? (
          <FixtureBoard
            grid={grid}
            notes={meta?.model_notes ?? []}
            initialView={initialView}
            pinsInUrl={params.has("pins")}
            away={away ? { plan: (sorare && away.gw && weekPlan(sorare, away.gw)) || null, dates: weekDates(away) } : null}
          />
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
