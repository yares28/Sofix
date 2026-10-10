import type { Metadata } from "next";
import { connection } from "next/server";
import MissionsView from "../../components/missions/MissionsView";
import SiteNav from "../../components/SiteNav";
import { loadGrid } from "../../lib/api";
import { fillMissionDays, loadMissionLog, missionHistory, restoreMissionBenchmark } from "../../lib/missionLog";
import { loadMissionPool } from "../../lib/missionsPool";
import { loadMissions } from "../../lib/missionsData";
import { missionDay } from "../../lib/missions";
import { missionPlayers } from "../../lib/missionInventory";
import { missionsToday, RARITIES } from "../../lib/missionsToday";
import { loadSorare } from "../../lib/playData";
import { loadSystem } from "../../lib/system";
import { weekContext } from "../../lib/weeks";
import { loadPlayerSheets } from "../../lib/playerGames";

export const metadata: Metadata = { title: "Missions · Sofix" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/**
 * The daily missions Sorare has open and the cards of yours that fit each best. The missions come from the extension (it reads Sorare's Missions page in your
 * signed-in tab and sends the names and rules); the fit from the plans the job made and the stat sheets. You make the picks on Sorare.
 */
export default async function Missions({ searchParams }: { searchParams: SearchParams }) {
  await connection(); // "today" and kick-off times read the clock
  const params = await searchParams;
  const single = (key: string) => (typeof params[key] === "string" ? (params[key] as string) : undefined);
  const [data, missions, { grid, meta }, system, log, pool] = await Promise.all([loadSorare(), loadMissions(), loadGrid(), loadSystem(), loadMissionLog(), loadMissionPool()]);
  const week = weekContext(grid, data, new Date(), { w: single("w"), gw: single("gw") });
  const now = new Date();
  const today = await missionsToday(data, missions, single("rarity"), now, pool);
  const players = missionPlayers(pool?.players ?? data?.weeks.flatMap((w) => w.playing.players) ?? [], today.plans.map((p) => p.mission), today.rarity);
  const previous = log.reduce<import("../../lib/missionLog").LogRarity | undefined>((found, l) => l.days[missionDay(now)]?.[today.rarity] ?? found, undefined);
  const sheets = pool?.sheets.players ?? (await loadPlayerSheets()).players;
  const plans = restoreMissionBenchmark(today.plans.map((p) => p.mission), previous, players, sheets, today.rarity, now);
  const bestPlans = restoreMissionBenchmark(today.plans.map((p) => p.mission), previous, players, sheets, today.rarity, now, "best");
  const owned = RARITIES.filter((r) => players.some((p) => p.rarity === r) || data?.collection?.some((p) => p.rarity === r));
  const completeLog = fillMissionDays(log, [...new Set([...owned, today.rarity])], now);
  const names = new Map((data?.weeks ?? []).flatMap((w) => w.playing.players).flatMap((p) => (p.player ? [[p.player, { name: p.name, pic: p.pic }] as const] : [])));
  return (
    <>
      <SiteNav meta={meta} system={system} week={week} />
      <main className="s5-main pd">
        <MissionsView
          rarity={today.rarity}
          tabs={RARITIES.filter((r) => r === today.rarity || today.seen.includes(r) || owned.includes(r) || log.some((l) => Object.values(l.days).some((d) => d[r])))}
          day={today.day}
          plans={plans}
          bestPlans={bestPlans}
          captured={previous?.cands ?? []}
          status={today.status}
          seenAt={today.seenAt}
          retained={missions?.[today.rarity]?.missions ?? []}
          missionDay={missionDay(now)}
          now={now.toISOString()}
          history={missionHistory(completeLog, today.rarity, names)}
          bestHistory={missionHistory(completeLog, today.rarity, names, 30, "best")}
          players={players}
          pool={pool}
          collection={data?.collection ?? []}
        />
      </main>
    </>
  );
}
