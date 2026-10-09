import * as React from "react";
import { createRequire } from "node:module";
import { afterAll, expect, it, vi } from "vitest";
import ElevensAudit from "../components/audit/ElevensAudit";
import VersusAudit from "../components/audit/VersusAudit";
import MatchAudit from "../components/audit/MatchAudit";
import { NO_ELEVENS, NO_VERSUS, type Elevens } from "./audit";

const { renderToStaticMarkup } = createRequire(import.meta.url)("react-dom/server") as {
  renderToStaticMarkup(node: React.ReactNode): string;
};

// This repository's Vitest transform uses classic JSX; Next uses its own automatic transform.
vi.stubGlobal("React", React);
afterAll(() => vi.unstubAllGlobals());

it("shows paired match RPS only from 100 results, with the saved odds date", () => {
  const data = { recorded: 130, checked: 100, floor: 100, sofix: .1947, bookmakers: .1886, oddsThrough: "2026-09-20", generatedAt: "" };
  const html = renderToStaticMarkup(React.createElement(MatchAudit, { data }));
  expect(html).toContain("0.1947");
  expect(html).toContain("0.1886");
  expect(html).toContain("Odds up to 2026-09-20");
  const small = renderToStaticMarkup(React.createElement(MatchAudit, { data: { ...data, checked: 99 } }));
  expect(small).toContain("Too few to tell");
  expect(small).not.toContain("0.1947");
});

it("shows each eleven's evidence by week and club and hides rates below 100", () => {
  const sources = { ...NO_ELEVENS.all,
    futbolfantasy: { picked: 130, checked: 120, started: 108, rate: 0.9 },
    sofix: { picked: 50, checked: 40, started: 39, rate: 0.975 } };
  const data: Elevens = { all: sources, weeks: [{ week: 18, sources }], clubs: [{ club: "ATL", crest: null, sources }] };
  const html = renderToStaticMarkup(React.createElement(ElevensAudit, { data, floor: 100 }));
  expect(html).toContain("90%");
  expect(html).toContain("108 of 120 started");
  expect(html).toContain("39 of 40 started");
  expect(html).not.toContain("98%");
  expect(html).toContain("Too few to tell");
  expect(html).toContain("GW18");
  expect(html).toContain("ATL");
});

it("does not expose a week comparison below the same 100-start floor", () => {
  const versus = { ...NO_VERSUS, weeks: [{ ...NO_VERSUS.all, week: 18, starts: 20, sofixCloser: 0.9 }] };
  const html = renderToStaticMarkup(React.createElement(VersusAudit, { versus, floor: 100, league: null }));
  expect(html).toContain("20 of 100 starts");
  expect(html).not.toContain("90%");
});
