import type { Metadata } from "next";
import CardsView from "../../components/cards/CardsView";
import SiteNav from "../../components/SiteNav";
import { loadGrid } from "../../lib/api";
import { loadSorare } from "../../lib/playData";
import { loadSystem } from "../../lib/system";
import { weekContext } from "../../lib/weeks";
import { myWeeksQuietly } from "../../lib/myWeeksData";
import { cardReturns, seasonWeeks } from "../../lib/myWeeks";
import { nextGames } from "../../lib/nextGame";
import { BOARD_OF, boardFixtures } from "../../lib/arcadeFdr";
import { galleryDifficulty } from "../../lib/galleryNext";

export const metadata: Metadata = { title: "Gallery · Sofix" };

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
  const [data, { grid, meta }, system, saved] = await Promise.all([loadSorare({ market: false }), loadGrid(), loadSystem(), myWeeksQuietly()]);
  const week = weekContext(grid, data, new Date(), { w: single("w"), gw: single("gw") });
  const ready = data && (data.collection?.length ?? 0) > 0;
  const now = new Date();
  const next = nextGames(data?.weeks ?? [], now);
  const needed = [...new Set([...next.values()].flatMap(n => BOARD_OF[n.game.competition] && BOARD_OF[n.game.competition] !== "PD" ? [BOARD_OF[n.game.competition]!] : []))];
  const other = await Promise.all(needed.map(async league => ({ league, ...(await loadGrid(league)) })));
  const to = Math.max(now.getTime(), ...[...next.values()].map(n => Date.parse(n.kickoff)));
  const fixtures = [{ league: "PD" as const, grid }, ...other].flatMap(({ league, grid }) => grid ? boardFixtures(grid, league, now.getTime(), to) : []);
  const upcoming = Object.fromEntries([...next].map(([key, value]) => [key, galleryDifficulty(value, fixtures)]));

  return (
    <>
      <SiteNav meta={meta} system={system} week={week} />
      <main className="s5-main">
        {ready ? (
          <CardsView data={{ cards: data.cards, collection: data.collection }} upcoming={upcoming} initialPage={Number(single("page") ?? 1) - 1} returns={saved === null ? null : cardReturns(seasonWeeks(saved, now))} />
        ) : (
          <section className="s5-empty" role="status">
            <h1>Gallery</h1>
            <p>Your collection appears after the next refresh syncs Sorare.</p>
          </section>
        )}
      </main>
    </>
  );
}
