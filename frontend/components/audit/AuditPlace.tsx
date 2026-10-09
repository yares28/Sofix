import { connection } from "next/server";
import AuditView, { type AuditShow } from "./AuditView";
import SiteNav from "../SiteNav";
import { loadGrid } from "../../lib/api";
import { loadAudit } from "../../lib/auditData";
import { loadSorare } from "../../lib/playData";
import type { LeagueAudit } from "../../lib/leagueAudit";
import { loadSystem } from "../../lib/system";
import MissionHistory from "../missions/MissionHistory";
import { fillMissionDays, loadMissionLog, missionHistory } from "../../lib/missionLog";
import { RARITIES } from "../../lib/missionsToday";
import { RARITY_NAME } from "../../lib/missions";
import { myWeeksQuietly } from "../../lib/myWeeksData";
import { seasonWeeks } from "../../lib/myWeeks";

/** The three Audit views share one page; each has its own address (plans/restructure.md, R7). */
export default async function AuditPlace({ show }: { show: AuditShow }) {
  await connection(); // "updated 2 h ago" reads the clock
  const [data, { meta }, system] = await Promise.all([loadAudit(), loadGrid(), loadSystem()]);
  const league = (await import("../../lib/data/audit_league.json")).default as unknown as LeagueAudit;
  // Rewards reads what you won week by week: the season's finished Sorare gameweeks, newest first
  const sorare = show === "rewards" || show === "missions" ? await loadSorare() : null;
  const loadedLog = show === "missions" ? await loadMissionLog() : [];
  const owned = RARITIES.filter((r) => sorare?.collection?.some((c) => c.rarity === r) || loadedLog.some((l) => Object.values(l.days).some((d) => d[r])));
  const logs = show === "missions" ? fillMissionDays(loadedLog, owned, new Date()) : [];
  const names = new Map((sorare?.collection ?? []).map((c) => [c.player, { name: c.name, pic: c.pic }]));
  const season = (sorare?.timeline ?? [])
    .filter((week) => week.status === "done")
    .map((week) => ({ slug: week.slug, number: week.number }))
    .reverse();
  const saved = show === "rewards" ? seasonWeeks(await myWeeksQuietly() ?? [], new Date()) : [];
  return (
    <>
      <SiteNav meta={meta} system={system} />
      <main className="au">
        <AuditView data={data} now={new Date()} league={league} show={show} season={season} saved={saved} />
        {show === "missions" ? <div className="pd-wrap">{owned.map((rarity) => <MissionHistory key={rarity} title={`${RARITY_NAME[rarity]} history`} days={missionHistory(logs, rarity, names)} rarity={rarity} collection={sorare?.collection ?? []} />)}</div> : null}
      </main>
    </>
  );
}
