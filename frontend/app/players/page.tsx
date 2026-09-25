import type { Metadata } from "next";
import PlayersView from "../../components/cards/PlayersView";
import SorareSubnav from "../../components/cards/SorareSubnav";
import SiteNav from "../../components/SiteNav";
import { loadGrid } from "../../lib/api";
import { loadSorare } from "../../lib/playData";
import { loadSystem } from "../../lib/system";
import { weekContext } from "../../lib/weeks";

export const metadata: Metadata = { title: "Players · Sofix" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/**
 * Player search (S5): the LaLiga players Sorare is pricing now, led by who would actually improve the squad
 * against the fifth-best card already held in each position. The index comes from the job; this page draws it.
 */
export default async function Players({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const single = (key: string) => {
    const value = params[key];
    return typeof value === "string" ? value : undefined;
  };
  const [data, { grid, meta }, system] = await Promise.all([loadSorare(), loadGrid(), loadSystem()]);
  const week = weekContext(grid, data, new Date(), { w: single("w"), gw: single("gw") });
  const ready = data && (data.market?.length ?? 0) > 0;

  return (
    <>
      <SiteNav meta={meta} system={system} week={week} />
      <main className="s5-main">
        <SorareSubnav />
        {ready ? (
          <PlayersView data={data} />
        ) : (
          <section className="s5-empty" role="status">
            <h1>Player search</h1>
            <p>The LaLiga price index appears after the next refresh syncs Sorare.</p>
          </section>
        )}
      </main>
    </>
  );
}
