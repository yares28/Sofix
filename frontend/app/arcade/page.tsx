import type { Metadata } from "next";
import { connection } from "next/server";
import ArcadeView from "../../components/arcade/ArcadeView";
import SiteNav from "../../components/SiteNav";
import { loadGrid } from "../../lib/api";
import type { ArcadeLaLiga } from "../../lib/arcade";
import { loadSorare } from "../../lib/playData";
import { loadSystem } from "../../lib/system";

export const metadata: Metadata = { title: "Arcade · Sofix" };

/** Arcade (plans/set.md): your free common-card board. Your board is read in your browser from your Sorare tab; LaLiga start % is Sofix's. */
export default async function ArcadePage() {
  await connection(); // per request, like the other pages: a build-time render has no data to read
  const [{ meta }, system, sorare] = await Promise.all([loadGrid(), loadSystem(), loadSorare()]);
  // The start % Lineups uses for each LaLiga player's next game (cached per write of the Sorare model, like Lineups).
  const laliga: ArcadeLaLiga = Object.fromEntries((sorare?.market ?? []).map((p) => [p.slug, {
    kickoff: p.fixture?.kickoff ?? null, p: p.pStart ?? null, source: p.startSource ?? null, sources: p.sources ?? {},
  }]));
  return (
    <>
      <SiteNav meta={meta} system={system} />
      <ArcadeView laliga={laliga} />
    </>
  );
}
