import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import AwayWeek from "../components/AwayWeek";
import DifficultyTile from "../components/home/DifficultyTile";
import FixturesTile from "../components/home/FixturesTile";
import HomeHead from "../components/home/HomeHead";
import SorareRow from "../components/home/SorareRow";
import SorareTiles from "../components/home/SorareTiles";
import TableTile from "../components/home/TableTile";
import SiteNav from "../components/SiteNav";
import { loadGrid } from "../lib/api";
import { legacyBoardUrl, openingColumn } from "../lib/grid";
import { boardHref, castForWeek, gameweekHead } from "../lib/home";
import { lineupsGlance } from "../lib/lineups";
import { loadLineups } from "../lib/lineupsData";
import { loadChances } from "../lib/homeData";
import { weekPlan } from "../lib/play";
import { loadSorare } from "../lib/playData";
import { weekContext, weekDates } from "../lib/weeks";
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

  const [{ grid, meta, error }, system, chances, sorare, lineups] = await Promise.all([
    loadGrid(),
    loadSystem(),
    loadChances(),
    loadSorare(),
    loadLineups(),
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
  // A Sorare-only week must not silently show the next LaLiga round underneath it. An explicitly selected one
  // gets the same honest "LaLiga is away" treatment as the board pages.
  const away = params.has("w") && week.current?.column === null ? week.current : null;
  const column = week.current?.column ?? opening;
  const href = (path: string) => boardHref(path, grid, column, opening);
  const awayPlan = away && sorare && away.gw ? weekPlan(sorare, away.gw) : null;
  const selectedSorare =
    sorare && week.current?.gw
      ? (sorare.timeline.find((item) => item.id === week.current?.gw) ?? weekPlan(sorare, week.current.gw)?.gameweek ?? null)
      : null;

  return (
    <>
      <SiteNav meta={meta} system={system} week={week} />
      <main className="hm">
        {away ? (
          <AwayWeek plan={awayPlan} variant="fixtures" dates={weekDates(away)} />
        ) : (
          <HomeHead head={gameweekHead(grid, column, new Date())} cast={castForWeek(sorare, week.current?.gw ?? null, grid)} />
        )}
        <div className={`hm-bento${away ? " hm-away" : ""}`}>
          {!away ? (
            <>
              <FixturesTile grid={grid} column={column} href={href("/fixtures")} />
              <DifficultyTile grid={grid} column={column} href={href("/difficulty")} />
              <TableTile grid={grid} column={column} chances={chances} href={href("/table")} />
            </>
          ) : null}
          {sorare ? <SorareTiles data={sorare} selected={selectedSorare} now={new Date()} glance={lineupsGlance(lineups, new Date())} /> : <SorareRow />}
        </div>
      </main>
    </>
  );
}
