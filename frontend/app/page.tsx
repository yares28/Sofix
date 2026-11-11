import type { Metadata } from "next";
import LiveRefresh from "../components/LiveRefresh";
import Link from "../components/navigation/NavigationLink";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import AwayWeek from "../components/AwayWeek";
import { MissionsGlance, PlanLineups, RoundBoard, TableAfter, WeekNews } from "../components/recap/Recap";
import BestHand from "../components/recap/BestHand";
import LineupsSwitch from "../components/recap/LineupsSwitch";
import { WaitingTile } from "../components/home/SorareTiles";
import TeamNewsTile from "../components/home/TeamNewsTile";
import EnteredLineups from "../components/play/EnteredLineups";
import { HeroNumber, RewardsDuel, WeekRewardsProvider } from "../components/recap/WeekRewards";
import { planForRewards, weekRewards } from "../lib/weekRewards";
import { projectedPrize, rewardSignature } from "../lib/playRewards";
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
import { playerKey, withLineupRules, type ActualScores } from "../lib/lineupScores";

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
  const [{ grid, meta, error }, system, sorare, lineups, missions, pool] = await Promise.all([
    loadGrid(),
    loadSystem(),
    loadSorare(),
    loadLineups(),
    loadMissions(),
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
  const [actuals, today, rewards] = await Promise.all([plan ? loadPlanActuals(plan) : Promise.resolve<ActualScores>({}), missionsToday(sorare, missions, undefined, now, pool), rewardsRead]);
  const rewardPlan = planForRewards(best, frozen?.plans ?? [], rewards);
  const recommendation = weekRewards((rewardPlan?.lineups ?? []).map(line => ({ chance: line.pReturn, expected: projectedPrize(line), actual: rewards?.sofix?.find(r => r.signature === rewardSignature(line))?.rewards })));
  const gwNumber = selectedSorare?.number ?? (plan && !plan.projected ? plan.gameweek.number : null);
  // The hand: the week's best cards by xS, each with what he scored once his game is over ("dnp" when he did not play).
  const hand = plan ? bestCards(plan.playing.players).map((card) => {
    const got = actuals[playerKey(card.player)];
    return { ...card, scored: !got ? null : got.played ? got.score : ("dnp" as const) };
  }) : [];
  const end = selectedSorare && "end" in selectedSorare ? selectedSorare.end : null;
  const status = !plan ? null : Date.parse(plan.gameweek.lock) > now.getTime() ? { tone: "soon", text: lockText(plan.gameweek.lock, now) }
    : end && Date.parse(end) <= now.getTime() ? { tone: "final", text: "Final" } : { tone: "live", text: "Live" };
  const news = plan ? weekNews(plan.playing.players, week.current?.md ?? null, now) : { hurt: [], back: [] };
  const md = grid.matchdays[column]!;
  const lineupsHref = href("/lineups");

  return (
    <>
      <SiteNav meta={meta} system={system} week={week} />
      <main className="hm rc">
        <WeekRewardsProvider key={selectedSorare?.slug ?? week.current?.id ?? "none"}>
        <section className="rx-hero" aria-labelledby="rx-h">
          {gwNumber ? <span className="rx-ghost" aria-hidden="true">{gwNumber}</span> : null}
          <div className="rx-lead">
            <p className="rx-eyebrow">
              {status ? <span className={`rx-status ${status.tone}`}><i aria-hidden="true" />{status.text}</span> : null}
              <span>
                {away ? "LaLiga is away · " : `LaLiga round ${md.number} · `}
                {away ? weekDates(away) : dateRange(md.date_from, md.date_to)}
                {sorare?.user ? ` · ${sorare.user}` : ""}
              </span>
            </p>
            <h1 id="rx-h">{gwNumber ? `Gameweek ${gwNumber}` : `LaLiga round ${md.number}`}</h1>
            {plan || selectedSorare ? <HeroNumber plan={recommendation} expectedEssence={best ? best.essence : null} hasEntries={Boolean(selectedSorare)} /> : null}
            {plan ? (
              <div className="rx-acts">
                <Link className="rc-btn" href={href("/play")}>Open the plan</Link>
                {sorare?.generatedAt ? <span className="rx-synced">Synced {freshLabel(sorare.generatedAt, now)}</span> : null}
              </div>
            ) : null}
          </div>
          {hand.length ? <BestHand cards={hand} /> : null}
          {plan || selectedSorare ? <RewardsDuel recommendation={recommendation} hasEntries={Boolean(selectedSorare)} /> : null}
        </section>
        {sorare && (plan || selectedSorare) ? <MissionsGlance plans={today.plans} day={today.day} current={today.status === "today"} href={href("/missions")} /> : null}
        {away ? <AwayWeek plan={plan} variant="recap" dates={weekDates(away)} href={href("/fixtures")} /> : null}
        <LiveRefresh from={selectedSorare && "lock" in selectedSorare ? selectedSorare.lock : null} to={end} />
        <div className="rc-grid">
          {!away ? (
            <>
              <RoundBoard matches={roundBoard(grid, column)} href={href("/fixtures")} />
              <div className="rc-sidebar">
                <TableAfter rows={tableAfter(grid, column)} round={md.number} href={href("/table")} showFdr />
              </div>
            </>
          ) : null}
          {sorare && (plan || selectedSorare) ? (
            <>
              <section className="hm-tile rc-lineups" aria-labelledby="rc-lu-h">
                <div className="rc-th">
                  <h2 id="rc-lu-h">Your lineups</h2>
                  <span>{plan?.projected ? "Early Sofix plan" : `Sorare GW${selectedSorare?.number ?? plan!.gameweek.number}`}</span>
                  <Link href={href("/play")}>{rows.length ? `See all ${rows.length}` : "Plan"} ›</Link>
                </div>
                {/* What you entered on Sorare (read through the extension), or the plan's best: one at a time. */}
                <LineupsSwitch planCount={rows.length}
                  entered={selectedSorare ? <EnteredLineups week={selectedSorare} forecast={enteredForecast} variant="recap" scores={actuals} rewardCheck={rewards ? { you: rewards.you } : null} /> : null}
                  plan={rows.length ? (
                  <div className="rc-plan" role="region" aria-label="Best Sofix plan">
                    <div className="rc-th rc-plan-head"><h3>Best Sofix plan</h3><span>{Math.round(best!.essence)} expected essence · {rows.length} lineup{rows.length === 1 ? "" : "s"}</span></div>
                    <PlanLineups rows={rows} href={href("/play")} scores={actuals} paid={rewards?.sofix ? new Map(rewards.sofix.map((r) => [r.signature, r.rewards])) : undefined} />
                  </div>
                ) : plan ? (
                  <WaitingTile week={plan} now={now} meta={`Sorare GW${plan.gameweek.number}`} />
                ) : <p className="rc-none">Plan not recorded for this GW.</p>} />
              </section>
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
