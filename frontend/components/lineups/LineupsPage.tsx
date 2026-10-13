import { connection } from "next/server";
import LineupsView, { type ClubLook } from "./LineupsView";
import SiteNav from "../SiteNav";
import { loadGrid } from "../../lib/api";
import { daysOf, pickMatch, sectionsOf, weekLineups, weekSpan } from "../../lib/lineups";
import { lineupMatchFacts } from "../../lib/lineupMatchFacts";
import { loadKeptDays, loadLineups } from "../../lib/lineupsData";
import { lineupChances, recordedChances, recordedGames, type ChanceRecord, type SorareGameLink } from "../../lib/lineupChances";
import { loadSavedChances, savedCoverage, savedLineupChances, withNames } from "../../lib/sorareChances";
import { weekPlan } from "../../lib/play";
import { loadChanceRecord, loadProjectedWeek, loadSorare } from "../../lib/playData";
import { loadSystem } from "../../lib/system";
import { nationalWeek } from "../../lib/teamNews";
import { weekContext } from "../../lib/weeks";

export type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/**
 * Lineups: Futbol Fantasy's probable elevens for every match it has published, with your players marked by their cards. The
 * top bar's week picks the LaLiga round it shows (Futbol Fantasy holds only the rounds still to play, and the one in progress). The job reads the site before each plan
 * (backend/app/sorare/ff_lineups.py); this page only draws what it kept. Design: docs/sorare/design/lineups.html.
 * With `scores` it is the Scores page: the same round and matches, each drawn as the eleven that played with what every player scored.
 */
export default async function LineupsPage({ searchParams, scores = false }: { searchParams: SearchParams; scores?: boolean }) {
  await connection(); // the kickoff, "kicked off" and "read today" all read the clock
  const params = await searchParams;
  const asked = typeof params.m === "string" ? params.m : null;
  const [live, { grid, meta }, system, sorare] = await Promise.all([loadLineups(), loadGrid(), loadSystem(), loadSorare()]);
  const now = new Date();
  const asking = typeof params.w === "string" ? params.w : null;
  const { weeks, current: pickedWeek, now: thisWeek } = weekContext(grid, sorare, now, { w: asking });
  // The top bar's week decides the days on the page: what the site lists of them now and what was kept of them once it moved on
  // (the owner, 13 Oct 2026: GW22 is the games on GW22's dates, and a past week is the one that was saved).
  const span = pickedWeek ? weekSpan(pickedWeek) : null;
  const ofWeek = span ? weekLineups(live, await loadKeptDays(daysOf(span)), span, pickedWeek?.md ?? null) : null;
  // A match the address names is shown wherever it falls. With no week asked for and nothing in the one under way, the page is
  // the site's next matches, as it always was.
  const named = asked !== null && !ofWeek?.matches.some((m) => String(m.id) === asked) && Boolean(live?.matches.some((m) => String(m.id) === asked));
  const data = named ? live : (ofWeek ?? (asking && pickedWeek ? null : live));
  const sections = data ? sectionsOf(data) : [];
  // A week that is a LaLiga round opens on that round's first match still to come (the page's own `?m=` wins when it names one).
  const wantedSection = pickedWeek?.md != null ? sections.find((s) => s.competition === "laliga" && s.round === pickedWeek.md) : undefined;
  const next = data ? (asked ? null : wantedSection ? pickMatch([wantedSection], null, now) : null) ?? pickMatch(sections, asked, now) : null;
  const nextSection = next ? sections.find((s) => s.matches.some((m) => m.id === next.id)) : undefined;
  // Scores are of games played: unless the address names a match, the page opens on the round's latest one to have kicked off.
  const played = scores && !asked ? nextSection?.matches.filter((m) => m.kickoff && Date.parse(m.kickoff) <= now.getTime()).at(-1) : undefined;
  const selected = played ?? next;
  const section = nextSection;
  // The picker shows the round of the match on the page, whichever way the page was reached.
  const week = { weeks, now: thisWeek, current: (data === live && section?.competition === "laliga" && section.round !== null ? weeks.find((one) => one.md === section.round) : null) ?? pickedWeek };
  if (!data || !selected || !section) {
    const plan = pickedWeek?.gw && sorare ? weekPlan(sorare, pickedWeek.gw) : null;
    const none = !live
      ? "Futbol Fantasy's lineups appear after the next refresh."
      : !asking || !pickedWeek
        ? "Futbol Fantasy has not published a lineup for any match yet. It appears here after the next refresh that finds one."
        : plan && nationalWeek(plan)
          ? `Sorare GW${pickedWeek.number} is national-team games: Futbol Fantasy has no lineups for it.`
          : pickedWeek.state === "done"
            ? "No lineups were kept for this week."
            : "Futbol Fantasy has not published this week's lineups yet.";
    return (
      <>
        <SiteNav meta={meta} system={system} week={week} />
        <main className="lu">
          <section className="card empty-state" role="status">
            <h1>{scores ? "Scores" : "Lineups"}</h1>
            <p>{none}</p>
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
  // Which Sorare game a match is: the job ties them and writes it with the match; an older match has only what the start record held.
  const tied: Record<number, SorareGameLink> = { ...recordedGames(data.matches, records), ...Object.fromEntries(data.matches.flatMap((match) => (match.sorare ? [[match.id, match.sorare]] : []))) };
  const kept = scores ? {} : await loadSavedChances(Object.values(tied).map((link) => link.id));
  // Everyone else Sorare's page named for the game is tied by name, so both elevens get a number, not only the owner's players.
  const sorareGames = withNames(tied, data.matches, kept);
  for (const [match, players] of Object.entries(savedLineupChances(kept, sorareGames))) for (const [player, sources] of Object.entries(players)) {
    (chances[match] ??= {})[player] = { ...chances[match]?.[player], ...sources };
  }
  const flash: string[] = [];
  const gone = asked && !data.matches.some((match) => String(match.id) === asked) ? asked : null;
  return (
    <>
      <SiteNav meta={meta} system={system} week={week} />
      <LineupsView scores={scores} data={data} chances={chances} sorareGames={sorareGames} sorareKept={savedCoverage(kept, sorareGames)} facts={lineupMatchFacts(data.matches, grid)} sections={sections} initial={selected} now={now} clubs={clubs} flash={flash} gone={gone} />
    </>
  );
}
