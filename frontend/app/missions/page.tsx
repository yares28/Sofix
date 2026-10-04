import type { Metadata } from "next";
import { connection } from "next/server";
import SorareSubnav from "../../components/cards/SorareSubnav";
import MissionsView from "../../components/missions/MissionsView";
import SiteNav from "../../components/SiteNav";
import { loadGrid } from "../../lib/api";
import { plan } from "../../lib/missions";
import { loadMissions } from "../../lib/missionsData";
import { loadSorare } from "../../lib/playData";
import type { Sheets } from "../../lib/playerSheet";
import { loadSystem } from "../../lib/system";
import { weekContext } from "../../lib/weeks";

export const metadata: Metadata = { title: "Missions · Sofix" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;
const RARITIES = ["limited", "rare", "super_rare", "unique"] as const;

/**
 * The daily missions Sorare has open and the cards of yours that fit each best. The missions come from the extension (it reads Sorare's Missions page in your
 * signed-in tab and sends the names and rules); the fit from the plans the job made and the stat sheets. You make the picks on Sorare.
 */
export default async function Missions({ searchParams }: { searchParams: SearchParams }) {
  await connection(); // "today" and kick-off times read the clock
  const params = await searchParams;
  const single = (key: string) => (typeof params[key] === "string" ? (params[key] as string) : undefined);
  const [data, missions, { grid, meta }, system] = await Promise.all([loadSorare(), loadMissions(), loadGrid(), loadSystem()]);
  const sheets = (await import("../../lib/data/stat_sheets.json")).default as unknown as Sheets;
  const week = weekContext(grid, data, new Date(), { w: single("w"), gw: single("gw") });
  const seen = RARITIES.filter((r) => missions?.[r]?.missions.length);
  const asked = single("rarity");
  const rarity = (RARITIES as readonly string[]).includes(asked ?? "") && seen.includes(asked as (typeof RARITIES)[number]) ? (asked as string) : (seen[0] ?? "limited");
  const entry = missions?.[rarity];
  const players = data ? data.weeks.flatMap((w) => w.playing.players) : [];
  const now = new Date();
  const made = entry && data ? plan(entry.missions, rarity, players, sheets.players, now) : null;
  return (
    <>
      <SiteNav meta={meta} system={system} week={week} />
      <main className="s5-main pd">
        <SorareSubnav />
        <MissionsView rarity={rarity} seen={[...seen]} day={made?.day ?? null} plans={made?.plans ?? []} seenAt={entry?.seen_at ?? null} now={now.toISOString()} />
      </main>
    </>
  );
}
