import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import EnteredLineups from "../../components/play/EnteredLineups";
import PlayView from "../../components/play/PlayView";
import SiteNav from "../../components/SiteNav";
import { loadGrid } from "../../lib/api";
import { plansOf, weekPlan } from "../../lib/play";
import { loadProjectedWeek, loadSorare, loadSorareWeek } from "../../lib/playData";
import { loadSystem } from "../../lib/system";
import { noPlan, weekContext, weekDates } from "../../lib/weeks";

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
  if (legacy && !weekPlan(data, legacy) && !data.timeline.some((item) => item.id === legacy)) redirect("/play");
  const asked = week.current;
  const item = asked?.gw ? data.timeline.find((entry) => entry.id === asked.gw) : undefined;
  const over = item !== undefined && asked?.state === "done";
  // A LaLiga round Sorare has not opened has no gameweek to show, only the early plan the job made for it (or none).
  const unopened = asked !== null && !asked.gw;
  const early = unopened && asked.early && asked.md !== null ? await loadProjectedWeek(asked.md) : null;
  // The page holds the last weeks; a finished one the job kept apart is read from where it was kept.
  const showing = unopened
    ? early
    : (weekPlan(data, asked?.gw ?? data.nextId) ?? (over && item.kept ? await loadSorareWeek(item.slug) : null));
  // A week Sorare has not opened and no early plan covers, or one the job has not planned: the page says so rather
  // than showing another gameweek under that week's name.
  if (!showing) {
    const said = noPlan(asked, item);
    return (
      <>
        <SiteNav meta={meta} system={system} week={week} />
        <main className="pl-main">
          <section className="card empty-state" role="status">
            <h1>{said.heading}</h1>
            <p>{said.says}</p>
          </section>
          {/* What you entered and won is readable from Sorare whenever it has the gameweek, whether or not Sofix holds a plan. */}
          {said.lineups ? <EnteredLineups week={said.lineups} /> : null}
        </main>
      </>
    );
  }
  const after = single("after") === "1" && showing.played;
  const requested = Number(single("plan") ?? 1);
  const offered = Math.max(plansOf(showing, after).length, 1);
  const planIndex = Number.isFinite(requested) ? Math.min(Math.max(requested, 1), offered) - 1 : 0;

  return (
    <>
      <SiteNav meta={meta} system={system} week={week} />
      <PlayView data={data} week={showing} planIndex={planIndex} after={after} now={new Date()} weekId={single("w")} dates={asked && (asked.gw ? asked.gw === showing.gameweek.id : asked.md !== null && asked.md === showing.projected?.round) ? weekDates(asked, "play") : null} />
    </>
  );
}
