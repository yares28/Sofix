import type { PlanTally, PrizeKind } from "./audit";
import type { SavedWeek } from "./myWeeks";

/** A lineup's best prize, best first. A lineup counts once: XP alone is not essence, and essence is not a card. */
export const PRIZES: PrizeKind[] = ["card", "cash", "essence", "xp", "none"];
export const PRIZE_NAME: Record<PrizeKind, string> = { card: "Card", cash: "Cash", essence: "Essence", xp: "XP only", none: "Nothing" };
export type Won = Record<PrizeKind, number>;

export const share = (n: number, of: number): number | null => (of ? n / of : null);
/** Lineups that won essence or better: the prizes worth having. */
export const real = (won: Won): number => won.card + won.cash + won.essence;
export const judged = (won: Won): number => PRIZES.reduce((sum, kind) => sum + won[kind], 0);
export const NO_PLAN: PlanTally = { rank: 1, lineups: 0, scored: 0, hit: 0, judged: 0, won: { card: 0, cash: 0, essence: 0, xp: 0, none: 0 } };

/** What the lineups you entered on Sorare won, once ranked: each by its best prize. */
export function yourPrizes(saved: SavedWeek[]): Won {
  const won: Won = { card: 0, cash: 0, essence: 0, xp: 0, none: 0 };
  for (const week of saved) for (const line of week.lineups) {
    const result = line.result;
    if (line.draft || !result || result.rank === null) continue;
    won[result.card ? "card" : result.cash > 0 ? "cash" : result.essence > 0 ? "essence" : (result.xp ?? 0) > 0 ? "xp" : "none"]++;
  }
  return won;
}
