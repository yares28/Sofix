import { connection } from "next/server";
import AuditView, { type AuditShow } from "./AuditView";
import SiteNav from "../SiteNav";
import { loadGrid } from "../../lib/api";
import { loadAudit } from "../../lib/auditData";
import { loadAuditStartRecord, loadSorare, loadSorareSummary } from "../../lib/playData";
import type { LeagueAudit } from "../../lib/leagueAudit";
import { loadSystem } from "../../lib/system";
import MissionHistory from "../missions/MissionHistory";
import { fillMissionDays, loadMissionLog, missionHistory } from "../../lib/missionLog";
import { RARITIES } from "../../lib/missionsToday";
import { RARITY_NAME } from "../../lib/missions";
import { myWeeksQuietly } from "../../lib/myWeeksData";
import { seasonWeeks } from "../../lib/myWeeks";
import { weekContext } from "../../lib/weeks";
import { recordedStart, savedStartGame, sideKey, withGameCrests } from "../../lib/playerScoreViews";
import { alternativeAddress } from "../../lib/planNavigation";

export type AuditSearchParams = Promise<Record<string, string | string[] | undefined>>;

/** The three Audit views share one page; each has its own address (plans/restructure.md, R7). */
export default async function AuditPlace({ show, searchParams }: { show: AuditShow; searchParams?: AuditSearchParams }) {
  await connection(); // "updated 2 h ago" reads the clock
  // Everything the view needs is read at once: one wait, not one after another.
  const [data, { grid, meta }, system, league, sorare, loadedLog, myWeeks] = await Promise.all([
    loadAudit(show !== "starts" && show !== "strategies"),
    loadGrid(),
    loadSystem(),
    import("../../lib/data/audit_league.json").then((m) => m.default as unknown as LeagueAudit),
    show === "starts" ? null : show === "xscore" ? loadSorare({ market: false }) : loadSorareSummary(),
    show === "missions" ? loadMissionLog() : [],
    show === "rewards" || show === "lineups" || show === "strategies" ? myWeeksQuietly() : null,
  ]);
  const params = await searchParams ?? {};
  const resultGw = sorare?.timeline.find(w => w.slug === params.resultsGw)?.id;
  const plansHref = alternativeAddress(resultGw ? { gw: resultGw } : params);
  const now = new Date();
  // Without a selected date, Audit opens the latest locked GW; planning defaults to the next open GW.
  const latestLocked = [...(sorare?.timeline ?? [])].filter((w) => new Date(w.lock) <= now).sort((a, b) => b.lock.localeCompare(a.lock))[0];
  const week = weekContext(grid, sorare, now, { w: typeof params.w === "string" ? params.w : null, gw: typeof params.gw === "string" ? params.gw : typeof params.w === "string" ? null : latestLocked?.id });
  const selected = sorare?.timeline.find((w) => w.id === week.current?.gw);
  const games = (sorare?.weeks ?? []).flatMap(w => w.playing.players.flatMap(p => p.games));
  const crests = new Map<string, string>();
  for (const team of grid?.teams ?? []) if (team.crest_url) crests.set(sideKey(team.name), team.crest_url);
  for (const game of games) {
    if (game.team && game.teamCrest) crests.set(sideKey(game.team), game.teamCrest);
    if (game.opponent && game.opponentCrest) crests.set(sideKey(game.opponent), game.opponentCrest);
  }
  const playerWeeks = show === "xscore" ? await Promise.all((data?.playerScores?.weeks ?? []).map(async w => {
    // Cached records restore source evidence while an older audit payload is still being served.
    const record = show === "xscore" && w.rows.some(r => r.sources === undefined) ? await loadAuditStartRecord(w.slug) : null;
    return { ...w, rows: w.rows.map(row => {
      const saved = row.sources === undefined ? savedStartGame(row, w.slug, record) : null;
      return withGameCrests({ ...row, started: recordedStart(row.started), sources: row.sources ?? saved?.sources ?? {}, ffMatch: row.ffMatch ?? saved?.ffMatch ?? null }, games, crests);
    }) };
  })) : [];
  const playerWeek = playerWeeks.find(w => w.slug === selected?.slug) ?? null;
  const owned = RARITIES.filter((r) => sorare?.collection?.some((c) => c.rarity === r) || loadedLog.some((l) => Object.values(l.days).some((d) => d[r])));
  const logs = show === "missions" ? fillMissionDays(loadedLog, owned, new Date()) : [];
  const names = new Map((sorare?.collection ?? []).map((c) => [c.player, { name: c.name, pic: c.pic }]));
  const season = (sorare?.timeline ?? [])
    .filter((week) => week.status === "done")
    .map((week) => ({ slug: week.slug, number: week.number }))
    .reverse();
  const saved = show === "rewards" || show === "lineups" ? seasonWeeks(myWeeks ?? [], new Date()) : [];
  // Card art for the week comparison: the collection's, then the pictures your saved lineups kept for cards no longer in it.
  const pics: Record<string, string> = {};
  if (show === "lineups" || show === "strategies") {
    for (const card of sorare?.collection ?? []) if (card.pic) pics[card.slug] = card.pic;
    for (const week of show === "strategies" ? seasonWeeks(myWeeks ?? [], new Date()) : saved)
      for (const lineup of week.lineups) for (const card of lineup.cards) if (card.picture && !pics[card.slug]) pics[card.slug] = card.picture;
  }
  return (
    <>
      <SiteNav meta={meta} system={system} week={show === "xscore" ? week : undefined} />
      <main className={show === "starts" ? "au au-starts-page" : "au"}>
        <AuditView plansHref={plansHref} data={data} now={new Date()} league={league} show={show} season={season} saved={saved} pics={pics} playerWeek={playerWeek} playerWeekNumber={week.current?.number ?? null} playerWeeks={playerWeeks} startParams={Object.fromEntries(Object.entries(params).map(([key, value]) => [key, typeof value === "string" ? value : undefined]))} />
        {show === "missions" ? <div className="pd-wrap">{owned.map((rarity) => <MissionHistory key={rarity} title={`${RARITY_NAME[rarity]} history`} days={missionHistory(logs, rarity, names)} rarity={rarity} collection={sorare?.collection ?? []} />)}</div> : null}
      </main>
    </>
  );
}
