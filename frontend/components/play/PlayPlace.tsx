import { redirect } from "next/navigation";
import { connection } from "next/server";
import EnteredLineups from "./EnteredLineups";
import PlayView from "./PlayView";
import SiteNav from "../SiteNav";
import { loadGrid } from "../../lib/api";
import { loadMissions } from "../../lib/missionsData";
import { missionsToday } from "../../lib/missionsToday";
import { bestPlan, lensKey, plansOf, weekPlan, type PlanBy } from "../../lib/play";
import { loadFrozenPlan, loadPlayRewards, loadProRebuild, loadProjectedWeek, loadSorare, loadSorareAlt, loadSorareLens, loadSorareWeek } from "../../lib/playData";
import { loadMissionPool } from "../../lib/missionsPool";
import { loadSystem } from "../../lib/system";
import { noPlan, pageWeeks, weekContext, weekDates, weekName } from "../../lib/weeks";
import StrategyViews from "../audit/StrategyViews";
import { alternativeAddress } from "../../lib/planNavigation";
import { planPortfolio } from "../../lib/playPortfolio";
import { withEnteredEvidence, withLineupRules } from "../../lib/lineupScores";
import { loadPlanActuals } from "../../lib/planScoresData";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/**
 * The shared reader for Play's recommendation and Strategies' alternative plans.
 * The job owns every forecast and allocation; bookmarks retain their GW, source and plan.
 */
export default async function PlayPlace({ searchParams, alternatives = false }: { searchParams: SearchParams; alternatives?: boolean }) {
  await connection(); // the countdowns read the clock, so this renders per request from the cached data
  const params = await searchParams;
  const single = (key: string) => {
    const value = params[key];
    return typeof value === "string" ? value : undefined;
  };

  if (!alternatives && (single("plan") !== undefined || single("by") !== undefined || single("after") === "1")) redirect(alternativeAddress(params));

  // Reads start together: each one waiting for the one before made every view slower (AGENTS.md "Pages").
  const [data, { grid, meta }, system, missionsModel, pool] = await Promise.all([loadSorare({ market: false }), loadGrid(), loadSystem(), alternatives ? null : loadMissions(), alternatives ? null : loadMissionPool()]);
  const week = weekContext(grid, data, new Date(), { w: single("w"), gw: single("gw") });
  const navWeek = alternatives ? { ...week, weeks: pageWeeks(week.weeks, "play") } : week;
  const emptyNavigation = alternatives ? <StrategyViews plans plansHref={alternativeAddress(params)} /> : null;
  if (!data) {
    return (
      <>
        <SiteNav meta={meta} system={system} week={navWeek} />
        <main className="pl-main">
          {emptyNavigation}
          <section className="card empty-state" role="status">
            <h1>{alternatives ? "Plan alternatives" : "Play"}</h1>
            <p>Your Sorare gameweek appears after the next refresh.</p>
          </section>
        </main>
      </>
    );
  }

  // The week in the bar decides the gameweek; ?gw= still works for a link made before the week existed, and
  // one naming a gameweek this page no longer holds is dropped rather than silently showing another.
  const legacy = single("gw");
  if (legacy && !weekPlan(data, legacy) && !data.timeline.some((item) => item.id === legacy)) redirect(alternatives ? "/audit/strategies?view=plans" : "/play");
  const asked = week.current;
  const item = asked?.gw ? data.timeline.find((entry) => entry.id === asked.gw) : undefined;
  const over = item !== undefined && asked?.state === "done";
  // A LaLiga round Sorare has not opened has no gameweek to show, only the early plan the job made for it (or none).
  const unopened = asked !== null && !asked.gw;
  const early = unopened && asked.early && asked.md !== null ? await loadProjectedWeek(asked.md) : null;
  // The page holds the last weeks; a finished one the job kept apart is read from where it was kept.
  const showing = unopened
    ? early
    : (weekPlan(data, asked?.gw ?? data.nextId) ?? (over && item?.kept ? await loadSorareWeek(item.slug) : item ? await loadFrozenPlan(item.slug, data) : null));
  // A week Sorare has not opened and no early plan covers, or one the job has not planned: the page says so rather
  // than showing another gameweek under that week's name.
  if (!showing) {
    const said = noPlan(asked, item);
    const rewards=!alternatives&&said.lineups?await loadPlayRewards(said.lineups.slug):null;
    return (
      <>
        <SiteNav meta={meta} system={system} week={navWeek} />
        <main className="pl-main">
          {emptyNavigation}
          {alternatives || !said.lineups ? <section className="card empty-state" role="status">
            <h1>{alternatives ? "Plan alternatives" : said.heading}</h1>
            {alternatives ? <h2>{said.heading}</h2> : null}
            <p>{said.says}</p>
          </section> : null}
          {/* What you entered and won is readable from Sorare whenever it has the gameweek, whether or not Sofix holds a plan. */}
          {!alternatives && said.lineups ? <EnteredLineups key={said.lineups.slug} week={{ ...said.lineups, end: item?.end }} comparison={{ heading: <header className="pl-head"><h1>{said.heading}</h1><p className="pl-sub">{said.says}</p></header>, recommendation: planPortfolio(null),rewards:rewards?{you:rewards.you,checkedAt:rewards.checkedAt,nextCheckAt:rewards.nextCheckAt}:null }} /> : null}
        </main>
      </>
    );
  }
  // The week in the bar, when it is the one being shown (a legacy ?gw= can name another): the page then writes it as the bar does.
  const shown = asked && (asked.gw ? asked.gw === showing.gameweek.id : asked.md !== null && asked.md === showing.projected?.round) ? asked : null;
  const requestedAfter = alternatives && single("after") === "1" && showing.played;
  // Alternatives read their exact retained source block, including old GWs; no current week fills a missing one.
  const switchable = alternatives && !showing.projected;
  const sorareAsked = single("by") === "sorare" && switchable;
  const lens = switchable ? lensKey(single("by")) : null;
  const today = !alternatives && !showing.projected && showing.gameweek.id === data.nextId; // today's missions belong to the week played now
  // A locked week still being played: each card's score as his game comes in, the same cached read the home page makes.
  const playing = !requestedAfter && !showing.projected && !showing.played && Date.parse(showing.gameweek.lock) <= Date.now();
  // Load from Sorare: the week being planned, and a locked one still being played, whose Pro lineups change until their first kickoff
  const rebuildable = !sorareAsked && !lens && ((!showing.projected && !showing.played && showing.gameweek.id === data.nextId) || playing);
  const [alt, frozen, missions, scores, rebuild, rewards] = await Promise.all([
    sorareAsked ? loadSorareAlt(showing.gameweek.slug) : lens ? loadSorareLens(showing.gameweek.slug, lens) : null,
    alternatives || showing.projected ? null : loadFrozenPlan(showing.gameweek.slug, data),
    today ? missionsToday(data, missionsModel, undefined, new Date(), pool) : null,
    playing ? loadPlanActuals(showing) : undefined,
    rebuildable ? loadProRebuild(showing.gameweek.slug) : null,
    alternatives||showing.projected?null:loadPlayRewards(showing.gameweek.slug),
  ]);
  const by: PlanBy = sorareAsked ? "sorare" : (lens ?? "sofix");
  const recorded=frozen?.gameweek.slug===showing.gameweek.slug?frozen:null;
  const recordedRules = recorded ? withLineupRules(recorded, showing) : null;
  const enteredForecast = recorded ? withEnteredEvidence(recorded, showing) : showing;
  const locked = Date.parse(showing.gameweek.lock) <= Date.now();
  const baseline=!alternatives&&locked&&recordedRules?{...showing,plans:recordedRules.plans,playing:recordedRules.playing}:showing;
  const view = sorareAsked || lens ? { ...showing, plans: alt?.gameweek?.slug === showing.gameweek.slug ? alt.plans : [], hindsight: undefined } : baseline;
  const after = Boolean(requestedAfter && (view.hindsight || view.plans.some(p => p.actual)));
  const sorareWaiting = sorareAsked && !view.plans.length ? locked ? "No Sorare plan was saved for this GW." : sorareNote(alt, showing.projectionsAt) : lens && !view.plans.length ? locked ? "No plan from this strategy was saved for this GW." : "This strategy's plan appears with the next refresh before the lock." : null;
  const defaultPlan = bestPlan(view.plans);
  const requested = Number((alternatives ? single("plan") : undefined) ?? (defaultPlan ? view.plans.indexOf(defaultPlan) + 1 : 1));
  const offered = Math.max(plansOf(view, after).length, 1);
  const planIndex = Number.isFinite(requested) ? Math.min(Math.max(requested, 1), offered) - 1 : 0;

  return (
    <>
      <SiteNav meta={meta} system={system} week={navWeek} />
      <PlayView
        alternatives={alternatives}
        missions={missions}
        data={data}
        week={view}
        forecast={enteredForecast}
        rewards={rewards}
        scores={scores}
        rebuild={rebuild}
        rebuildable={rebuildable}
        by={by}
        sorareWaiting={sorareWaiting}
        planIndex={planIndex}
        after={after}
        now={new Date()}
        weekId={single("w")}
        dates={shown ? weekDates(shown, alternatives ? "all" : "play") : null}
        title={shown ? weekName(shown) : null}
      />
    </>
  );
}

/** What the Sorare view says while it has no plan: Sorare has not projected the games yet, or the job has not planned on them yet. */
function sorareNote(alt: { projected: number; players: number } | null, projectionsAt: string | null): string {
  const when = projectionsAt
    ? new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Madrid", weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(
        new Date(projectionsAt),
      )
    : null;
  if (!alt || alt.projected * 2 < alt.players) return `Sorare has not published its projections for these games yet${when ? ` (due ${when})` : ""}. The plan appears with the first refresh after.`;
  return "Sorare's projections are in; the plan appears with the next refresh.";
}
