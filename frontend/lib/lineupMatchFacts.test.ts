import { describe, expect, it } from "vitest";
import type { FixtureGrid } from "./types";
import type { LineupMatch } from "./lineups";
import { lineupMatchFacts } from "./lineupMatchFacts";

const match = { id: 12, competition: "laliga", round: 8, home: { club: "MAL" }, away: { club: "ESP" } } as LineupMatch;
const grid = { teams: [{ code: "MAL", cells: Array.from({ length: 8 }, (_, index) => index === 7 ? [
  { opponent_code: "ESP", venue: "H", market: { win: 0.4 }, prediction: { xg_for: 1.2 } },
  { opponent_code: "ESP", venue: "A", market: { win: 0.1 }, prediction: null },
] : []) }] } as unknown as FixtureGrid;

describe("lineupMatchFacts", () => {
  it("uses only the matching home fixture in the same round", () => {
    expect(lineupMatchFacts([match], grid)[12]?.market?.win).toBe(0.4);
    expect(lineupMatchFacts([{ ...match, round: 7 }], grid)).toEqual({});
    expect(lineupMatchFacts([{ ...match, competition: "champions" }], grid)).toEqual({});
    expect(lineupMatchFacts([{ ...match, away: { ...match.away, club: "GET" } }], grid)).toEqual({});
  });

  it("does not show odds without a matching grid", () => {
    expect(lineupMatchFacts([match], null)).toEqual({});
  });
});
