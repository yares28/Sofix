import { expect, it } from "vitest";
import { enteredPortfolio, planPortfolio } from "./playPortfolio";
import type { Plan } from "./play";
import type { GameweekLineup } from "./entered";

const entry = (id: string, draft = false) => ({ id, draft, cards: [{ slug: id, name: id, picture: `https://assets.sorare.com/${id}.png` }], result: null }) as GameweekLineup;
it("uses the same additive reward and average downside measures on both portfolios, excluding drafts", () => {
  const mine = enteredPortfolio([entry("a"), entry("b"), entry("draft", true)], new Map([["a", { value: 300, estimated: false, chance: .8 }], ["b", { value: 200, estimated: true, chance: .2 }], ["draft", { value: 999, estimated: false, chance: 1 }]]));
  const plan = planPortfolio({ essence: 150, cash: 2, pAny: .95, lineups: [{ x: 300, pReturn: .8, starters: [] }, { x: 200, pReturn: .2, starters: [] }] } as unknown as Plan);
  for (const side of [mine, plan]) expect(side).toMatchObject({ lineups: 2, rated: 2, expectedPaid: 1, noReward: .5, averagePoints: 250 });
  expect(mine.cards.map(c => c.name)).toEqual(["a", "b"]);
  expect(plan.pAny).toBe(.95); // the job's joint forecast stays distinct from the mean lineup chance
});
it("keeps a known zero distinct from missing forecasts and shows a partial cohort with explicit coverage", () => {
  expect(enteredPortfolio([entry("a")], new Map([["a", { value: 0, estimated: true, chance: 0 }]]))).toMatchObject({ expectedPaid: 0, noReward: 1, averagePoints: 0 });
  expect(enteredPortfolio([entry("a"), entry("b")], new Map([["a", { value: 300, estimated: false, chance: .5 }]]))).toMatchObject({ rated: 1, pointRated:1, expectedPaid: .5, noReward: .5, averagePoints: 300 });
  expect(enteredPortfolio([], new Map())).toMatchObject({ lineups: 0, expectedPaid: null, noReward: null });
  expect(planPortfolio(null)).toMatchObject({ lineups: 0, expectedPaid: null });
});
it("uses only finite valid probabilities and limits card previews without losing lineup coverage", () => {
  const entries = Array.from({ length: 8 }, (_, i) => entry(String(i)));
  const estimates = new Map(entries.map((e,i) => [e.id, { value: 250, estimated: true, chance: i === 7 ? Number.NaN : .4 }]));
  const side = enteredPortfolio(entries, estimates);
  expect(side.lineups).toBe(8);
  expect(side.rated).toBe(7);
  expect(side.cards).toHaveLength(5);
  expect(side.expectedPaid).toBeCloseTo(2.8);
});
