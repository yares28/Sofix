import { describe, expect, it } from "vitest";
import type { Rewards } from "./audit";
import { lineupSuccess, rate } from "./lineupsAudit";
import type { SavedWeek } from "./myWeeks";

const line = (essence: number, extra: Record<string, unknown> = {}) =>
  ({ id: "a", name: null, competition: "LaLiga", board: "b", draft: false, confirmable: false, cards: [],
    result: { score: 300, rank: 10, essence, cash: 0, card: false }, ...extra }) as unknown as SavedWeek["lineups"][number];
const week = (number: number, lineups: SavedWeek["lineups"]): SavedWeek => ({ slug: `gw-${number}`, number, start: "", end: "", savedAt: "", lineups });
const side = { essence: 0, cash: 0 };
const rewards = (weeks: { gameweek: number; lineups: number; paid?: number }[]): Rewards =>
  ({ weeks: weeks.map((w) => ({ slug: `gw-${w.gameweek}`, expected: side, won: side, ...w })), lineups: 0, expected: side, won: side });

describe("the lineups success rate", () => {
  it("counts a lineup that won essence, cash or a card, yours and Sofix's each on its own", () => {
    const mine = [week(18, [line(250), line(0), line(0, { result: { score: 300, rank: 4, essence: 0, cash: 0, card: true } })]), week(17, [line(0)])];
    const got = lineupSuccess(mine, rewards([{ gameweek: 17, lineups: 3, paid: 1 }, { gameweek: 18, lineups: 2, paid: 2 }]));
    expect(got.you).toEqual({ won: 2, of: 4 });
    expect(got.sofix).toEqual({ won: 3, of: 5 });
    expect(got.weeks.map((w) => w.number)).toEqual([18, 17]);
    expect(rate(got.you)).toBe(0.5);
  });

  it("leaves out drafts, lineups not ranked yet, and a week published before the count existed", () => {
    const mine = [week(18, [line(250, { draft: true }), line(0, { result: null }), line(0, { result: { score: 10, rank: null, essence: 0, cash: 0, card: false } })])];
    const got = lineupSuccess(mine, rewards([{ gameweek: 18, lineups: 2 }]));
    expect(got.weeks).toEqual([]);
    expect(rate(got.you)).toBeNull();
    expect(rate(got.sofix)).toBeNull();
  });
});
