import * as React from "react";
import { createRequire } from "node:module";
import { afterAll, expect, it, vi } from "vitest";
import MissionsAudit from "../components/audit/MissionsAudit";
import { NO_MISSIONS } from "./audit";
import type { MissionAuditRow } from "./missionAudit";

const { renderToStaticMarkup } = createRequire(import.meta.url)("react-dom/server") as { renderToStaticMarkup(node: React.ReactNode): string };
vi.stubGlobal("React", React);
afterAll(() => vi.unstubAllGlobals());
const row = (overrides: Partial<MissionAuditRow> = {}): MissionAuditRow => ({ id: "a", day: "2026-10-06", rarity: "limited", mission: "Goals", state: "checked", best: 3, sofix: 0, yours: 2, slots: 3, replay: false, corrected: false, reward: { unit: "Essence", each: 50, full: 500 }, ...overrides });
const draw = (rows: MissionAuditRow[]) => renderToStaticMarkup(React.createElement(MissionsAudit, { missions: { ...NO_MISSIONS, overview: { rows, emptyDays: 0 } } }));
const words = (s: string) => s.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ");

it("shows a labelled comparison from the first case and explains the gap and reward basis", () => {
  const html = draw([row()]);
  expect(words(html)).toContain("You found 2 more successful picks");
  expect(html).toContain('aria-label="Sofix: 0 of 3 possible successful picks across 1 missions"');
  expect(html).toContain('aria-label="You: 100 Essence"');
  expect(html).toContain('aria-label="Best available: 500 Essence"');
  expect(words(html)).toContain("potential rewards, not confirmed receipts");
  expect(html).not.toMatch(/<table|Too few to tell/);
});

it("keeps unsupported, incomplete, reconstructed and independently known own outcomes visible", () => {
  const html = draw([row({ state: "incomplete", best: null, sofix: null, yours: 1 }), row({ id: "b", state: "reconstructed", best: null, sofix: null, yours: null }), row({ id: "c", state: "unsupported", best: null, sofix: null, yours: null })]);
  expect(words(html)).toContain("Waiting for a fair comparison");
  expect(words(html)).toContain("1 successful picks");
  for (const s of ["Eligibility incomplete", "Reconstructed", "Target not rated"]) expect(words(html)).toContain(s);
  expect(html).toContain('aria-label="Sofix: not compared"');
});

it("paginates more than twelve saved missions and handles an entirely empty cold start", () => {
  const html = draw(Array.from({ length: 25 }, (_, i) => row({ id: String(i) })));
  expect((html.match(/<li>/g) ?? [])).toHaveLength(12);
  expect(words(html)).toContain("Page 1 of 3");
  expect(words(draw([]))).toContain("No saved missions in this selection");
  expect(words(draw([row({ best: 0, sofix: 0, yours: 0 })]))).not.toContain("NaN");
});
