import { describe, expect, it } from "vitest";
import { judged, real, share, yourPrizes } from "./lineupsAudit";
import type { SavedWeek } from "./myWeeks";

const line = (result: Record<string, unknown> | null, draft = false) =>
  ({ id: "a", name: null, competition: "LaLiga", board: "b", draft, confirmable: false, cards: [],
    result: result && { score: 300, rank: 10, essence: 0, cash: 0, card: false, ...result } }) as unknown as SavedWeek["lineups"][number];
const week = (lineups: SavedWeek["lineups"]): SavedWeek => ({ slug: "gw", number: 18, start: "", end: "", savedAt: "", lineups });

describe("what your lineups won", () => {
  it("counts each lineup once, by its best prize: XP alone is not essence", () => {
    const won = yourPrizes([week([line({ essence: 250, xp: 500 }), line({ xp: 500 }), line({}), line({ card: true, essence: 250 }), line({ cash: 2 })])]);
    expect(won).toEqual({ card: 1, cash: 1, essence: 1, xp: 1, none: 1 });
    expect(real(won)).toBe(3);
    expect(share(real(won), judged(won))).toBe(0.6);
  });

  it("leaves out drafts and lineups not ranked yet, and gives no rate from nothing", () => {
    const won = yourPrizes([week([line({ essence: 250 }, true), line(null), line({ rank: null })])]);
    expect(judged(won)).toBe(0);
    expect(share(real(won), judged(won))).toBeNull();
  });
});
