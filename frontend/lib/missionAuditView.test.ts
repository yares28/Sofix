import * as React from "react";
import { createRequire } from "node:module";
import { afterAll, expect, it, vi } from "vitest";
import MissionsAudit from "../components/audit/MissionsAudit";
import { NO_MISSIONS } from "./audit";
import type { MissionAuditRow } from "./missionAudit";
import { missionOutcomes, type MissionOutcome } from "./missionOutcomes";
import type { HistoryDay } from "./missionLog";

const { renderToStaticMarkup } = createRequire(import.meta.url)("react-dom/server") as { renderToStaticMarkup(node: React.ReactNode): string };
vi.stubGlobal("React", React);
afterAll(() => vi.unstubAllGlobals());
const row = (overrides: Partial<MissionAuditRow> = {}): MissionAuditRow => ({ id: "a", day: "2026-10-06", rarity: "limited", mission: "Goals", state: "checked", best: 3, sofix: 0, yours: 2, slots: 3, replay: false, corrected: false, reward: { unit: "Essence", each: 50, full: 500 }, ...overrides });
const draw = (rows: MissionAuditRow[], outcomes: MissionOutcome[] = [], initialFilters = "") => renderToStaticMarkup(React.createElement(MissionsAudit, { missions: { ...NO_MISSIONS, overview: { rows, emptyDays: 0 } }, outcomes, initialFilters }));
const words = (s: string) => s.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ");

const outcomes = () => missionOutcomes([{ rarity: "limited", days: [{ day: "2026-10-06", key: "goals", mission: "Goals", loaded: true,
  yours: [{ slug: "a", name: "A", pic: "", state: "did" }, { slug: "b", name: "B", pic: "", state: "did" }],
  sofix: [{ slug: "c", name: "C", pic: "", state: "didnt" }], missed: [], score: null, evidence: "incomplete",
  source: { picks: 3, description: "Win 50 Essence per correct choice.", rule: { kind: "goal", label: "goals" } } as HistoryDay["source"],
}]}]);
it("shows actual selection outcomes immediately, the action chart and exactly two segmented pick bars", () => {
  const html = draw([row({ state: "incomplete", best: null, sofix: null })], outcomes());
  expect(words(html)).toContain("You won 1 more mission");
  expect(html).toContain('aria-label="Missions won over time on shared missions"');
  expect(html).toContain('aria-label="Goals: you hit 1 of 1 checked missions; Sofix hit 0 of 1 checked missions"');
  expect((html.match(/class="mo-storage-track"/g) ?? [])).toHaveLength(2);
  expect(words(html)).not.toContain("100 Essence");
  expect(html).toContain('aria-label="You: essence hits"');
  expect(html).not.toContain('class="mo-reward-totals"');
  expect(html).not.toMatch(/<table|Too few to tell/);
});

it("keeps eligibility coverage separate without suppressing known picks or inventing a best-available ceiling", () => {
  const html = draw([row({ state: "incomplete", best: null, sofix: null, yours: 1 }), row({ id: "b", state: "reconstructed", best: null, sofix: null, yours: null }), row({ id: "c", state: "unsupported", best: null, sofix: null, yours: null })], outcomes());
  expect(words(html)).toContain("You won 1 more mission");
  for (const text of ["Eligibility incomplete", "Reconstructed", "Target not rated", "Which picks got it right"]) expect(words(html)).toContain(text);
  expect(html).not.toContain("Best available: 0");
});

it("paginates more than twelve saved missions and handles an entirely empty cold start", () => {
  const html = draw(Array.from({ length: 25 }, (_, i) => row({ id: String(i) })));
  expect(((html.match(/<ol class="ma-records">([\s\S]*?)<\/ol>/)?.[1] ?? "").match(/<li>/g) ?? [])).toHaveLength(12);
  expect(words(html)).toContain("Page 1 of 3");
  const evidence = draw([], Array.from({ length: 25 }, (_, i) => ({ ...outcomes()[0]!, id: String(i) })));
  expect((evidence.match(/class="mo-evidence-title"/g) ?? [])).toHaveLength(12);
  expect(words(draw([]))).toContain("No saved missions in this selection");
  expect(words(draw([row({ best: 0, sofix: 0, yours: 0 })]))).not.toContain("NaN");
});

it("renders restored rarity and action filters on the server without an all-records flash", () => {
  const limited = outcomes()[0]!;
  const rare = { ...limited, id: "rare", rarity: "rare", target: "Assists", mission: "Assists" };
  const html = draw([row(), row({ id: "rare", rarity: "rare" })], [limited, rare], "mr=rare&mt=Assists");
  expect(html).toContain('value="rare" selected=""');
  expect(html).toContain('aria-label="Assists: you hit');
  expect(html).not.toContain('aria-label="Goals: you hit');
});
