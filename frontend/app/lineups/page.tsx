import type { Metadata } from "next";
import { connection } from "next/server";
import LineupsView, { type ClubLook } from "../../components/lineups/LineupsView";
import SiteNav from "../../components/SiteNav";
import { loadGrid } from "../../lib/api";
import { pickMatch, sectionsOf } from "../../lib/lineups";
import { loadLineups } from "../../lib/lineupsData";
import { loadSystem } from "../../lib/system";

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
  const [data, { grid, meta }, system] = await Promise.all([loadLineups(), loadGrid(), loadSystem()]);
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
  return (
    <>
      <SiteNav meta={meta} system={system} />
      <LineupsView data={data} sections={sections} section={section} selected={selected} now={now} clubs={clubs} />
    </>
  );
}
