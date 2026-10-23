import { describe, expect, it } from "vitest";
import { fit } from "./missions";
import type { PlayingPlayer } from "./play";
import type { Sheet } from "./playerSheet";

describe("decisive odds independent of availability", () => {
  const rule = { kind: "decisive", label: "a decisive action" } as const;
  it("uses the conditional model even when dated history exists, including zero", () => {
    const sheet = { form: { recent: [], windows: {} } } as unknown as Sheet;
    for (const pStart of [0, 0.2, 1]) {
      expect(fit(rule, { pStart, pOn: 0.1, shape: { p: 0.65 } } as PlayingPlayer, sheet)?.chance).toBe(0.65);
      expect(fit(rule, { pStart, shape: { p: 0 } } as PlayingPlayer, sheet)?.chance).toBe(0);
    }
  });
  it("falls back to starter history, never mixes substitute rates or missing actions", () => {
    const w = { means: {}, samples: {}, n: 0 };
    const sheet = { form: { recent: [{ started: true, values: { decisive: 1 } }, { started: true, values: { decisive: 0 } }, { started: false, values: { decisive: 0 } }, { started: true, values: {} }], windows: { starts: w } } } as unknown as Sheet;
    expect(fit(rule, { pStart: 0.1, pOn: 0.8 } as PlayingPlayer, sheet)?.chance).toBe(0.5);
  });
});

import { missionHistory, decisiveRate } from "./arcadePlan";
it("keeps a fixed dated window, unknown stats, and excludes future and DNP rows", () => {
  const before = Date.parse("2026-10-20");
  const rows = Array.from({ length: 40 }, (_, i) => ({ date: new Date(before - (i + 1) * 86400000).toISOString(), mins: 90, stats: i === 0 ? null : i < 5 ? ["goals"] : [] }));
  const window = missionHistory([{ date: "2026-10-21", mins: 90, stats: ["goals"] }, { date: "2026-10-19", mins: 0, stats: [] }, ...rows], before, 5);
  expect(window).toHaveLength(5);
  expect(decisiveRate(window, ["goals"])).toBe(1);
  expect(decisiveRate(missionHistory(rows, before, 40), ["goals"])).toBeCloseTo(4 / 39);
});
