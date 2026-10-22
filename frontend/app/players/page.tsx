import CompetitionPicker from "../../components/CompetitionPicker";
import { competitionOf, COMPETITIONS } from "../../lib/competitions";
import { loadLeaguePlayers } from "../../lib/foreignPlayersData";
import { foreignMarket } from "../../lib/foreignPlayers";
import type { Metadata } from "next";
import PlayersView from "../../components/cards/PlayersView";
import SiteNav from "../../components/SiteNav";
import { loadGrid } from "../../lib/api";
import { loadPlayerForecasts, loadSorare } from "../../lib/playData";
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
  const competition = competitionOf(single("league"));
  const [data, { grid, meta }, system, foreign] = await Promise.all([loadSorare({ market: competition === "PD" }), loadGrid(), loadSystem(), competition === "PD" ? null : loadLeaguePlayers(competition)]);
  const week = weekContext(grid, data, new Date(), { w: single("w"), gw: single("gw") });
  const forecasts = data && week.current?.gw ? await loadPlayerForecasts(data, week.current.gw) : null;
  const market = data && competition !== "PD" ? foreignMarket(foreign, data, week.current?.gw ?? data.nextId, forecasts?.plan ?? null, forecasts?.record ?? null) : forecasts?.market ?? data?.market ?? [];
  const ready = data && market.length > 0;

  return (
    <>
      <SiteNav meta={meta} system={system} week={week} />
      <main className="s5-main">
        <CompetitionPicker competition={competition} week={week.current?.id} />
        {ready ? (
          <PlayersView data={{ ...data, market }} leagueLabel={COMPETITIONS[competition]} now={new Date().toISOString()} weekId={week.current?.id} forecastWeek={week.current?.gw ?? undefined} />
        ) : (
          <section className="s5-empty" role="status">
            <h1>Player search</h1>
            <p>The {COMPETITIONS[competition]} player index is not available yet. Only validated models are published.</p>
          </section>
        )}
      </main>
    </>
  );
}
