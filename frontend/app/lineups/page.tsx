import type { Metadata } from "next";
import { connection } from "next/server";
import LineupsView, { type ClubLook } from "../../components/lineups/LineupsView";
import SiteNav from "../../components/SiteNav";
import { loadGrid } from "../../lib/api";
import { otherWeekNote, pickMatch, sectionsOf } from "../../lib/lineups";
import { lineupMatchFacts } from "../../lib/lineupMatchFacts";
import { loadLineups } from "../../lib/lineupsData";
import { lineupChances, recordedChances, recordedGames, type ChanceRecord } from "../../lib/lineupChances";
import { loadSavedChances, savedCoverage, savedLineupChances } from "../../lib/sorareChances";
import { weekPlan } from "../../lib/play";
import { loadChanceRecord, loadProjectedWeek, loadSorare } from "../../lib/playData";
import { loadSystem } from "../../lib/system";
import { nationalWeek } from "../../lib/teamNews";
import { weekById, weekContext } from "../../lib/weeks";

export const metadata: Metadata = { title: "Lineups · Sofix" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/**
 * Lineups: Futbol Fantasy's probable elevens for every match it has published, with your players marked by their cards. The
 * top bar's week picks the LaLiga round it shows (Futbol Fantasy holds only the rounds still to play, and the one in progress). The job reads the site before each plan
 * (backend/app/sorare/ff_lineups.py); this page only draws what it kept. Design: docs/sorare/design/lineups.html.
 */
export default async function Lineups({ searchParams }: { searchParams: SearchParams }) {
  await connection(); // the kickoff, "kicked off" and "read today" all read the clock
  const params = await searchParams;
  const asked = typeof params.m === "string" ? params.m : null;
  const [data, { grid, meta }, system, sorare] = await Promise.all([loadLineups(), loadGrid(), loadSystem(), loadSorare()]);
  const now = new Date();
  // The top bar's week picks the LaLiga round: its first match still to come (the page's own `?m=` wins when it names one).
  const sections = data ? sectionsOf(data) : [];
  const asking = typeof params.w === "string" ? params.w : null;
  const { weeks, current: pickedWeek, now: thisWeek } = weekContext(grid, sorare, now, { w: asking });
  const wanted = asking ? weekById(weeks, asking) : null;
  const wantedSection = wanted?.md != null ? sections.find((s) => s.competition === "laliga" && s.round === wanted.md) : undefined;
  const selected = data ? (asked ? null : wantedSection ? pickMatch([wantedSection], null, now) : null) ?? pickMatch(sections, asked, now) : null;
  const section = selected ? sections.find((s) => s.matches.some((m) => m.id === selected.id)) : undefined;
  // The picker shows the round of the match on the page, whichever way the page was reached.
  const week = { weeks, now: thisWeek, current: (section?.competition === "laliga" && section.round !== null ? weeks.find((one) => one.md === section.round) : null) ?? pickedWeek };
  if (!data || !selected || !section) {
    return (
      <>
        <SiteNav meta={meta} system={system} week={week} />
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
  const round = sections.find((s) => s.competition === "laliga")?.round ?? null;
  const ahead = round !== null && sorare?.projected?.some((one) => one.round === round) ? await loadProjectedWeek(round) : null;
  const chances = lineupChances(data.matches, [...(sorare?.weeks ?? []), ...(ahead ? [ahead] : [])].flatMap((week) => week.playing.players), sorare?.market ?? []);
  const relevant = (sorare?.timeline ?? []).filter((w) => data.matches.some((m) => m.kickoff && Date.parse(m.kickoff) >= Date.parse(w.start) && Date.parse(m.kickoff) <= Date.parse(w.end))).slice(-4);
  const records = (await Promise.all(relevant.map((w) => loadChanceRecord(w.slug)))).filter((r): r is ChanceRecord => r !== null);
  for (const [match, players] of Object.entries(recordedChances(data.matches, records))) for (const [player, sources] of Object.entries(players)) {
    (chances[match] ??= {})[player] = { ...sources, ...chances[match]?.[player] };
  }
  // Sorare's own number, as the extension read it from Sorare's page and the app kept it: the public API has none.
  const sorareGames = recordedGames(data.matches, records);
  const kept = await loadSavedChances(Object.values(sorareGames).map((link) => link.id));
  for (const [match, players] of Object.entries(savedLineupChances(kept, sorareGames))) for (const [player, sources] of Object.entries(players)) {
    (chances[match] ??= {})[player] = { ...chances[match]?.[player], ...sources };
  }
  const wantedPlan = wanted?.gw && sorare ? weekPlan(sorare, wanted.gw) : null;
  const flash = [otherWeekNote(wanted, round, wantedPlan ? nationalWeek(wantedPlan) : false)].filter((line): line is string => line !== null);
  const gone = asked && !data.matches.some((match) => String(match.id) === asked) ? asked : null;
  return (
    <>
      <SiteNav meta={meta} system={system} week={week} />
      <LineupsView data={data} chances={chances} sorareGames={sorareGames} sorareKept={savedCoverage(kept, sorareGames)} facts={lineupMatchFacts(data.matches, grid)} sections={sections} initial={selected} now={now} clubs={clubs} flash={flash} gone={gone} />
    </>
  );
}
