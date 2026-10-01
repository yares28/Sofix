import type { Metadata } from "next";
import { connection } from "next/server";
import LineupsView, { type ClubLook } from "../../components/lineups/LineupsView";
import SiteNav from "../../components/SiteNav";
import { loadGrid } from "../../lib/api";
import { otherWeekNote, pickMatch, sectionsOf, sorareLine } from "../../lib/lineups";
import { loadLineups } from "../../lib/lineupsData";
import { weekPlan } from "../../lib/play";
import { loadSorare } from "../../lib/playData";
import { loadSystem } from "../../lib/system";
import { nationalWeek } from "../../lib/teamNews";
import { weekById, weekContext } from "../../lib/weeks";

export const metadata: Metadata = { title: "Lineups · Sofix" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/**
 * Lineups: Futbol Fantasy's probable elevens for every match it has published, with your players marked by their cards. It
 * covers each team's next game only, so it is not tied to the week in the top bar. The job reads the site before each plan
 * (backend/app/sorare/ff_lineups.py); this page only draws what it kept. Design: docs/sorare/design/lineups.html.
 */
export default async function Lineups({ searchParams }: { searchParams: SearchParams }) {
  await connection(); // the kickoff, "kicked off" and "read today" all read the clock
  const params = await searchParams;
  const asked = typeof params.m === "string" ? params.m : null;
  const [data, { grid, meta }, system, sorare] = await Promise.all([loadLineups(), loadGrid(), loadSystem(), loadSorare()]);
  const now = new Date();

  const sections = data ? sectionsOf(data) : [];
  const selected = data ? pickMatch(sections, asked, now) : null;
  const section = selected ? sections.find((s) => s.matches.some((m) => m.id === selected.id)) : undefined;
  if (!data || !selected || !section) {
    return (
      <>
        <SiteNav meta={meta} system={system} />
        <main className="lu">
          <section className="card empty-state" role="status">
            <h1>Lineups</h1>
            <p>
              {data
                ? "Futbol Fantasy has not published a lineup for any match yet. It appears here after the next refresh that finds one."
                : "Futbol Fantasy's lineups appear after the next refresh."}
            </p>
          </section>
        </main>
      </>
    );
  }
  const clubs: Record<string, ClubLook> = Object.fromEntries(
    (grid?.teams ?? []).map((team) => [team.code, { color: team.color, crest: team.crest_url }]),
  );
  // Which Sorare week this round feeds, and why the page may not be the week you came with (`?w=`): it holds each club's next
  // LaLiga game only. A match asked for that is no longer on the site is said so, above the one shown instead.
  const { weeks } = weekContext(grid, sorare, now);
  const round = sections.find((s) => s.competition === "laliga")?.round ?? null;
  const feeds = round === null ? undefined : weeks.find((week) => week.md === round);
  const lock = feeds?.gw ? sorare?.timeline.find((item) => item.id === feeds.gw)?.lock : undefined;
  const wanted = typeof params.w === "string" ? weekById(weeks, params.w) : null;
  const wantedPlan = wanted?.gw && sorare ? weekPlan(sorare, wanted.gw) : null;
  const flash = [otherWeekNote(wanted, round, wantedPlan ? nationalWeek(wantedPlan) : false)].filter((line): line is string => line !== null);
  const gone = asked && !data.matches.some((match) => String(match.id) === asked) ? asked : null;
  return (
    <>
      <SiteNav meta={meta} system={system} />
      <LineupsView data={data} sections={sections} initial={selected} now={now} clubs={clubs} sorare={sorareLine(feeds, lock, now)} flash={flash} gone={gone} />
    </>
  );
}
