import { expect, it } from "vitest";
import { weekRewards } from "./weekRewards";

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
