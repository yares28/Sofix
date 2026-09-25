import type { Metadata } from "next";
import CardsView from "../../components/cards/CardsView";
import SorareSubnav from "../../components/cards/SorareSubnav";
import SiteNav from "../../components/SiteNav";
import { loadGrid } from "../../lib/api";
import { loadSorare } from "../../lib/playData";
import { loadSystem } from "../../lib/system";
import { weekContext } from "../../lib/weeks";

export const metadata: Metadata = { title: "My cards · Sofix" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/**
 * My cards (S5): the whole Sorare collection, led by what he can field, then its shape, then the cards by
 * position. The numbers come from the job (backend/app/sorare/publish.py `collection`); this page draws them.
 */
export default async function Cards({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const single = (key: string) => {
    const value = params[key];
    return typeof value === "string" ? value : undefined;
  };
  const [data, { grid, meta }, system] = await Promise.all([loadSorare(), loadGrid(), loadSystem()]);
  const week = weekContext(grid, data, new Date(), { w: single("w"), gw: single("gw") });
  const ready = data && (data.collection?.length ?? 0) > 0;

  return (
    <>
      <SiteNav meta={meta} system={system} week={week} />
      <main className="s5-main">
        <SorareSubnav />
        {ready ? (
          <CardsView data={data} />
        ) : (
          <section className="s5-empty" role="status">
            <h1>My cards</h1>
            <p>Your collection appears after the next refresh syncs Sorare.</p>
          </section>
        )}
      </main>
    </>
  );
}
