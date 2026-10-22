import type { Metadata } from "next";
import { connection } from "next/server";
import ArcadeView from "../../components/arcade/ArcadeView";
import SiteNav from "../../components/SiteNav";
import { loadGrid } from "../../lib/api";
import type { ArcadeLaLiga } from "../../lib/arcade";
import { boardFixtures, type FdrFixture } from "../../lib/arcadeFdr";
import { loadLeagueMarket, loadSorare } from "../../lib/playData";
import { loadSystem } from "../../lib/system";

export const metadata: Metadata = { title: "Arcade · Sofix" };

const FDR_DAYS = 8; // the set's days left, at most

/** Arcade (plans/set.md): your free common-card board. Your board is read in your browser from your Sorare tab; LaLiga start % is Sofix's. */
export default async function ArcadePage() {
  await connection(); // per request, like the other pages: a build-time render has no data to read
  const [{ grid, meta }, pl, bl, system, sorare, plPlayers, blPlayers] = await Promise.all([
    loadGrid(), loadGrid("PL"), loadGrid("BL1"), loadSystem(), loadSorare(), loadLeagueMarket("PL"), loadLeagueMarket("BL1"),
  ]);
  // Sofix's start % and xScore for each LaLiga, Premier League and Bundesliga player's next game (cached per write, like Lineups).
  const laliga: ArcadeLaLiga = Object.fromEntries([...(sorare?.market ?? []), ...plPlayers, ...blPlayers].map((p) => [p.slug, {
    kickoff: p.fixture?.kickoff ?? null, p: p.pStart ?? null, source: p.startSource ?? null, sources: p.sources ?? {}, mu: p.mu ?? null,
  }]));
  // The three boards' coming fixtures, both sides rated: a few dozen rows, matched to Arcade's games in the browser.
  const now = Date.now();
  const fdr: FdrFixture[] = ([["PD", grid], ["PL", pl.grid], ["BL1", bl.grid]] as const)
    .flatMap(([league, board]) => (board ? boardFixtures(board, league, now - 3 * 3_600_000, now + FDR_DAYS * 86_400_000) : []));
  return (
    <>
      <SiteNav meta={meta} system={system} />
      <ArcadeView laliga={laliga} fdr={fdr} />
    </>
  );
}
