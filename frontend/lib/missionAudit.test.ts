import { describe, expect, it } from "vitest";
import { missionSummary, type MissionAuditRow } from "./missionAudit";

const row = (overrides: Partial<MissionAuditRow> = {}): MissionAuditRow => ({ id: "a", day: "2026-10-06", rarity: "limited", mission: "Goals", state: "checked", best: 3, sofix: 1, yours: 2, slots: 3, replay: false, corrected: false, reward: { unit: "Essence", each: 50, full: 500 }, ...overrides });

describe("mission comparison", () => {
  it("pairs all three on exactly the same missions, never interpreting missing own picks as zero", () => {
    const summary = missionSummary([row(), row({ id: "b", yours: null, sofix: 3 })], "paired");
    expect(summary.cases).toBe(1);
    expect(summary).toMatchObject({ yours: 2, sofix: 1, best: 3 });
    expect(summary.rewards[0]).toMatchObject({ yours: 100, sofix: 50, best: 500, cases: 1 });
  });
  it("keeps confirmed zero-opportunity cases out of the rate denominator without hiding their record", () => {
    const summary = missionSummary([row({ best: 0, yours: 0, sofix: 0 })], "paired");
    expect(summary).toMatchObject({ cases: 1, best: 0, opportunities: 0, yours: 0, sofix: 0 });
  });
  it("excludes incomplete and reconstructed comparisons but retains independently known owner results", () => {
    const summary = missionSummary([row({ state: "incomplete", best: null, sofix: null, yours: 1 }), row({ state: "reconstructed" })], "sofix");
    expect(summary.cases).toBe(0);
    expect(summary.own).toMatchObject({ cases: 2, hits: 3 });
  });
  it("keeps reward units and rarities apart and does not fill absent reward terms with zero", () => {
    const summary = missionSummary([row(), row({ id: "b", rarity: "rare" }), row({ id: "c", reward: null })], "paired");
    expect(summary.rewards).toHaveLength(2);
    expect(summary.rewardUnknown).toBe(1);
    expect(summary.rewards.map(r => r.rarity)).toEqual(["limited", "rare"]);
  });
});
