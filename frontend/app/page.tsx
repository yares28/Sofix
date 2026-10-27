import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import AwayWeek from "../components/AwayWeek";
import { BestCards, MissionsGlance, PlanLineups, RoundBoard, TableAfter, WeekNews } from "../components/recap/Recap";
import { WaitingTile } from "../components/home/SorareTiles";
import TeamNewsTile from "../components/home/TeamNewsTile";
import EnteredLineups from "../components/play/EnteredLineups";
import YourSeason from "../components/recap/YourSeason";
import RewardsCard, { WeekRewardsProvider } from "../components/recap/WeekRewards";
import { weekRewards } from "../lib/weekRewards";
import { projectedRewards, rewardSignature } from "../lib/playRewards";
import { myWeeksQuietly } from "../lib/myWeeksData";
import SiteNav from "../components/SiteNav";
import { loadGrid } from "../lib/api";
import { legacyBoardUrl, openingColumn } from "../lib/grid";
import { boardHref, dateRange } from "../lib/home";
import { loadMissions } from "../lib/missionsData";
import { missionsToday } from "../lib/missionsToday";
import { loadMissionPool } from "../lib/missionsPool";
import { bestCards, lockText, planRows, roundBoard, tableAfter, weekNews } from "../lib/recap";
import { lineupsGlance, readLabel } from "../lib/lineups";
import { loadLineups } from "../lib/lineupsData";
import { freshLabel } from "../lib/fresh";
import { bestPlan, weekPlan } from "../lib/play";
import { loadFrozenPlan, loadPlayRewards, loadProjectedWeek, loadSorare, loadSorareWeek } from "../lib/playData";
import { weekContext, weekDates } from "../lib/weeks";
import { loadSystem } from "../lib/system";
import { loadPlanActuals } from "../lib/planScoresData";
import { withLineupRules } from "../lib/lineupScores";

export const metadata: Metadata = { title: "Sofix" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/**
 * Home: the gameweek (the week in the top bar, the opening one by default), its hero number, the three board
 * tiles and the Sorare row. Selected weeks can also restore their retained pre-lock plan.
 * Design: docs/sorare/design/S2-home.html.
 */
export default async function Home({ searchParams }: { searchParams: SearchParams }) {
  await connection(); // per request (from the cache): the countdown reads the clock
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(await searchParams)) {
    if (typeof value === "string") params.set(key, value);
  }
  // Links from when the board lived here (/?view=table, /?h=next, …) open the board page they meant.
  const legacy = legacyBoardUrl(params);
  if (legacy) redirect(legacy);

  // Reads start together: each one waiting for the one before made every view slower (AGENTS.md "Pages").
  const [{ grid, meta, error }, system, sorare, lineups, missions, savedWeeks, pool] = await Promise.all([
    loadGrid(),
    loadSystem(),
    loadSorare(),
    loadLineups(),
    loadMissions(),
    myWeeksQuietly(),
    loadMissionPool(),
  ]);
  const opening = grid ? openingColumn(grid) : 0;
  const week = weekContext(grid, sorare, new Date(), {
    w: params.get("w"),
    md: Number(params.get("gw")) || null,
  });
  if (!grid) {
    return (
      <>
        <SiteNav meta={meta} system={system} week={week} />
        <main>
          <section className="card empty-state" role="status">
            <h1>Sofix</h1>
            <p>{error}</p>
          </section>
        </main>
      </>
    );
  }

  if (params.has("gw") && !grid.matchdays.some((md) => String(md.number) === params.get("gw"))) {
    redirect("/"); // a gameweek this season doesn't have
  }
  // A Sorare-only week must not silently show the next LaLiga round underneath it. An explicitly selected one
  // gets the same honest "LaLiga is away" treatment as the board pages.
  const away = week.current?.column === null ? week.current : null;
  const column = week.current?.column ?? opening;
  const href = (path: string) => week.current && (params.has("w") || (path === "/play" && week.current.gw))
    ? `${path}?w=${encodeURIComponent(week.current.id)}` : boardHref(path, grid, column, opening);
  const selectedSorare =
    sorare && week.current?.gw
      ? (sorare.timeline.find((item) => item.id === week.current?.gw) ?? weekPlan(sorare, week.current.gw)?.gameweek ?? null)
      : null;
  const now = new Date();
  const frozenRead = sorare && selectedSorare ? loadFrozenPlan(selectedSorare.slug, sorare) : null;
  const rewardsRead = selectedSorare ? loadPlayRewards(selectedSorare.slug) : null;
  // Only the selected week's frozen or early plan supplies Recap's forecasts.
  const plan = sorare ? week.current?.gw
    ? weekPlan(sorare, week.current.gw) ?? (selectedSorare
      ? ("kept" in selectedSorare && selectedSorare.kept ? await loadSorareWeek(selectedSorare.slug) : null) ?? await frozenRead
      : null)
    : week.current?.md ? await loadProjectedWeek(week.current.md) : null : null;
  const best = bestPlan(plan?.plans ?? []);
  // Finished replay payloads can contain fewer alternatives/cards than the retained pre-lock forecast.
  const frozen = await frozenRead;
  const enteredForecast = frozen ? withLineupRules(frozen, plan) : plan;
  const rows = best ? planRows(best) : [];
  const [actuals, today, rewards] = await Promise.all([plan ? loadPlanActuals(plan) : {}, missionsToday(sorare, missions, undefined, now, pool), rewardsRead]);
  const recommendation = weekRewards((best?.lineups ?? []).map(line => ({ expected: projectedRewards(line), actual: rewards?.sofix?.find(r => r.signature === rewardSignature(line))?.rewards })));
  const rewardsCard = <RewardsCard recommendation={recommendation} gw={selectedSorare?.number ?? (plan && !plan.projected ? plan.gameweek.number : null)} href={href("/play")} hasEntries={Boolean(selectedSorare)} />;
  const news = plan ? weekNews(plan.playing.players, week.current?.md ?? null, now) : { hurt: [], back: [] };
  const md = grid.matchdays[column]!;
  const lineupsHref = href("/lineups");

  return (
    <>
      <SiteNav meta={meta} system={system} week={week} />
      <main className="hm rc">
        <header className="rc-head">
          <div>
            <h1>{selectedSorare || (plan && !plan.projected) ? `Gameweek ${selectedSorare?.number ?? plan!.gameweek.number}` : `LaLiga round ${md.number}`}</h1>
            <p>
              {away ? "LaLiga is away · " : `LaLiga round ${md.number} · `}
              {away ? weekDates(away) : dateRange(md.date_from, md.date_to)}
              {sorare?.generatedAt ? <span className="rc-synced"> · {sorare.user} · synced {freshLabel(sorare.generatedAt, now)}</span> : null}
            </p>
          </div>
          {plan ? (
            <div className="rc-act">
              <span className="rc-pill">{lockText(plan.gameweek.lock, now)}</span>
              <Link className="rc-btn" href={href("/play")}>Open the plan</Link>
            </div>
          ) : null}
        </header>
        {away ? <AwayWeek plan={plan} variant="recap" dates={weekDates(away)} href={href("/fixtures")} /> : null}
        {plan ? <BestCards cards={bestCards(plan.playing.players)} gw={plan.gameweek.number} /> : null}
        <WeekRewardsProvider key={selectedSorare?.slug ?? week.current?.id ?? "none"}><div className="rc-grid">
          <YourSeason saved={savedWeeks} now={now.toISOString()} />
          {!away ? (
            <>
              <RoundBoard matches={roundBoard(grid, column)} href={href("/fixtures")} />
              <div className="rc-sidebar">
                <TableAfter rows={tableAfter(grid, column)} round={md.number} href={href("/table")} />
                {rewardsCard}
              </div>
            </>
          ) : null}
          {away ? rewardsCard : null}
          {sorare && (plan || selectedSorare) ? (
            <>
              <section className="hm-tile rc-lineups" aria-labelledby="rc-lu-h">
                <div className="rc-th">
                  <h2 id="rc-lu-h">Your lineups</h2>
                  <span>{plan?.projected ? "Early Sofix plan" : `Sorare GW${selectedSorare?.number ?? plan!.gameweek.number}`}</span>
                  <Link href={href("/play")}>{rows.length ? `See all ${rows.length}` : "Plan"} ›</Link>
                </div>
                {/* What you entered on Sorare comes first (read through the extension), then the plan's best. */}
                {selectedSorare ? <EnteredLineups week={selectedSorare} forecast={enteredForecast} variant="recap" scores={actuals} rewardCheck={rewards ? { you: rewards.you } : null} /> : null}
                {rows.length ? (
                  <div className="rc-plan" role="region" aria-label="Best Sofix plan">
                    <div className="rc-th rc-plan-head"><h3>Best Sofix plan</h3><span>{Math.round(best!.essence)} expected essence · {rows.length} lineup{rows.length === 1 ? "" : "s"}</span></div>
                    <PlanLineups rows={rows} href={href("/play")} scores={actuals} />
                  </div>
                ) : plan ? (
                  <WaitingTile week={plan} now={now} meta={`Sorare GW${plan.gameweek.number}`} />
                ) : <p className="rc-none">Plan not recorded for this GW.</p>}
              </section>
              <MissionsGlance plans={today.plans} day={today.day} current={today.status === "today"} href={href("/missions")} />
              {plan ? <WeekNews hurt={news.hurt} back={news.back} readAt={plan.teamNews?.readAt ? readLabel(plan.teamNews.readAt, now) : null} href={lineupsHref} /> : null}
              {/* How the plan's players look for the round, who moved since yesterday, or why Futbol Fantasy has said nothing yet. */}
              {plan ? <TeamNewsTile week={plan} now={now} glance={lineupsGlance(lineups, now)} /> : null}
            </>
          ) : null}
        </div></WeekRewardsProvider>
      </main>
    </>
  );
}
