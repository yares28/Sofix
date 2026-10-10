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
