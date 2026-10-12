import type { Rewards } from "./audit";
import type { SavedWeek } from "./myWeeks";

/** Lineups that won a reward, out of the lineups that finished. */
export type Tally = { won: number; of: number };
export type LineupWeek = { number: number; you: Tally | null; sofix: Tally | null };

export const rate = (tally: Tally | null): number | null => (tally && tally.of ? tally.won / tally.of : null);
const sum = (tallies: (Tally | null)[]): Tally => tallies.reduce<Tally>((all, t) => (t ? { won: all.won + t.won, of: all.of + t.of } : all), { won: 0, of: 0 });

/**
 * Audit · Lineups: a lineup is a success when it won a reward (essence, cash or a card), all or nothing. Yours are the lineups you
 * entered on Sorare, once ranked; Sofix's are its plan's for each finished week the job kept. Newest week first.
 */
export function lineupSuccess(saved: SavedWeek[], rewards: Rewards): { you: Tally; sofix: Tally; weeks: LineupWeek[] } {
  const weeks = new Map<number, LineupWeek>();
  const row = (number: number) => weeks.get(number) ?? weeks.set(number, { number, you: null, sofix: null }).get(number)!;
  for (const week of saved) {
    const final = week.lineups.filter((line) => !line.draft && line.result && line.result.rank !== null);
    if (!final.length) continue;
    row(week.number).you = { won: final.filter((line) => line.result!.essence > 0 || line.result!.cash > 0 || line.result!.card).length, of: final.length };
  }
  for (const week of rewards.weeks) {
    // A page published before the paid lineups were counted has no figure for the week, not a zero.
    if (week.paid !== undefined && week.lineups) row(week.gameweek).sofix = { won: week.paid, of: week.lineups };
  }
  const rows = [...weeks.values()].sort((a, b) => b.number - a.number);
  return { you: sum(rows.map((r) => r.you)), sofix: sum(rows.map((r) => r.sofix)), weeks: rows };
}
