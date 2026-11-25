import type { Metadata } from "next";
import { connection } from "next/server";
import ProView from "../../components/pro/ProView";
import SiteNav from "../../components/SiteNav";
import { loadGrid } from "../../lib/api";
import { loadProWeek } from "../../lib/proWeekData";
import { loadSystem } from "../../lib/system";

export const metadata: Metadata = { title: "Pro · Sofix" };

/** Pro: each Pro board's week, its lineups by batch or best five, the step chain and hold or play (plans/pro-page.md). */
export default async function ProPage() {
  await connection(); // per request, like the other pages: a build-time render has no data to read
  const [block, system, { meta }] = await Promise.all([loadProWeek(), loadSystem(), loadGrid()]);
  return (
    <>
      <SiteNav meta={meta} system={system} />
      <ProView data={block} />
    </>
  );
}
