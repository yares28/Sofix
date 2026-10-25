import { expect, it } from "vitest";
import { alternativeAddress, planAddress } from "./planNavigation";

it("legacy plan URLs retain their exact GW, source, plan and hindsight mode in Strategies", () => {
  const url = new URL(alternativeAddress({ w: "2026-10-23", gw: "old-id", plan: "2", by: "ceiling", after: "1" }), "https://example.test");
  expect(url.pathname).toBe("/audit/strategies");
  expect(Object.fromEntries(url.searchParams)).toEqual({ view: "plans", w: "2026-10-23", gw: "old-id", plan: "2", by: "ceiling", after: "1" });
});

it("plan/source choices pin the selected GW and back-to-Play drops only alternative controls", () => {
  expect(planAddress({ gw: "source-gw", by: "sorare", index: 1, after: true, alternatives: true })).toBe("/audit/strategies?view=plans&gw=source-gw&by=sorare&plan=2&after=1");
  expect(planAddress({ w: "2026-10-23", gw: "source-gw", alternatives: false })).toBe("/play?w=2026-10-23");
});

it("the first alternative has an explicit address even when another plan is recommended", () => {
  expect(planAddress({ gw: "25", index: 0, alternatives: true })).toBe("/audit/strategies?view=plans&gw=25&plan=1");
  expect(planAddress({ gw: "25", alternatives: true })).toBe("/audit/strategies?view=plans&gw=25");
});
