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

it("restores the card art of the Pro boards' groups, as for the plan's lineups (2 Nov 2026: LaLiga Pro showed initials)", () => {
  const data = recorded.data as unknown as Sorare;
  const week = structuredClone(data.weeks[1]!);
  const owned = (data.collection ?? []).find((c) => c.pic)!;
  const starter = { ...week.plans[0]!.lineups[0]!.starters[0]!, slug: owned.slug, pic: "" };
  const bare = { ...week, pro: [{ comp: "LaLiga Pro", key: "LALIGA | Pro", steps: [{ level: 2, target: 380, cash: 0, essence: 0 }], windows: [{ from: "2026-11-01T17:30:00Z", to: "2026-11-01T17:30:00Z", x: 297, boost: 1, allStart: 0.3, ifStart: [0.04], wait: [0.03], starters: [starter] }] }] } as GameweekPlan;
  expect(restoreFrozenPlan(bare, data).pro![0]!.windows[0]!.starters[0]!.pic).toBe(owned.pic);
});
