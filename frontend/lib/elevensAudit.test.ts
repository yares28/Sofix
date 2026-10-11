import * as React from "react";
import { createRequire } from "node:module";
import { afterAll, expect, it, vi } from "vitest";
import ElevensAudit from "../components/audit/ElevensAudit";
import VersusAudit from "../components/audit/VersusAudit";
import MatchAudit from "../components/audit/MatchAudit";
import PrelockAudit from "../components/audit/PrelockAudit";
import { NO_ELEVENS, NO_VERSUS, type Elevens } from "./audit";

const { renderToStaticMarkup } = createRequire(import.meta.url)("react-dom/server") as {
  renderToStaticMarkup(node: React.ReactNode): string;
};

// This repository's Vitest transform uses classic JSX; Next uses its own automatic transform.
vi.stubGlobal("React", React);
afterAll(() => vi.unstubAllGlobals());

it("makes pre-lock accuracy and its distinct samples readable, without repeating a collapsed interval", () => {
  const live = { state: "enough" as const, floor: 1, noted: 875, marked: 17, pairs: 20, weeks: 1, rate: .65, lo: .65, hi: .65 };
  const html = renderToStaticMarkup(React.createElement(PrelockAudit, { data: live }));
  expect(html).toContain('class="au-result-big">65%');
  expect(html).toContain("of player pairs ranked correctly");
  expect(html).toContain("Pairs compared");
  expect(html).toContain("Player GWs checked");
  expect(html).not.toContain("65% (65%)");
  expect(renderToStaticMarkup(React.createElement(PrelockAudit, { data: { ...live, floor: 100, pairs: 1, rate: 0, lo: 0, hi: .5 } }))).toContain('class="au-result-big">0%');
  expect(renderToStaticMarkup(React.createElement(PrelockAudit, { data: { ...live, rate: null } }))).not.toContain('class="au-result-big">0%');
});

it("compares large RPS results with the lower source and gap, and treats equal displayed results as tied", () => {
  const data = { recorded: 311, checked: 7, floor: 1, sofix: .1082, bookmakers: .0884, oddsThrough: null, generatedAt: "" };
  const draw = (values = data) => renderToStaticMarkup(React.createElement(MatchAudit, { data: values }));
  expect(draw()).toContain('class="au-result-number">0.1082');
  expect(draw()).toContain("Bookmakers lower by 0.0198 RPS");
  expect(draw({ ...data, sofix: 0 })).toContain("Sofix lower by 0.0884 RPS");
  expect(draw({ ...data, sofix: .08840001 })).toContain("Same error at this precision");
});

it("shows paired match RPS from the first result, with the saved odds date", () => {
  const data = { recorded: 130, checked: 100, floor: 100, sofix: .1947, bookmakers: .1886, oddsThrough: "2026-09-20", generatedAt: "" };
  const html = renderToStaticMarkup(React.createElement(MatchAudit, { data }));
  expect(html).toContain("0.1947");
  expect(html).toContain("0.1886");
  expect(html).toContain("Odds up to 2026-09-20");
  const small = renderToStaticMarkup(React.createElement(MatchAudit, { data: { ...data, checked: 1, sofix: 0 } }));
  expect(small).not.toContain("Too few to tell");
  expect(small).toContain("0.0000");
  expect(small).toContain("1 paired result");
  const missing = renderToStaticMarkup(React.createElement(MatchAudit, { data: { ...data, checked: 6, sofix: null, bookmakers: null } }));
  expect(missing).toContain("6 paired results");
  expect(missing).not.toContain("0.0000");
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
