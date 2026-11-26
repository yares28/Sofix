import type { Metadata } from "next";
import { connection } from "next/server";
import ProView from "../../components/pro/ProView";
import SiteNav from "../../components/SiteNav";
import { loadGrid } from "../../lib/api";
import { loadSorare } from "../../lib/playData";
import { loadProWeek } from "../../lib/proWeekData";
import { loadSystem } from "../../lib/system";
import { pageWeeks, sorareName, weekContext } from "../../lib/weeks";

export const metadata: Metadata = { title: "Pro · Sofix" };

/** Pro: the week in the bar, each Pro board's lineups by batch or best five, the step chain and hold or play (plans/pro-page.md). */
export default async function ProPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await connection(); // per request, like the other pages: a build-time render has no data to read
  const params = await searchParams;
  const [block, system, { grid, meta }, sorare] = await Promise.all([loadProWeek(), loadSystem(), loadGrid(), loadSorare({ market: false })]);
  const week = weekContext(grid, sorare, new Date(), { w: typeof params.w === "string" ? params.w : null });
  const asked = week.current;
  return (
    <>
      <SiteNav meta={meta} system={system} week={{ ...week, weeks: pageWeeks(week.weeks, "play") }} />
      <ProView key={asked?.id ?? "none"} data={block} gw={asked?.gw ?? null} name={asked ? sorareName(asked) : null} state={asked?.state ?? null} />
    </>
  );
}
