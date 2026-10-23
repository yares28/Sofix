import { loadForeignPlayer } from "../../../lib/foreignPlayersData";
import { foreignMarket } from "../../../lib/foreignPlayers";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import PlayerView from "../../../components/players/PlayerView";
import SiteNav from "../../../components/SiteNav";
import { loadGrid } from "../../../lib/api";
import type { GameweekPlan } from "../../../lib/play";
import { loadPlayerForecasts, loadProjectedWeek, loadSorare } from "../../../lib/playData";
import { identityOf, nextGameIn, planPlayer, type NextGame } from "../../../lib/playerPage";
import { strips } from "../../../lib/playerSheet";
import { loadPlayerGames, loadPlayerSheets } from "../../../lib/playerGames";
import { loadSystem } from "../../../lib/system";
import { weekContext } from "../../../lib/weeks";

type Params = Promise<{ slug: string }>;
type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const SLUG = /^[a-z0-9][a-z0-9-]{0,80}$/;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { slug } = await params;
  return { title: `${slug.split("-").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ")} · Sofix` }; // "Mathew Ryan · Sofix"
}

/**
 * One player: his game this week (the picture of it, as the panel on Sorare draws it), how he compares with the others of his position, his stat sheet, his
 * last ten starts and, for a player of yours, his next games. History and absences come from kept rows; stat sheets are published daily from their stats.
 */
export default async function PlayerPage({ params, searchParams }: { params: Params; searchParams: SearchParams }) {
  const { slug } = await params;
  if (!SLUG.test(slug)) notFound();
  const query = await searchParams;
  const single = (key: string) => (typeof query[key] === "string" ? (query[key] as string) : undefined);
  const foreignRead = loadForeignPlayer(slug);
  const [sheets, history, data, { grid, meta }, system, foreign] = await Promise.all([loadPlayerSheets(), loadPlayerGames(slug), foreignRead.then(block => loadSorare({ market: !block })), loadGrid(), loadSystem(), foreignRead]);
  const sheet = sheets.players[slug] ?? null;
  const week = weekContext(grid, data, new Date(), { w: single("w"), gw: single("gw") });
  const forecasts = data && week.current?.gw ? await loadPlayerForecasts(data, week.current.gw) : null;
  const planned = forecasts?.plan?.playing.players.find(p => p.player === slug) ?? (data ? planPlayer(data, slug, week.current?.gw ?? data.nextId) : null);
  const indexed = foreign && data ? foreignMarket(foreign, data, week.current?.gw ?? data.nextId, forecasts?.plan ?? null, forecasts?.record ?? null) : forecasts?.market ?? data?.market;
  const market = indexed?.find((p) => p.slug === slug) ?? null;
  const owned = data?.collection?.find(p => p.player === slug) ?? null;
  if (!sheet && !planned && !market && !owned && !history?.games.length && !history?.absences.length) notFound();

  // His next games: the weeks the job planned that are not played, then the early plans of the rounds Sorare has not opened, up to five.
  const upcoming: GameweekPlan[] = (data?.weeks ?? []).filter((w) => !w.played && Number(w.gameweek.id) >= Number(data?.nextId));
  const rounds = (data?.projected ?? []).slice(0, Math.max(0, 5 - upcoming.length));
  const early = await Promise.all(rounds.map((r) => loadProjectedWeek(r.round)));
  const next: NextGame[] = [...upcoming, ...early.filter((w): w is GameweekPlan => !!w)]
    .map((w) => nextGameIn(w, slug))
    .filter((g): g is NextGame => !!g)
    .slice(0, 5);

  const identity = identityOf(slug, planned, market);
  if (!planned && !market && owned) Object.assign(identity, { name: owned.name, pos: owned.pos, club: owned.club, pic: owned.pic });
  return (
    <>
      <SiteNav meta={meta} system={system} week={week} />
      <main className="s5-main pd">
        {foreign?.competition === "CONF" && <p role="note">Conference FDR and xScore are provisional. The extra benefit of opponent information remains uncertain.</p>}
        <PlayerView
          slug={slug}
          identity={{ ...identity, pos: identity.pos ?? sheet?.pos ?? null }}
          planned={planned}
          sheet={sheet}
          asOf={sheets.asOf}
          strips={sheet ? strips(sheets, slug) : []}
          next={next}
          league={market}
          history={history}
          now={new Date().toISOString()}
        />
      </main>
    </>
  );
}
