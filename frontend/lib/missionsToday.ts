import { plan, type MissionPlan, type MissionsModel } from "./missions";
import type { Sorare } from "./play";
import type { Sheets } from "./playerSheet";

export const RARITIES = ["limited", "rare", "super_rare", "unique"] as const;

/**
 * Today's missions and the cards that fit each, for one rarity (the Missions page and the Recap share it). The daily
 * pickers Sorare lists are the same on every rarity's tab (and a tab's answer sometimes comes without the others'), so a
 * rarity with none of its own takes the first that has.
 */
export async function missionsToday(
  data: Sorare | null,
  missions: MissionsModel | null,
  asked: string | undefined,
  now: Date,
): Promise<{ rarity: string; seen: string[]; day: string | null; plans: MissionPlan[]; seenAt: string | null }> {
  const sheets = (await import("./data/stat_sheets.json")).default as unknown as Sheets;
  const named = (r: string) => (missions?.[r]?.missions ?? []).filter((m) => m.title);
  const seen = RARITIES.filter((r) => named(r).length);
  const rarity = (RARITIES as readonly string[]).includes(asked ?? "") ? (asked as string) : "limited";
  const own = named(rarity).length > 0;
  const list = own ? named(rarity) : named(seen[0] ?? "");
  const seenAt = list.length ? (missions?.[own ? rarity : (seen[0] ?? rarity)]?.seen_at ?? null) : null;
  const players = data ? data.weeks.flatMap((w) => w.playing.players) : [];
  const made = list.length && data ? plan(list, rarity, players, sheets.players, now) : null;
  return { rarity, seen: [...seen], day: made?.day ?? null, plans: made?.plans ?? [], seenAt };
}
