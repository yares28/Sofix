import type { Metadata } from "next";
import { connection } from "next/server";
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
  // The daily pickers Sorare lists are the same on every rarity's tab (and a tab's answer sometimes comes without the others'), so a rarity with none of its own takes the first that has.
  const named = (r: string) => (missions?.[r]?.missions ?? []).filter((m) => m.title);
  const seen = RARITIES.filter((r) => named(r).length);
  const asked = single("rarity");
  const rarity = (RARITIES as readonly string[]).includes(asked ?? "") ? (asked as string) : "limited";
  const list = named(rarity).length ? named(rarity) : named(seen[0] ?? "");
  const entry = list.length ? { missions: list, seen_at: missions?.[named(rarity).length ? rarity : (seen[0] ?? rarity)]?.seen_at ?? null } : null;
  const players = data ? data.weeks.flatMap((w) => w.playing.players) : [];
  const now = new Date();
  const made = entry && data ? plan(entry.missions, rarity, players, sheets.players, now) : null;
  return (
    <>
      <SiteNav meta={meta} system={system} week={week} />
      <main className="s5-main pd">
        <MissionsView rarity={rarity} seen={seen.length > 1 ? [...seen] : []} day={made?.day ?? null} plans={made?.plans ?? []} seenAt={entry?.seen_at ?? null} now={now.toISOString()} />
      </main>
    </>
  );
}
