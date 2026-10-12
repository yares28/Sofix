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

it("leads with each side's accuracy on every start, and says too few to tell under the floor", () => {
  const side = (miss: number) => ({ miss, lean: 1.2, within: 0.3, pair: null, pairs: 0 });
  const all = { starts: 412, sofixCloser: 0.52, sofix: side(17.2), sorare: side(18.6) };
  const draw = (floor: number) => renderToStaticMarkup(React.createElement(VersusAudit, { versus: { ...NO_VERSUS, all, recorded: 3, settled: 2 }, floor }));
  expect(draw(100)).toContain('<dt>Sofix accuracy</dt><dd class="ax-duo-n">83%</dd><dd class="ax-duo-s">17.2 pts off on average</dd><dd class="au-result-best">Closer</dd>');
  expect(draw(100)).toContain('<dt>Sorare accuracy</dt><dd class="ax-duo-n">81%</dd><dd class="ax-duo-s">18.6 pts off on average</dd></div>');
  expect(draw(100)).not.toContain("Better of two");
  expect(draw(500)).toContain('<dd class="ax-duo-n">–</dd><dd class="ax-duo-s">Too few to tell</dd>');
  expect(draw(500)).not.toContain("83%");
  expect(renderToStaticMarkup(React.createElement(VersusAudit, { versus: { ...NO_VERSUS, recorded: 2 }, floor: 100 }))).toContain('<dd class="ax-duo-s">Waiting for results</dd>');
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
  const html = renderToStaticMarkup(React.createElement(VersusAudit, { versus, floor: 100 }));
  expect(html).toContain("20 of 100 starts");
  expect(html).not.toContain("90%");
});
