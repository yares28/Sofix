import { expect, it } from "vitest";
import { formValues } from "./missionForm";
import { fit } from "./missions";
import type { MissionForm, Sheet } from "./playerSheet";
import type { PlayingPlayer } from "./play";

it("keeps the window of appearances fixed when a stat is missing and weights each playing role", () => {
  const window = { n: 10, means: { accurate_pass: 50 }, samples: { accurate_pass: 9 } };
  const form: MissionForm = { before: "2026-10-10T08:00:00Z", season: "2026/27", dnp: 2, missing: 1,
    windows: { l5: window, l10: window, season: window, starts: window, subs: window },
    recent: Array.from({ length: 10 }, (_, i) => ({ date: "2026-10-01", started: i % 2 === 0, values: { accurate_pass: i === 0 ? null : i % 2 === 0 ? 80 : 10 } })) };
  expect(formValues(form, "accurate_pass", 5)).toEqual([10, 80, 10, 80]);
  expect(formValues(form, "accurate_pass", 10, false)).toEqual([10, 10, 10, 10, 10]);
  const player = { p: 0.9, pStart: 0.6, pOn: 0.3 } as PlayingPlayer;
  const chance = fit({ kind: "pass", atLeast: 70, label: "70+ passes" }, player, { form } as Sheet)?.chance;
  expect(chance).toBeGreaterThan(0.50); expect(chance).toBeLessThan(0.55);
  expect(fit({ kind: "score", label: "Target" }, player, { form } as Sheet)).toBeNull();
});

it("counts only his starts when he never came on lately and his chance of coming on is small, and stays blank when it is not small", () => {
  const starts = { n: 10, means: { accurate_pass: 75 }, samples: { accurate_pass: 10 } }, none = { n: 0, means: {}, samples: {} };
  const form: MissionForm = { before: "2026-10-10T08:00:00Z", season: "2026/27", dnp: 0, missing: 0,
    windows: { l5: starts, l10: starts, season: starts, starts, subs: none },
    recent: Array.from({ length: 10 }, () => ({ date: "2026-10-01", started: true, values: { accurate_pass: 75 } })) };
  const rule = { kind: "pass", atLeast: 70, label: "70+ passes" } as const;
  const onlyStarts = fit(rule, { p: 0.9, pStart: 0.87, pOn: 0.03 } as PlayingPlayer, { form } as Sheet)?.chance;
  expect(onlyStarts).toBeCloseTo(0.87 * fit(rule, { p: 0.9, pStart: 1, pOn: 0 } as PlayingPlayer, { form } as Sheet)!.chance);
  expect(fit(rule, { p: 0.9, pStart: 0.6, pOn: 0.3 } as PlayingPlayer, { form } as Sheet)).toBeNull();
});
