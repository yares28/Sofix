import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import PlayView from "../../components/play/PlayView";
import SiteNav from "../../components/SiteNav";
import { loadGrid } from "../../lib/api";
import { weekPlan } from "../../lib/play";
import { loadSorare } from "../../lib/playData";
import { loadSystem } from "../../lib/system";

export const metadata: Metadata = { title: "Play · Sofix" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/**
 * Play: your whole Sorare gameweek — every competition you can enter, the five best ways to spread your cards
 * across them, and each lineup with its cards, subs and chance of a reward. The gameweek, the plan and
 * "after the games" all live in the address (?gw=, ?plan=, ?after=), so every view can be linked to.
 * The numbers come from the job (backend/app/sorare); this page only draws them.
 */
export default async function Play({ searchParams }: { searchParams: SearchParams }) {
  await connection(); // the countdowns read the clock, so this renders per request from the cached data
  const params = await searchParams;
  const single = (key: string) => {
    const value = params[key];
    return typeof value === "string" ? value : undefined;
  };

  const [data, { meta }, system] = await Promise.all([loadSorare(), loadGrid(), loadSystem()]);
  if (!data) {
    return (
      <>
        <SiteNav meta={meta} system={system} />
        <main className="pl-main">
          <section className="card empty-state" role="status">
            <h1>Play</h1>
            <p>Your Sorare gameweek appears after the next refresh.</p>
          </section>
        </main>
      </>
    );
  }

  const week = weekPlan(data, single("gw") ?? data.nextId);
  if (!week) redirect("/play"); // an old link to a gameweek this page no longer holds
  const requested = Number(single("plan") ?? 1);
  const planIndex = Number.isFinite(requested) ? Math.min(Math.max(requested, 1), Math.max(week.plans.length, 1)) - 1 : 0;
  const after = single("after") === "1" && week.played;

  return (
    <>
      <SiteNav meta={meta} system={system} />
      <PlayView data={data} week={week} planIndex={planIndex} after={after} now={new Date()} />
    </>
  );
}
