import type { Metadata } from "next";
import PricesView from "../../components/cards/PricesView";
import SiteNav from "../../components/SiteNav";
import { loadGrid } from "../../lib/api";
import { loadSorare } from "../../lib/playData";
import { loadSystem } from "../../lib/system";
import { weekContext } from "../../lib/weeks";

export const metadata: Metadata = { title: "Prices · Sofix" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/** Prices: what each card of the gallery cost and what Sorare values it at now (backend/app/sorare/sync.py `card_prices`). */
export default async function Prices({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const single = (key: string) => {
    const value = params[key];
    return typeof value === "string" ? value : undefined;
  };
  const [data, { grid, meta }, system] = await Promise.all([loadSorare(), loadGrid(), loadSystem()]);
  const week = weekContext(grid, data, new Date(), { w: single("w"), gw: single("gw") });
  const collection = data?.collection ?? [];
  const ready = collection.some((card) => typeof card.value === "number");

  return (
    <>
      <SiteNav meta={meta} system={system} week={week} />
      <main className="s5-main">
        {ready ? (
          <PricesView collection={collection} />
        ) : (
          <section className="s5-empty" role="status">
            <h1>Prices</h1>
            <p>What your cards cost and are worth appears after the next refresh reads it from Sorare.</p>
          </section>
        )}
      </main>
    </>
  );
}
