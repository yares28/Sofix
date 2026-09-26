import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import DifficultyTile from "../components/home/DifficultyTile";
import FixturesTile from "../components/home/FixturesTile";
import HomeHead from "../components/home/HomeHead";
import SorareRow from "../components/home/SorareRow";
import SorareTiles from "../components/home/SorareTiles";
import TableTile from "../components/home/TableTile";
import SiteNav from "../components/SiteNav";
import { loadGrid } from "../lib/api";
import { legacyBoardUrl, openingColumn } from "../lib/grid";
import { boardHref, gameweekHead } from "../lib/home";
import { loadChances } from "../lib/homeData";
import { loadSorare } from "../lib/playData";
import { weekContext } from "../lib/weeks";
import { loadSystem } from "../lib/system";

export const metadata: Metadata = { title: "Sofix" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/**
 * Home: the gameweek (the week in the top bar, the opening one by default), its hero number, the three board
 * tiles and the Sorare row. Everything comes from the cached grid, so the home costs no extra database reads.
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

  const [{ grid, meta, error }, system, chances, sorare] = await Promise.all([
    loadGrid(),
    loadSystem(),
    loadChances(),
    loadSorare(),
  ]);
  const opening = grid ? openingColumn(grid) : 0;
  const week = weekContext(grid, sorare, new Date(), {
    w: params.get("w"),
    md: Number(params.get("gw")) || (grid?.matchdays[opening]?.number ?? null),
  });
  if (!grid) {
    return (
      <>
        <SiteNav meta={meta} system={system} week={week} />
        <main>
          <section className="card empty-state" role="status">
            <h1>Sofix</h1>
            <p>{error}</p>
          </section>
        </main>
      </>
    );
  }

  if (params.has("gw") && !grid.matchdays.some((md) => String(md.number) === params.get("gw"))) {
    redirect("/"); // a gameweek this season doesn't have
  }
  const column = week.current?.column ?? opening; // the week in the bar decides which gameweek the page is about
  const href = (path: string) => boardHref(path, grid, column, opening);

  return (
    <>
      <SiteNav meta={meta} system={system} week={week} />
      <main className="hm">
        <HomeHead head={gameweekHead(grid, column, new Date())} />
        <div className="hm-bento">
          <FixturesTile grid={grid} column={column} href={href("/fixtures")} />
          <DifficultyTile grid={grid} column={column} href={href("/difficulty")} />
          <TableTile grid={grid} column={column} chances={chances} href={href("/table")} />
          {sorare ? <SorareTiles data={sorare} now={new Date()} /> : <SorareRow />}
        </div>
      </main>
    </>
  );
}
