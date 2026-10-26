import type { Metadata } from "next";
import StatsView from "../../components/cards/StatsView";
import SiteNav from "../../components/SiteNav";
import StatCharts from "../../components/stats/StatCharts";
import { loadGrid } from "../../lib/api";
import { loadSorare } from "../../lib/playData";
import { loadPlayerSheets } from "../../lib/playerGames";
import { statPlayers } from "../../lib/statLeaders";
import { loadSystem } from "../../lib/system";
import { weekContext } from "../../lib/weeks";

export const metadata: Metadata = { title: "Stats · Sofix" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/** Stat leaders: the LaLiga players who do the most of one action per start, from the daily stat sheets (backend/app/sorare/sheets.py). */
export default async function Stats({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const single = (key: string) => {
    const value = params[key];
    return typeof value === "string" ? value : undefined;
  };
  const [data, { grid, meta }, system, sheets] = await Promise.all([loadSorare(), loadGrid(), loadSystem(), loadPlayerSheets()]);
  const week = weekContext(grid, data, new Date(), { w: single("w"), gw: single("gw") });
  const players = statPlayers(sheets, data?.market ?? [], data?.collection ?? []);

  return (
    <>
      <SiteNav meta={meta} system={system} week={week} />
      <main className="s5-main">
        {players.length ? (
          <StatsView players={players} initial={{ stat: single("stat"), min: single("min"), pos: single("pos") }} />
        ) : (
          <section className="s5-empty" role="status">
            <h1>Stat leaders</h1>
            <p>The stat sheets appear after the next refresh saves LaLiga starts.</p>
          </section>
        )}
        <StatCharts initial={{ chart: single("chart"), window: single("cw") }} />
      </main>
    </>
  );
}
