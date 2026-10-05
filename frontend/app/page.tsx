import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import AwayWeek from "../components/AwayWeek";
import { BestCards, MissionsGlance, PlanLineups, RoundBoard, TableAfter, WeekNews } from "../components/recap/Recap";
import SorareTiles, { WaitingTile } from "../components/home/SorareTiles";
import SorareRow from "../components/home/SorareRow";
import SiteNav from "../components/SiteNav";
import { loadGrid } from "../lib/api";
import { legacyBoardUrl, openingColumn } from "../lib/grid";
import { boardHref, dateRange } from "../lib/home";
import { lineupsGlance } from "../lib/lineups";
import { loadLineups } from "../lib/lineupsData";
import { loadMissions } from "../lib/missionsData";
import { missionsToday } from "../lib/missionsToday";
import { bestCards, lockText, planRows, roundBoard, tableAfter, weekNews } from "../lib/recap";
import { readLabel } from "../lib/lineups";
import { nextWeek, weekPlan } from "../lib/play";
import { loadSorare } from "../lib/playData";
import { weekContext, weekDates } from "../lib/weeks";
import { loadSystem } from "../lib/system";

export const metadata: Metadata = { title: "Sofix" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/**
 * Home: the gameweek (the week in the top bar, the opening one by default), its hero number, the three board
 * tiles and the Sorare row. Everything comes from the cached grid, so the home costs no extra database reads.
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

  const [{ grid, meta, error }, system, sorare, lineups, missions] = await Promise.all([
    loadGrid(),
    loadSystem(),
    loadSorare(),
    loadLineups(),
    loadMissions(),
  ]);
  const opening = grid ? openingColumn(grid) : 0;
  const week = weekContext(grid, sorare, new Date(), {
    w: params.get("w"),
    md: Number(params.get("gw")) || (grid?.matchdays[opening]?.number ?? null),
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
  const away = params.has("w") && week.current?.column === null ? week.current : null;
  const column = week.current?.column ?? opening;
  const href = (path: string) => boardHref(path, grid, column, opening);
  const awayPlan = away && sorare && away.gw ? weekPlan(sorare, away.gw) : null;
  const selectedSorare =
    sorare && week.current?.gw
      ? (sorare.timeline.find((item) => item.id === week.current?.gw) ?? weekPlan(sorare, week.current.gw)?.gameweek ?? null)
      : null;
  const now = new Date();
  // The Sorare week of the Recap: the one in the top bar, else the one being planned.
  const plan = sorare ? ((week.current?.gw ? weekPlan(sorare, week.current.gw) : null) ?? nextWeek(sorare)) : null;
  const rows = plan?.plans[0] ? planRows(plan.plans[0]) : [];
  const news = plan ? weekNews(plan.playing.players, week.current?.md ?? null, now) : { hurt: [], back: [] };
  const today = await missionsToday(sorare, missions, undefined, now);
  const md = grid.matchdays[column]!;
  const lineupsHref = href("/lineups");

  return (
    <>
      <SiteNav meta={meta} system={system} week={week} />
      <main className="hm rc">
        {away ? (
          <AwayWeek plan={awayPlan} variant="fixtures" dates={weekDates(away)} />
        ) : (
          <header className="rc-head">
            <div>
              <h1>{plan ? `Gameweek ${plan.gameweek.number}` : `LaLiga round ${md.number}`}</h1>
              <p>
                {plan ? `LaLiga round ${md.number} · ` : ""}
                {dateRange(md.date_from, md.date_to)}
              </p>
            </div>
            {plan ? (
              <div className="rc-act">
                <span className="rc-pill">{lockText(plan.gameweek.lock, now)}</span>
                <Link className="rc-btn" href={href("/play")}>Open the plan</Link>
              </div>
            ) : null}
          </header>
        )}
        {plan ? <BestCards cards={bestCards(plan.playing.players)} gw={plan.gameweek.number} /> : null}
        <div className="rc-grid">
          {!away ? (
            <>
              <RoundBoard matches={roundBoard(grid, column)} href={href("/fixtures")} />
              <TableAfter rows={tableAfter(grid, column)} round={md.number} href={href("/table")} />
            </>
          ) : null}
          {sorare && plan ? (
            <>
              <section className="hm-tile rc-lineups" aria-labelledby="rc-lu-h">
                <div className="rc-th">
                  <h2 id="rc-lu-h">Your lineups</h2>
                  <span>Sorare GW{plan.gameweek.number}</span>
                  <Link href={href("/play")}>{rows.length ? `See all ${rows.length}` : "Plan"} ›</Link>
                </div>
                {rows.length ? (
                  <PlanLineups rows={rows} show={3} href={href("/play")} />
                ) : (
                  <WaitingTile week={plan} now={now} meta={`Sorare GW${plan.gameweek.number}`} />
                )}
              </section>
              <MissionsGlance plans={today.plans} day={today.day} href={href("/missions")} />
              <WeekNews hurt={news.hurt} back={news.back} readAt={plan.teamNews?.readAt ? readLabel(plan.teamNews.readAt, now) : null} href={lineupsHref} />
            </>
          ) : null}
        </div>
        {/* The Sorare row as it was: your entered lineups, the plan, team news, the week just played and the collection. */}
        <div className={`hm-bento${away ? " hm-away" : ""}`}>
          {sorare ? <SorareTiles data={sorare} selected={selectedSorare} now={now} glance={lineupsGlance(lineups, now)} /> : <SorareRow />}
        </div>
      </main>
    </>
  );
}
