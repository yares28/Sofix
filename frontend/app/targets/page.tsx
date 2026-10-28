import type { Metadata } from "next";
import { connection } from "next/server";
import SiteNav from "../../components/SiteNav";
import TargetsView from "../../components/targets/TargetsView";
import { loadGrid } from "../../lib/api";
import { loadRewardBars } from "../../lib/rewardBarsData";
import { loadSystem } from "../../lib/system";

export const metadata: Metadata = { title: "Targets · Sofix" };

/** Targets: the score each Sorare competition took to be paid anything, averaged over the season's finished gameweeks. */
export default async function TargetsPage() {
  await connection(); // per request, like the other pages: a build-time render has no data to read
  const [bars, system, { meta }] = await Promise.all([loadRewardBars(), loadSystem(), loadGrid()]);
  return (
    <>
      <SiteNav meta={meta} system={system} />
      <TargetsView data={bars} />
    </>
  );
}
