import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import PlayView from "../../components/play/PlayView";
import SiteNav from "../../components/SiteNav";
import { loadGrid } from "../../lib/api";
import { weekPlan } from "../../lib/play";
import { loadSorare } from "../../lib/playData";
import { loadSystem } from "../../lib/system";
import { weekContext } from "../../lib/weeks";

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

  const [data, { grid, meta }, system] = await Promise.all([loadSorare(), loadGrid(), loadSystem()]);
  const week = weekContext(grid, data, new Date(), { w: single("w"), gw: single("gw") });
  if (!data) {
    return (
      <>
        <SiteNav meta={meta} system={system} week={week} />
        <main className="pl-main">
          <section className="card empty-state" role="status">
            <h1>Play</h1>
            <p>Your Sorare gameweek appears after the next refresh.</p>
          </section>
        </main>
      </>
    );
  }

  // The week in the bar decides the gameweek; ?gw= still works for a link made before the week existed, and
  // one naming a gameweek this page no longer holds is dropped rather than silently showing another.
  const legacy = single("gw");
  if (legacy && !weekPlan(data, legacy)) redirect("/play");
  const asked = week.current;
  const showing = weekPlan(data, asked?.gw ?? data.nextId);
  // A week Sorare has not opened, or one the job has not planned: the page says so rather than showing
  // another gameweek under that week's name.
  if (!showing || (asked && !asked.gw)) {
    return (
      <>
        <SiteNav meta={meta} system={system} week={week} />
        <main className="pl-main">
          <section className="card empty-state" role="status">
            <h1>{asked?.md ? `Gameweek ${asked.md}` : "Play"}</h1>
            <p>
              {asked && !asked.gw
                ? "Sorare hasn't opened this week. It opens about a week before the games."
                : "Your Sorare gameweek appears after the next refresh."}
            </p>
          </section>
        </main>
      </>
    );
  }
  const requested = Number(single("plan") ?? 1);
  const planIndex = Number.isFinite(requested) ? Math.min(Math.max(requested, 1), Math.max(showing.plans.length, 1)) - 1 : 0;
  const after = single("after") === "1" && showing.played;

  return (
    <>
      <SiteNav meta={meta} system={system} week={week} />
      <PlayView data={data} week={showing} planIndex={planIndex} after={after} now={new Date()} />
    </>
  );
}
