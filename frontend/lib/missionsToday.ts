import { isToday, plan, type MissionPlan, type MissionsModel } from "./missions";
import type { Sorare } from "./play";
import type { Sheets } from "./playerSheet";

export const RARITIES = ["limited", "rare", "super_rare", "unique"] as const;

/**
 * Whether the missions shown are today's: `today` when this rarity's list was loaded since Sorare's last reset (it may hold no mission at all),
 * `stale` when the last one is older, `never` when there is none. Missions are daily: without today's list there is nothing to show.
 */
export type MissionsStatus = "today" | "stale" | "never";

/**
 * Today's missions and the cards that fit each, for one rarity (the Missions page and the Recap share it). Each rarity has its own missions on
 * Sorare (on 6 Oct the Limited tab had the Decisive Picker and the Rare tab none), so one never borrows another's.
 */
export async function missionsToday(
  data: Sorare | null,
  missions: MissionsModel | null,
  asked: string | undefined,
  now: Date,
): Promise<{
  rarity: string;
  seen: string[];
  day: string | null;
  plans: MissionPlan[];
  status: MissionsStatus;
  /** When this rarity's list was last loaded, whatever its age. */
  seenAt: string | null;
}> {
  const sheets = (await import("./data/stat_sheets.json")).default as unknown as Sheets;
  const today = (r: string) => {
    const entry = missions?.[r];
    return entry && isToday(entry.seen_at, now) ? entry.missions.filter((m) => m.title) : null;
  };
  const seen = RARITIES.filter((r) => today(r)?.length);
  const rarity = (RARITIES as readonly string[]).includes(asked ?? "") ? (asked as string) : "limited";
  const own = today(rarity);
  const seenAt = missions?.[rarity]?.seen_at ?? null;
  const status: MissionsStatus = own ? "today" : seenAt ? "stale" : "never";
  const list = own ?? [];
  const players = data ? data.weeks.flatMap((w) => w.playing.players) : [];
  const made = list.length && data ? plan(list, rarity, players, sheets.players, now) : null;
  return { rarity, seen: [...seen], day: made?.day ?? null, plans: made?.plans ?? [], status, seenAt };
}
