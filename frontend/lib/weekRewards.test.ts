import { expect, it } from "vitest";
import { checkedWeekRewards, planForRewards, weekRewards } from "./weekRewards";
import type { Plan } from "./play";
import { projectedPrize, rewardSignature } from "./playRewards";

it("keeps reward units separate and counts unknown forecasts and checked zero results honestly", () => {
  const summary = weekRewards([
    { expected: { "cash:USD": 1.25, "essence:limited:laliga": 12.5, card: .1 }, actual: {} },
    { expected: { "cash:USD": 0, "essence:rare:laliga": 4, card: 0 }, actual: { "cash:USD": 5 } },
    { expected: undefined, actual: null },
  ]);
  expect(summary.expected["cash:USD"]).toBe(1.25);
  expect(summary.expected["essence:limited:laliga"]).toBe(12.5);
  expect(summary.expected["essence:rare:laliga"]).toBe(4);
  expect(summary.coverage["cash:USD"]).toBe(2);
  expect(summary.actual).toMatchObject({ checked: 2, total: 3, values: { "cash:USD": 5, card: 0 } });
  expect(weekRewards([{ actual: null }]).actual.values["cash:USD"]).toBeNull();
  expect(weekRewards([]).expected["cash:USD"]).toBeNull();
});

it("retains checked owner rewards when a newer private read is empty, without inventing a forecast", () => {
  expect(checkedWeekRewards([], [{ id: "saved", rewards: { "cash:USD": 5 } }, { id: "zero", rewards: {} }])).toMatchObject({
    total: 2, expected: { "cash:USD": null }, actual: { checked: 2, total: 2, values: { "cash:USD": 5 } },
  });
  const summary = checkedWeekRewards([{ id: "saved", expected: { "cash:USD": 1 }, actual: { "cash:USD": 4 } }], [{ id: "saved", rewards: {} }]);
  expect(summary.total).toBe(1);
  expect(summary.actual.values["cash:USD"]).toBe(0);
});

it("matches settled prizes to the retained recommendation rather than a changed replay", () => {
  const original = { rank: 1, lineups: [{ board: "original", starters: [], subs: [] }] } as unknown as Plan;
  const replay = { rank: 1, lineups: [{ board: "replay", starters: [], subs: [] }] } as unknown as Plan;
  expect(planForRewards(replay, [original], { slug: "s", state: "checked", sofix: [{ signature: rewardSignature(original.lineups[0]!), rewards: {} }] })).toBe(original);
  expect(planForRewards(replay, [original], null)).toBe(replay);
});

it("adds attainable prize tiers, including known no-prize lineups, without probability weighting", () => {
  const line = { x: 310, group: "Classic" as const, rarity: "limited", kind: "laliga", tiers: [{ need: 250, p: .288, essence: 250 }, { need: 400, p: .002, cash: 5 }] };
  const prize = projectedPrize(line);
  const summary = weekRewards([{ expected: prize }, { expected: projectedPrize({ ...line, x: 100 }) }, { expected: null }]);
  expect(summary.expected["cash:USD"]).toBe(0);
  expect(summary.expected["essence:limited:laliga"]).toBe(250);
  expect(summary.expected["xp:FOOTBALL_XP"]).toBe(0);
  expect(summary.coverage["cash:USD"]).toBe(2);
});
