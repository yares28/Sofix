import type { Metadata } from "next";
import { connection } from "next/server";
import ArcadeView from "../../components/arcade/ArcadeView";
import SiteNav from "../../components/SiteNav";
import { loadGrid } from "../../lib/api";
import type { ArcadeLaLiga } from "../../lib/arcade";
import { ARCADE_FDR_DAYS, boardFixtures, type FdrFixture } from "../../lib/arcadeFdr";
import { loadLeagueMarket, loadSorare } from "../../lib/playData";
import { loadSystem } from "../../lib/system";

export const metadata: Metadata = { title: "Arcade · Sofix" };

/** Arcade (plans/set.md): your free common-card board. Your board is read in your browser from your Sorare tab; LaLiga start % is Sofix's. */
export default async function ArcadePage() {
  await connection(); // per request, like the other pages: a build-time render has no data to read
  const [{ grid, meta }, pl, bl, fl, system, sorare, plPlayers, blPlayers, flPlayers, cl, el, clPlayers, elPlayers, conf, confPlayers] = await Promise.all([
    loadGrid(), loadGrid("PL"), loadGrid("BL1"), loadGrid("FL1"), loadSystem(), loadSorare(), loadLeagueMarket("PL"), loadLeagueMarket("BL1"), loadLeagueMarket("FL1"), loadGrid("CL"), loadGrid("EL"), loadLeagueMarket("CL"), loadLeagueMarket("EL"), loadGrid("CONF"), loadLeagueMarket("CONF"),
  ]);
  // Sofix's start % and xScore for each LaLiga, Premier League, Bundesliga and Ligue 1 player's next game (cached per write, like Lineups).
  const laliga: ArcadeLaLiga = Object.fromEntries([...(sorare?.market ?? []), ...plPlayers, ...blPlayers, ...flPlayers, ...clPlayers, ...elPlayers, ...confPlayers].filter((p) => p.fixture?.kickoff).map((p) => [`${p.slug}:${Date.parse(p.fixture!.kickoff!)}`, {
    kickoff: p.fixture?.kickoff ?? null, p: p.pStart ?? null, source: p.startSource ?? null, sources: p.sources ?? {}, ffMatch: p.ffMatch, mu: p.mu ?? null, decisive: p.decisive ?? null, xd: p.xd ?? null,
  }]));
  // The seven boards' coming fixtures to the set's end, both sides rated (about 380 rows), matched to Arcade's games in the browser.
  const now = Date.now();
  const fdr: FdrFixture[] = ([["PD", grid], ["PL", pl.grid], ["BL1", bl.grid], ["FL1", fl.grid], ["CL", cl.grid], ["EL", el.grid], ["CONF", conf.grid]] as const)
    .flatMap(([league, board]) => (board ? boardFixtures(board, league, now - 3 * 3_600_000, now + ARCADE_FDR_DAYS * 86_400_000) : []));
  return (
    <>
      <SiteNav meta={meta} system={system} />
      <ArcadeView laliga={laliga} fdr={fdr} />
    </>
  );
}
