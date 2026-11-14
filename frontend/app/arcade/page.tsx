import type { Metadata } from "next";
import { connection } from "next/server";
import ArcadeView from "../../components/arcade/ArcadeView";
import SiteNav from "../../components/SiteNav";
import { loadGrid } from "../../lib/api";
import { ARCADE_FDR_DAYS, boardFixtures, type FdrFixture } from "../../lib/arcadeFdr";
import { loadArcadeLaLiga } from "../../lib/arcadeLaLiga";
import { loadSystem } from "../../lib/system";

export const metadata: Metadata = { title: "Arcade · Sofix" };

/** Arcade (plans/set.md): your free common-card board. Your board is read in your browser from your Sorare tab; LaLiga start % is Sofix's. */
export default async function ArcadePage() {
  await connection(); // per request, like the other pages: a build-time render has no data to read
  const [{ grid, meta }, pl, bl, fl, system, cl, el, conf, laliga] = await Promise.all([
    loadGrid(), loadGrid("PL"), loadGrid("BL1"), loadGrid("FL1"), loadSystem(), loadGrid("CL"), loadGrid("EL"), loadGrid("CONF"), loadArcadeLaLiga(),
  ]);
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
