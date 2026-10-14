import { describe, expect, it } from "vitest";
import { missionComparison, missionHits } from "./missionComparison";
import type { HistoryDay } from "./missionLog";

const day = (over: Partial<HistoryDay> = {}): HistoryDay => ({ day: "2026-10-09", mission: "Shots", loaded: true, sofix: [{ slug: "a", name: "A", pic: "", state: "did" }, { slug: "b", name: "B", pic: "", state: "didnt" }], yours: [{ slug: "c", name: "C", pic: "", state: "did" }, { slug: "d", name: "D", pic: "", state: "did" }], missed: [], score: { got: 1, best: 2 }, evidence: "settled", yourPicks: "recorded", ...over });
describe("mission hits, each side on its own", () => {
  const card = (state: "did" | "didnt" | "waiting" | "void") => ({ slug: state, name: state, pic: "", state });
  it("counts every settled mission a side picked for, a hit when one of its picks did it (15 Oct 2026: '5/10', per mission, not per day)", () => {
    const days = [
      day({ mission: "A", sofix: [card("did"), card("didnt")], yours: [card("didnt")] }),
      day({ mission: "B", sofix: [], yours: [card("did")] }), // Sofix had no pick: counted for you only
      day({ mission: "C", sofix: [card("didnt")], yours: [] }), // you made none: counted for Sofix only
      day({ mission: "D", sofix: [card("waiting")], yours: [card("did"), card("waiting")] }), // not settled: neither
      day({ mission: "E", sofix: [card("void")], yours: [card("void"), card("didnt")] }), // a void game drops that pick only
    ];
    expect(missionHits(days)).toEqual({ yours: { hits: 1, missions: 3 }, sofix: { hits: 1, missions: 2 } });
  });
});

describe("the owner's mission comparison", () => {
  it("compares exactly the same settled missions against the existing best-possible success rule", () => {
    expect(missionComparison([day()])).toEqual({ counted: 1, yours: { success: 1, hits: 2 }, sofix: { success: 0, hits: 1 }, best: 2 });
  });
  it("excludes pending, absent and nobody-could forecasts rather than boosting either rate", () => {
    expect(missionComparison([day({ score: null }), day({ yours: [{ slug: "c", name: "C", pic: "", state: "waiting" }] }), day({ score: { got: 0, best: 0 } }), day({ yours: [], yourPicks: "unknown" })]).counted).toBe(0);
  });
  it("excludes a void game for either side from the paired success rate", () => {
    const voidPick = { slug: "a", name: "A", pic: "", state: "void" as const };
    expect(missionComparison([day({ sofix: [voidPick] }), day({ yours: [voidPick] })]).counted).toBe(0);
  });
  it("counts a deliberate empty correction as no hits but never treats an unconfirmed import as a final no-picks choice", () => {
    expect(missionComparison([day({ yours: [], yourPicks: "user-empty" })]).yours).toEqual({ success: 0, hits: 0 });
    expect(missionComparison([day({ yours: [], yourPicks: "confirmed-empty" })]).counted).toBe(0);
  });
});
