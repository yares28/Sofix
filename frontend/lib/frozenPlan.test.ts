import { expect, it } from "vitest";
import recorded from "../e2e/fixtures/sorare-response.json";
import { restoreFrozenPlan } from "./frozenPlan";
import type { GameweekPlan, Sorare } from "./play";

it("restores display fields without changing the pre-lock scores or requiring omitted optimizer lists", () => {
  const data = recorded.data as unknown as Sorare;
  const week = structuredClone(data.weeks[1]!);
  const bare = Object.fromEntries(Object.entries(week).filter(([key]) => !["playable", "blocked", "notWorth"].includes(key))) as GameweekPlan;
  const card = bare.plans[0]!.lineups[0]!.starters[0]!;
  card.pic = "";
  const restored = restoreFrozenPlan(bare as GameweekPlan, data);
  expect(restored.playable).toEqual([]);
  expect(restored.plans[0]!.lineups[0]!.starters[0]!.pic).toBeTruthy();
  expect(restored.plans[0]!.lineups[0]!.starters[0]!.x).toBe(card.x);
  expect(restored.gameweek).toEqual(week.gameweek);
});
