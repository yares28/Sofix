import { connection } from "next/server";
import FixtureBoard from "../../components/FixtureBoard";
import LaLigaView from "../../components/laliga/LaLigaView";
import SiteNav from "../../components/SiteNav";
import { loadGrid } from "../../lib/api";
import { loadFrozenPlan, loadSorare } from "../../lib/playData";
import { weekPlan } from "../../lib/play";
import { weekContext, weekDates } from "../../lib/weeks";
import { loadSystem } from "../../lib/system";
import { DEFAULT_VIEW, openingColumn, parseViewState, selectedColumn, type View } from "../../lib/grid";
import { dateRange } from "../../lib/home";
import { laligaRound } from "../../lib/laliga";
import { tableAfter } from "../../lib/recap";
import CompetitionPicker from "../../components/CompetitionPicker";
import { competitionOf, COMPETITIONS, leagueColumn, validDay } from "../../lib/competitions";

export type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const TITLES: Record<View, string> = { plain: "Fixtures", fdr: "Fixtures & Difficulty", table: "Table" };

/**
 * The board, shared by /fixtures, /difficulty and /table: the route picks the tab, the query string the rest.
 * Switching tabs in the page doesn't navigate: the board rewrites the path itself (hooks/useViewState.ts).
 */
export async function BoardRoute({ view, searchParams }: { view: View; searchParams: SearchParams }) {
  await connection(); // render per request (from the cache), never prerender at build time when the API may be down
  const [{ grid, meta, error }, rawParams, system, sorare] = await Promise.all([
    searchParams.then(p => loadGrid(competitionOf(p.league))),
    searchParams,
    loadSystem(),
    searchParams.then(p => competitionOf(p.league) === "PD" ? loadSorare() : null),
  ]);

  // View state from the URL is applied on the server, so a shared link renders the right view with no flash.
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(rawParams)) {
    if (typeof value === "string") params.set(key, value);
  }
  const competition = competitionOf(rawParams.league);
  if (competition !== "PD") {
    const requested = params.get("w");
    const column = grid && requested ? leagueColumn(grid.matchdays, requested, params.get("end") ?? undefined) : null;
    const blank = Boolean(grid && requested && column === null);
    const md = column !== null ? grid?.matchdays[column]?.number : null;
    const week = weekContext(grid, null, new Date(), { md: md ?? null });
    if (blank && week.current && validDay(requested)) {
      const end = params.get("end");
      week.current = { ...week.current, id: requested, from: `${requested}T00:00:00Z`, to: `${validDay(end) ? end : requested}T23:59:59Z`, md: null, column: null };
    }
    if (md) params.set("gw", String(md));
    else if (week.current?.md) params.set("gw", String(week.current.md));
    const initial = grid ? { ...DEFAULT_VIEW, ...parseViewState(params, new Set(grid.teams.map(t => t.code))), view } : { ...DEFAULT_VIEW, view };
    return <>
      <SiteNav meta={meta} system={system} week={week} competition={competition} />
      <main>
        <CompetitionPicker competition={competition} week={requested ?? week.current?.id} through={week.current?.to} />
        <p className="footnote">{COMPETITIONS[competition]} · {grid?.season ?? "Awaiting refresh"}. Independently fitted reference model; clean-sheet chances are uncalibrated. Player xScore is not included.</p>
        {!grid ? <section className="card empty-state" role="status"><h1>{TITLES[view]}</h1><p>{error}</p></section> : blank ?
          <section className="card empty-state" role="status"><h1>{TITLES[view]}</h1><p>No {COMPETITIONS[competition]} fixtures in the selected week.</p></section> :
          <FixtureBoard key={competition} grid={grid} notes={meta?.model_notes ?? []} initialView={initial} pinsInUrl={params.has("pins")} away={null} />}
      </main>
    </>;
  }
  // One week drives the whole app: the board opens on the LaLiga round inside it, and an older ?gw= link
  // still decides which week that is. A week with no round at all stays itself — the board then shows the
  // games the owner's own players play, because there is no LaLiga to show.
  const opening = grid ? (grid.matchdays[openingColumn(grid)]?.number ?? null) : null;
  const now = new Date();
  const askedDate = params.get("w");
  const sharedColumn = grid && askedDate && params.has("league") ? leagueColumn(grid.matchdays, askedDate, params.get("end") ?? undefined) : null;
  const calendar = weekContext(grid, sorare, now, { w: params.get("w"), md: (sharedColumn !== null ? grid?.matchdays[sharedColumn]?.number : null) ?? (Number(params.get("gw")) || null) });
  const week = !params.has("w") && !params.has("gw") && calendar.now?.state !== "live"
    ? weekContext(grid, sorare, now, { md: opening }) : calendar;
  if (grid && askedDate && params.has("league") && sharedColumn === null) {
    if (week.current && validDay(askedDate)) {
      const end = params.get("end");
      week.current = { ...week.current, id: askedDate, from: `${askedDate}T00:00:00Z`, to: `${validDay(end) ? end : askedDate}T23:59:59Z`, md: null, column: null };
    }
    return <><SiteNav meta={meta} system={system} week={week} /><main>
      <CompetitionPicker competition="PD" week={askedDate} through={week.current?.to} />
      <section className="card empty-state" role="status"><h1>{TITLES[view]}</h1><p>No LaLiga fixtures in the selected week.</p></section>
    </main></>;
  }
  const away = week.current && week.current.md === null ? week.current : null;
  const awayInfo = sorare?.timeline.find(w => w.id === away?.gw);
  const awayPlan = sorare && away?.gw ? weekPlan(sorare, away.gw) ?? (awayInfo ? await loadFrozenPlan(awayInfo.slug, sorare) : null) : null;
  // Explicit dates and a live round drive the board. Between live windows it keeps its opening LaLiga round.
  if ((params.has("w") || (week.current?.state === "live" && week.current.md !== opening)) && week.current?.md) params.set("gw", String(week.current.md));

  const initialView = grid
    ? { ...DEFAULT_VIEW, ...parseViewState(params, new Set(grid.teams.map((team) => team.code))), view }
    : { ...DEFAULT_VIEW, view };

  // This week · LaLiga is its own page now (canvas board 3); a week with no LaLiga round keeps the board's away view.
  if (view === "plain" && grid && !away) {
    const column = selectedColumn(grid.matchdays, initialView.gw, openingColumn(grid));
    const md = grid.matchdays[column];
    if (md) {
      // The owner's players from every week the job holds (one LaLiga round can sit in a week Sorare has not opened yet).
      const players = [...new Map((sorare?.weeks ?? []).flatMap((w) => w.playing.players).map((p) => [p.name, p])).values()];
      return (
        <>
          <SiteNav meta={meta} system={system} week={week} />
          <div className="competition-container"><CompetitionPicker competition="PD" week={week.current?.id} through={week.current?.to} /></div>
          <LaLigaView
            round={laligaRound(grid, column, players)}
            number={md.number}
            dates={dateRange(md.date_from, md.date_to)}
            table={tableAfter(grid, column)}
          />
        </>
      );
    }
  }

  return (
    <>
      <SiteNav meta={meta} system={system} week={week} />
      <main>
        <CompetitionPicker competition="PD" week={week.current?.id} through={week.current?.to} />
        {grid ? (
          <FixtureBoard
            grid={grid}
            notes={meta?.model_notes ?? []}
            initialView={initialView}
            pinsInUrl={params.has("pins")}
            away={away ? { plan: awayPlan, dates: weekDates(away) } : null}
          />
        ) : (
          <section className="card empty-state" role="status">
            <h1>{TITLES[view]}</h1>
            <p>{error}</p>
          </section>
        )}
      </main>
    </>
  );
}
