import * as React from "react";
import { createRequire } from "node:module";
import { afterAll, expect, it, vi } from "vitest";
import response from "../e2e/fixtures/sorare-response.json";
import PlayView from "../components/play/PlayView";
import AuditView from "../components/audit/AuditView";
import { nextWeek, type Sorare } from "./play";

const { renderToStaticMarkup } = createRequire(import.meta.url)("react-dom/server") as { renderToStaticMarkup(node: React.ReactNode): string };
vi.stubGlobal("React", React);
vi.mock("../components/play/EnteredLineups", () => ({ default: () => React.createElement("section", { "aria-label": "Your Sorare lineups" }, "Actual entries") }));
vi.mock("../components/play/ApplySheet", () => ({ default: () => React.createElement("button", null, "Apply plan") }));
vi.mock("../components/LinkPending", () => ({ default: () => null }));
afterAll(() => vi.unstubAllGlobals());
const data = response.data as unknown as Sorare;
const week = nextWeek(data);
const props = () => ({ data, week: { ...week, plans: week.plans.map((p, i) => ({ ...p, essence: i === 1 ? 999 : 1 })) }, planIndex: 0, after: false, now: new Date(Date.parse(week.gameweek.lock) - 3600000), weekId: "2026-10-23" });

it("Play shows the existing best recommendation, entered lineups first, without alternate selectors", () => {
  const html = renderToStaticMarkup(React.createElement(PlayView, props()));
  expect(html).toContain("Recommended plan");
  expect(html.indexOf("Actual entries")).toBeLessThan(html.indexOf('id="pl-board-title"'));
  expect(html).not.toContain('aria-label="Plan made from"');
  expect(html).not.toContain('aria-label="Plan"');
  expect(html).toContain("Highest expected essence");
  expect(html).toContain("Other plans &amp; strategies");
  expect(html).toContain("view=plans");
  expect(html).toContain("w=2026-10-23");
  expect(html).toContain("LaLiga Pro"); // second published plan is now the best
});

it("Strategies' planning workspace retains all plan selectors and has no duplicate own-lineup read", () => {
  const html = renderToStaticMarkup(React.createElement(PlayView, { ...props(), alternatives: true }));
  expect(html).toContain('aria-label="Plan"');
  expect(html).toContain('aria-label="Plan made from"');
  expect(html).toContain("Highest ceiling");
  expect(html).toContain("Plan alternatives");
  expect(html).not.toContain("Actual entries");
});

it("Strategies keeps the Plans route available before any results are published", () => {
  const html = renderToStaticMarkup(React.createElement(AuditView, { data: null, league: null, now: new Date(), show: "strategies", plansHref: "/audit/strategies?view=plans&gw=25" }));
  expect(html).toContain("Strategies view");
  expect(html).toContain("view=plans&amp;gw=25");
  expect(html).toContain("The audit appears after the next refresh.");
});
