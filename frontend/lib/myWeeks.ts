import { z } from "zod";
import type { GameweekLineup } from "./entered";

export const MY_WEEK_PREFIX = "my_week:";
export const MY_WEEKS_TAG = "my-weeks";
export const SETTLE_MS = 86_400_000;
export const WeekSlug = z.string().regex(/^[a-z0-9][a-z0-9-]{0,80}$/);
const text = z.string().min(1).max(200);
const amount = z.number().finite().min(0).max(1_000_000);
export const WeekBody = z.object({ slug: WeekSlug, lineups: z.array(z.object({
  id: text, name: z.string().max(200).nullable(), draft: z.boolean(), confirmable: z.boolean(),
  board: text.nullable(), competition: text,
  result: z.object({ score: amount, rank: z.number().int().positive().nullable(), cash: amount, essence: amount, card: z.boolean(), xp: amount.optional() }).nullable(),
  cards: z.array(z.object({ slug: text, name: text, picture: z.string().url().max(2048).nullable(), rarity: text.nullable(), score: z.number().finite().min(0).max(1000).nullable(), captain: z.boolean() })).max(15),
})).max(128) });

export type SavedWeek = {
  slug: string; number: number; start: string; end: string; savedAt: string;
  lineups: (Omit<GameweekLineup, "cards"> & { cards: (GameweekLineup["cards"][number] & { player: string | null })[] })[];
};
export type FinishedWeek = { slug: string; number: number; start: string; end: string };
export type MyWeeks = { weeks: SavedWeek[]; pending: FinishedWeek[] };
export type CardReturn = { lineups: number; weeks: number; essence: number; cash: number };

export function finished(end: string, now = Date.now()): boolean {
  const at = Date.parse(end);
  return Number.isFinite(at) && now > at + SETTLE_MS;
}
export function seasonWeeks(weeks: SavedWeek[], now: Date): SavedWeek[] {
  const year = now.getUTCFullYear() - Number(now.getUTCMonth() < 6);
  const start = Date.UTC(year, 6, 1), end = Date.UTC(year + 1, 6, 1);
  return weeks.filter((week) => Date.parse(week.start) >= start && Date.parse(week.start) < end);
}
/** A lineup's full reward is credited as participation to each card, never divided or added across cards. */
export function cardReturns(weeks: SavedWeek[]): Record<string, CardReturn> {
  const result: Record<string, CardReturn> = {};
  const seen = new Map<string, Set<string>>();
  for (const week of weeks) for (const lineup of week.lineups) {
    if (lineup.draft || !lineup.result || lineup.result.rank === null) continue;
    for (const slug of new Set(lineup.cards.map((card) => card.slug))) {
      const row = result[slug] ??= { lineups: 0, weeks: 0, essence: 0, cash: 0 };
      const played = seen.get(slug) ?? new Set<string>(); played.add(week.slug); seen.set(slug, played);
      row.lineups++; row.weeks = played.size;
      row.essence += lineup.result.essence;
      row.cash = Math.round((row.cash + lineup.result.cash) * 100) / 100;
    }
  }
  return result;
}
