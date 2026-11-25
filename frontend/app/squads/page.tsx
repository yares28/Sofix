import type { Metadata } from "next";
import { connection } from "next/server";
import SiteNav from "../../components/SiteNav";
import SquadsView from "../../components/squads/SquadsView";
import { loadGrid } from "../../lib/api";
import { budgetOf, leagueOf, LEAGUES, ranked, seasonOf, targetOf, teamOf } from "../../lib/squads";
import { loadSquads } from "../../lib/squadsData";
import { loadSystem } from "../../lib/system";

export const metadata: Metadata = { title: "Squads · Sofix" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/** Squads: what a club team that plays every week costs, in Pro or the Arena (plans/squad-prices.md). */
export default async function SquadsPage({ searchParams }: { searchParams: SearchParams }) {
  await connection();
  const params = await searchParams;
  const one = (key: string) => (typeof params[key] === "string" ? (params[key] as string) : undefined);
  const code = leagueOf(one("league"));
  const settings = { budget: budgetOf(one("budget")), target: targetOf(one("cover")), mine: one("mine") !== "0" };
  const team = teamOf(one("team"));
  const season = seasonOf(one("season"));
  const wanted = (tiles: { club: string; pair?: { id: string } }[]) =>
    team === "two" ? tiles.find((t) => t.pair?.id === one("pair"))?.club : one("club");
  const [data, system, { meta }] = await Promise.all([
    loadSquads(code, season, team, (tiles) => wanted(tiles) ?? ranked(tiles, settings)[0]?.tile.club),
    loadSystem(),
    loadGrid(),
  ]);
  return (
    <>
      <SiteNav meta={meta} system={system} />
      <main className="sq">
        {data && data.club ? (
          <SquadsView data={data} settings={settings} />
        ) : (
          <section className="sq-empty" role="status">
            <h1>Squads</h1>
            <p>
              {team === "any"
                ? `${LEAGUES.find((l) => l.code === code)?.label}'s best team from any clubs is worked out each night; it appears after the first night's run.`
                : team === "two"
                ? `${LEAGUES.find((l) => l.code === code)?.label}'s pairs of clubs are worked out each night; they appear after the first night's run.`
                : season === "start"
                ? `The start of season picks each team from last season's games, which Sofix keeps for LaLiga only so far.`
                : `${LEAGUES.find((l) => l.code === code)?.label}'s teams appear after the next refresh works them out (once a day).`}
            </p>
            {season === "start" ? <p><a href={`/squads?league=${code}`}>See {LEAGUES.find((l) => l.code === code)?.label} now</a></p> : null}
          </section>
        )}
      </main>
    </>
  );
}
