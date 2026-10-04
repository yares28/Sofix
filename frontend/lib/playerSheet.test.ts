import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";
import { gameFactors, shapeBars, sheetGroups, strips, sheetTotal, type Sheet, type Sheets } from "./playerSheet";

const core = createRequire(import.meta.url)("../../extension/core.js") as {
  shapeBars: (shape: unknown, score: number, count?: number) => { h: number; kind: string }[];
};

const keeper = (over: Partial<Sheet> = {}): Sheet => ({
  pos: "GK",
  team: "getafe",
  starts: 45,
  seasonStarts: 45,
  season: { saves: [3.1, 6.2], goals_conceded: [1.0, -5.0], accurate_pass: [13.6, 1.4], clean_sheet_60: [0.31, 9.3] },
  l10: { saves: [4.0, 8.0], goals_conceded: [0.9, -4.5], accurate_pass: [14.9, 1.5] },
  last: [[29, "MLL", 0, "A", 0, 0, 0], [85, "OSA", 1, "H", 0, 0, 0], [39, "ALA", 0, "H", 0, 0, 0]],
  decAll: 0.2,
  cs: 14,
  pens: 3,
  ...over,
});

describe("the stat sheet", () => {
  it("groups the actions as Sorare does, drops the ones he hardly does and sums the points of the rest", () => {
    const groups = sheetGroups(keeper(), "all", null);
    expect(groups.map((g) => g.name)).toEqual(["Goalkeeping", "Passing"]);
    expect(groups[0]!.rows.map((r) => r.name)).toEqual(["Saves", "Goals conceded"]); // the ones that move the score most first
    expect(groups[0]!.rows[0]).toEqual({ name: "Saves", count: "3.1", points: 6.2 });
    expect(sheetTotal(keeper(), "all", null)).toBeCloseTo(6.2 - 5 + 1.4, 5); // all-around points: the clean sheet is a decisive action, not part of them
  });

  it("reads the last ten from its own column", () => {
    expect(sheetGroups(keeper(), "l10", null)[0]!.rows.find((r) => r.name === "Saves")).toEqual({ name: "Saves", count: "4.0", points: 8 });
  });

  it("leaves out an action worth under a point a start and shows at most five a group, but counts them all in the total", () => {
    const many = keeper({ season: { saves: [3, 6], dive_save: [0.6, 1.2], saved_ibox: [2, 4], punches: [0.3, 0.5], good_high_claim: [0.5, 0.9], gk_smother: [0.1, 0.8], goals_conceded: [1, -5], accurate_keeper_sweeper: [0.9, 2.5] }, l10: {} });
    const rows = sheetGroups(many, "all", null)[0]!.rows;
    expect(rows).toHaveLength(5);
    expect(rows.map((r) => r.name)).not.toContain("Punches"); // half a point
    expect(sheetTotal(many, "all", null)).toBeCloseTo(6 + 1.2 + 4 + 0.5 + 0.9 + 0.8 - 5 + 2.5, 5);
  });

  it("moves the next game's numbers with the goals his side is expected to concede, and leaves the rest as the season", () => {
    const factors = gameFactors({ goalsFor: 0.9, goalsAgainst: 2.0 });
    expect(factors).not.toBeNull();
    const next = sheetGroups(keeper(), "next", factors);
    const saves = next[0]!.rows.find((r) => r.name === "Saves")!;
    expect(saves.points).toBeCloseTo(6.2 * (2.0 / 1.3), 4); // a stronger attack: more saves, more points for them
    expect(next[1]!.rows[0]!.count).toBe("13.6"); // passing does not follow the opponent
    expect(gameFactors(null)).toBeNull();
    expect(gameFactors({ goalsFor: null, goalsAgainst: 1 })).toBeNull();
    expect(gameFactors({ goalsFor: 9, goalsAgainst: 0.01 })).toEqual({ attack: 1.6, against: 0.6 }); // never more than 60% off an average game
  });
});

describe("how he compares", () => {
  const league = (): Sheets => ({
    asOf: "2026-09-20",
    players: {
      a: keeper({ cs: 5, season: { saves: [2.0, 4], goals_conceded: [1.6, -8] } }),
      b: keeper({ cs: 10, season: { saves: [3.0, 6], goals_conceded: [1.2, -6] } }),
      c: keeper({ cs: 14, season: { saves: [3.1, 6.2], goals_conceded: [1.0, -5] } }),
      d: keeper({ cs: 20, season: { saves: [4.0, 8], goals_conceded: [0.8, -4] } }),
      few: keeper({ starts: 3, cs: 0, season: { saves: [9, 9] } }), // too few starts to count as one of the others
      def: keeper({ pos: "DEF" }),
    },
  });

  it("places him among the others of his position with eight starts or more, and says what share he beats", () => {
    const all = strips(league(), "c");
    const saves = all.find((s) => s.name === "Saves per start")!;
    expect(saves.values).toEqual([2, 3, 3.1, 4.0].map(Number));
    expect(saves.me).toBe(3.1);
    expect(saves.rank).toBe("higher than 67%"); // two of the other three
    const conceded = all.find((s) => s.name === "Goals conceded per start")!;
    expect(conceded.rank).toBe("fewer than 67%"); // fewer is better
  });

  it("has nothing for a player with no sheet", () => {
    expect(strips(league(), "nobody")).toEqual([]);
  });
});

describe("the bars of a game", () => {
  const shape = { p: 0.057, dec: 74.9, plain: 43.5, sdDec: 10, sdPlain: 14, low: 28, high: 62 };
  it("are the ones the panel draws", () => {
    expect(shapeBars(shape, 45)).toEqual(core.shapeBars(shape, 45));
    expect(shapeBars({ ...shape, p: 0.28, dec: 84, plain: 51 }, 60)).toEqual(core.shapeBars({ ...shape, p: 0.28, dec: 84, plain: 51 }, 60));
  });
});
