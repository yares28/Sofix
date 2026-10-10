import { describe, expect, it } from "vitest";
import { missionComparison } from "./missionComparison";
import type { HistoryDay } from "./missionLog";

const day = (over: Partial<HistoryDay> = {}): HistoryDay => ({ day: "2026-10-09", mission: "Shots", loaded: true, sofix: [{ slug: "a", name: "A", pic: "", state: "did" }, { slug: "b", name: "B", pic: "", state: "didnt" }], yours: [{ slug: "c", name: "C", pic: "", state: "did" }, { slug: "d", name: "D", pic: "", state: "did" }], missed: [], score: { got: 1, best: 2 }, evidence: "settled", yourPicks: "recorded", ...over });
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
