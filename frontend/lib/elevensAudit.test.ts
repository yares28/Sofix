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

it("leads with each side's share within 7 points, starters and substitutes apart, from the first game", () => {
  const side = (miss: number, within: number) => ({ miss, lean: 1.2, within, pair: null, pairs: 0 });
  const all = { starts: 12, sofixCloser: 0.52, sofix: side(17.2, 0.31), sorare: side(18.6, 0.29) };
  const subs = { starts: 3, sofixCloser: null, sofix: side(14.1, 0.42), sorare: side(21.3, 0.2) };
  const html = renderToStaticMarkup(React.createElement(VersusAudit, { versus: { ...NO_VERSUS, all, subs, recorded: 3, settled: 2 } }));
  expect(html).toContain('<dt>Sofix · starters</dt><dd class="ax-duo-n">31%</dd><dd class="ax-duo-s">17.2 pts off on average</dd><dd class="au-result-best">Right more often</dd><dd class="ax-duo-m">Sofix · substitutes<b>42%</b></dd><dd class="ax-duo-s">14.1 pts off on average</dd>');
  expect(html).toContain('<dt>Sorare · starters</dt><dd class="ax-duo-n">29%</dd>');
  expect(html).toContain("Sorare · substitutes<b>20%</b>");
  expect(html).not.toContain("Too few to tell"); // 12 starts: shown regardless, no floor
  expect(html).not.toContain("Better of two");
  expect(renderToStaticMarkup(React.createElement(VersusAudit, { versus: { ...NO_VERSUS, recorded: 2 } }))).toContain('<dd class="ax-duo-n">–</dd><dd class="ax-duo-s">Waiting for results</dd>');
});

it("shows understandable error points out of 100, preserves raw RPS and treats rounded values as tied", () => {
  const data = { recorded: 311, checked: 7, floor: 1, sofix: .1082, bookmakers: .0884, oddsThrough: null, generatedAt: "" };
  const draw = (values = data) => renderToStaticMarkup(React.createElement(MatchAudit, { data: values }));
  expect(draw()).toContain('class="au-result-number">10.8');
  expect(draw()).toContain('class="au-result-number">8.8');
  expect(draw()).toContain("0 = perfect");
  expect(draw()).toContain("100 = worst");
  expect(draw()).toContain("Bookmakers had 2.0 fewer error points");
  expect(draw()).toContain("Ranked Probability Score");
  expect(draw()).toContain("0.1082");
  expect(draw({ ...data, sofix: 0 })).toContain("Sofix had 8.8 fewer error points");
  expect(draw({ ...data, sofix: .08840001 })).toContain("Same error at this precision");
  expect(draw({ ...data, sofix: .1084, bookmakers: .1082 })).toContain("Same error at this precision");
  expect(draw({ ...data, sofix: 1 })).toContain('class="au-result-number">100.0');
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
  expect(small).toContain('class="au-result-number">0.0');
  expect(small).toContain("1 match compared");
  const missing = renderToStaticMarkup(React.createElement(MatchAudit, { data: { ...data, checked: 6, sofix: null, bookmakers: null } }));
  expect(missing).toContain("6 matches compared");
  expect(missing).not.toContain('class="au-result-number"');
  expect(missing).not.toContain("0.0000");
});

it("shows each eleven's evidence by week and club from the first checked starter", () => {
  const sources = { ...NO_ELEVENS.all,
    futbolfantasy: { picked: 130, checked: 120, started: 108, rate: 0.9 },
    sofix: { picked: 50, checked: 40, started: 39, rate: 0.975 } };
  const data: Elevens = { all: sources, weeks: [{ week: 18, sources }], clubs: [{ club: "ATL", crest: null, sources }] };
  const html = renderToStaticMarkup(React.createElement(ElevensAudit, { data }));
  expect(html).toContain("90%");
  expect(html).toContain("108 of 120 started");
  expect(html).toContain("39 of 40 started");
  expect(html).toContain("98%");
  expect(html).not.toContain("Too few to tell");
  expect(html).toContain("Waiting for results");
  expect(html).toContain("GW18");
  expect(html).toContain("ATL");
  for (const started of [0, 1]) {
    const small = { ...sources, sofix: { picked: 2, checked: 1, started, rate: null } };
    const first = renderToStaticMarkup(React.createElement(ElevensAudit, { data: { ...data, all: small } }));
    expect(first).toContain(`<span>${started * 100}%</span><small>${started} of 1 started</small>`);
  }
});

it("shows a week's comparison whatever its size", () => {
  const side = { miss: 10, lean: 0, within: 0.4, pair: null, pairs: 0 };
  const versus = { ...NO_VERSUS, weeks: [{ ...NO_VERSUS.all, week: 18, starts: 20, sofix: side, sorare: { ...side, within: 0.25 } }] };
  const html = renderToStaticMarkup(React.createElement(VersusAudit, { versus }));
  expect(html).toContain("20 starts · within 7: Sofix 40%, Sorare 25%");
});
