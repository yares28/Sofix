import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import DifficultyTile from "../components/home/DifficultyTile";
import FixturesTile from "../components/home/FixturesTile";
import GameweekTimeline from "../components/home/GameweekTimeline";
import HomeHead from "../components/home/HomeHead";
import SorareRow from "../components/home/SorareRow";
import TableTile from "../components/home/TableTile";
import SiteNav from "../components/SiteNav";
import { loadGrid } from "../lib/api";
import { legacyBoardUrl, openingColumn } from "../lib/grid";
import { boardHref, gameweekHead, timelineEntries } from "../lib/home";
import { loadChances } from "../lib/homeData";
import { loadSystem } from "../lib/system";

export const metadata: Metadata = { title: "Sofix" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/**
 * Home: the gameweek (?gw=, the opening one by default), its hero number, the timeline, the three board tiles and
 * the Sorare row. Everything comes from the cached grid, so the home costs no extra database reads.
 * Design: docs/sorare/design/S2-home.html.
 */
export default async function Home({ searchParams }: { searchParams: SearchParams }) {
  await connection(); // per request (from the cache): the countdown reads the clock
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(await searchParams)) {
    if (typeof value === "string") params.set(key, value);
  }
  // Links from when the board lived here (/?view=table, /?h=next, …) open the board page they meant.
  const legacy = legacyBoardUrl(params);
  if (legacy) redirect(legacy);

  const [{ grid, meta, error }, system, chances] = await Promise.all([loadGrid(), loadSystem(), loadChances()]);
  if (!grid) {
    return (
      <>
        <SiteNav meta={meta} system={system} />
        <main>
          <section className="card empty-state" role="status">
            <h1>Sofix</h1>
            <p>{error}</p>
          </section>
        </main>
      </>
    );
  }

  const opening = openingColumn(grid);
  const requested = params.has("gw") ? grid.matchdays.findIndex((md) => String(md.number) === params.get("gw")) : opening;
  if (requested < 0) redirect("/"); // a gameweek this season doesn't have
  const column = requested;
  const href = (path: string) => boardHref(path, grid, column, opening);

  return (
    <>
      <SiteNav meta={meta} system={system} />
      <main className="hm">
        <HomeHead head={gameweekHead(grid, column, new Date())} />
        <GameweekTimeline entries={timelineEntries(grid, opening)} column={column} opening={opening} />
        <div className="hm-bento">
          <FixturesTile grid={grid} column={column} href={href("/fixtures")} />
          <DifficultyTile grid={grid} column={column} href={href("/difficulty")} />
          <TableTile grid={grid} column={column} chances={chances} href={href("/table")} />
          <SorareRow />
        </div>
      </main>
    </>
  );
}
