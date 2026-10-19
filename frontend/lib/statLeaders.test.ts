import { describe, expect, it } from "vitest";
import { leaders, statGroups, statLabel, statPlayers, statValue } from "./statLeaders";
import type { Sheet, Sheets } from "./playerSheet";
import type { MarketPlayer } from "./play";

const sheet = (starts: number, season: Sheet["season"]): Sheet => ({ pos: "FWD", team: "t", starts, season, seasonStarts: starts, l10: {}, last: [], decAll: 0, cs: 0, pens: 0 });
const market = (slug: string): MarketPlayer => ({ slug, name: slug.toUpperCase(), pos: "FWD", club: "Club", crest: null, average: 50, projection: null, eur: null, pic: `https://assets.sorare.com/${slug}.png` });

const sheets: Sheets = {
  asOf: "2026-10-15",
  players: {
    a: sheet(25, { goals: [0.9, 30], accurate_pass: [20, 2] }),
    b: sheet(4, { goals: [1.2, 40] }),
    c: sheet(30, { goals: [0.9, 30], brand_new_stat: [1, 1] }),
    gone: sheet(40, { goals: [2, 60] }),
  },
};
const players = statPlayers(sheets, [market("a"), market("b"), market("c")]);

describe("stat leaders", () => {
  it("ranks current LaLiga players by their mean per start, highest first, more starts first on a tie", () => {
    expect(leaders(players, "goals", 3).map((p) => [p.slug, p.value])).toEqual([["b", 1.2], ["c", 0.9], ["a", 0.9]]);
  });
  it("leaves out players under the starts asked for and those with no number for the action", () => {
    expect(leaders(players, "goals", 10).map((p) => p.slug)).toEqual(["c", "a"]);
    expect(leaders(players, "accurate_pass", 3).map((p) => p.slug)).toEqual(["a"]);
  });
  it("offers only the actions some player has, an unknown one under Other by its words", () => {
    expect(statGroups(players)).toEqual([
      { name: "Attacking", stats: [{ key: "goals", label: "Goals" }] },
      { name: "Passing", stats: [{ key: "accurate_pass", label: "Accurate passes" }] },
      { name: "Other", stats: [{ key: "brand_new_stat", label: "Brand new stat" }] },
    ]);
    expect(statLabel("double_double")).toBe("Double-doubles");
  });
  it("prints two decimals under ten and one above", () => {
    expect([statValue(0.915), statValue(84.53)]).toEqual(["0.92", "84.5"]);
  });
});
