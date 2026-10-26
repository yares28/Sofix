import { expect, it } from "vitest";
import { enteredPortfolio, enteredRewardRows, paidBySorare, planPortfolio } from "./playPortfolio";
import { rewardShort } from "./playRewards";
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
it("keeps the projection and adds the score so far and the prize it reaches once the GW locks", () => {
  const tiers = [{ need: 300, p: .3, essence: 30 }, { need: 400, p: 0, cash: 5 }];
  const line = { board: "b", x: 320, pReturn: .5, rarity: "limited", kind: "x", tiers, captainBonus: .5, clubBonus: null, averageBonus: null,
    starters: [{ slug: "c", mult: 1, captain: true, club: null, average: 50 }], subs: [] };
  const plan = { lineups: [line] } as unknown as Plan;
  expect(planPortfolio(plan)).toMatchObject({ averagePoints: 320, actualPoints: null, live: false });
  // 280 × (1 + .5 captain) = 420: past the 400 tier even though its pre-lock chance was 0
  const live = planPortfolio(plan, null, { c: { score: 280, played: true } });
  expect(live).toMatchObject({ averagePoints: 320, actualPoints: 420, actualRated: 1, live: true, rewardLive: true });
  expect(live.rewardActual?.values["cash:USD"]).toBe(5);
  // a checked reward replaces the one at the score so far
  const checked = planPortfolio(plan, { slug: "s", state: "checked", sofix: [{ signature: "b|c:1", rewards: { "cash:USD": 2 } }] }, { c: { score: 280, played: true } });
  expect(checked).toMatchObject({ rewardLive: false });
  expect(checked.rewardActual?.values["cash:USD"]).toBe(2);

  const scored = { ...entry("a"), result: { score: 310, rank: null, cash: 0, essence: 0, card: false } } as GameweekLineup;
  const forecasts = new Map([["a", { value: 290, estimated: false, chance: .4, prizeLine: line as never }]]);
  expect(enteredPortfolio([scored], forecasts)).toMatchObject({ averagePoints: 290, actualPoints: null, live: false });
  const mine = enteredPortfolio([scored, entry("b")], forecasts, { you: [{ id: "b", rewards: { "cash:USD": 1 } }] }, true);
  expect(mine).toMatchObject({ averagePoints: 290, actualPoints: 310, actualRated: 1, live: true, rewardLive: true });
  expect(mine.rewardActual).toMatchObject({ checked: 2, total: 2 });
  expect(mine.rewardActual?.values["essence:limited:x"]).toBe(30);
  expect(mine.rewardActual?.values["cash:USD"]).toBe(1);
});
it("gives each entered lineup its projected prize and, once locked, its checked or so-far prize, as the header adds them", () => {
  const line = { board: "b", x: 0, rarity: "limited", kind: "x", tiers: [{ need: 300, p: .3, essence: 30 }, { need: 400, p: .1, cash: 5 }] };
  const scored = { ...entry("a"), result: { score: 410, rank: 11545, cash: 0, essence: 0, card: false } } as GameweekLineup;
  const forecasts = new Map<string, Parameters<typeof enteredRewardRows>[1] extends Map<string, infer F> ? F : never>([["a", { value: 290, estimated: false, atScore: {}, prizeLine: line as never }], ["b", { value: 350, estimated: false, atScore: { "essence:limited:x": 30 } }]]);
  expect(enteredRewardRows([scored], forecasts)).toEqual([{ projected: {}, won: null, soFar: false }]);
  const rows = enteredRewardRows([scored, entry("b"), entry("d", true)], forecasts, { you: [{ id: "b", rewards: { "essence:limited:x": 30 } }] }, true);
  expect(rows).toEqual([{ projected: {}, won: { "cash:USD": 5 }, soFar: true }, { projected: { "essence:limited:x": 30 }, won: { "essence:limited:x": 30 }, soFar: false }]);
  expect(rewardShort({ "cash:USD": 5, "essence:limited:x": 30, "xp:FOOTBALL_XP": 2500, card: 1 })).toBe("$5.00 · 30 essence · a card · 2,500 XP");
  expect(rewardShort({})).toBe("No prize");
  expect(rewardShort(null)).toBe("—");
});
it("counts what Sorare paid a ranked lineup as won when the reward check has not run", () => {
  const paid = { ...entry("a"), result: { score: 313, rank: 1204, cash: 2.5, essence: 250, card: false } } as GameweekLineup;
  expect(enteredRewardRows([paid], new Map(), null, true)).toEqual([{ projected: null, won: { "cash:USD": 2.5, "essence:unknown:unknown": 250 }, soFar: false }]);
  expect(paidBySorare({ score: 300, rank: 9, cash: 0, essence: 0, card: false })).toBeNull();
});
