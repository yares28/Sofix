import * as React from "react";
import { createRequire } from "node:module";
import { afterAll, expect, it, vi } from "vitest";
import StrategyFindings from "../components/audit/StrategyFindings";
import type { StrategyDecision, StrategyDecisionRow } from "./audit";

const { renderToStaticMarkup } = createRequire(import.meta.url)("react-dom/server") as { renderToStaticMarkup(node: React.ReactNode): string };
vi.stubGlobal("React", React);
afterAll(() => vi.unstubAllGlobals());
const row = (key: string, label: string, average: number, essence: number): StrategyDecisionRow => ({
  key, label, note: key === "keeper-defender" ? "Pairs the goalkeeper with a defender from the same club." : "Picks the best xScore in each slot.",
  average, delta: average - 100, winsVsBaseline: 1, rewardWins: 1,
  won: { card: 0, cash: 0, essence: 1, xp: 0, none: 0 }, cashAverage: 0,
  essence: { limited: { average: essence, cases: 1 } },
});
const data = (): StrategyDecision => ({ pointsCases: 1, rewardCases: 1, amountCases: 1, weeks: 1, active: 2,
  pointLeaders: ["keeper-defender"], rewardLeaders: ["xscore", "keeper-defender"], cashLeaders: [], essenceLeaders: { limited: ["xscore"] },
  rows: [row("xscore", "xScore", 100, 300), row("keeper-defender", "Keeper with his defender", 120, 250)],
});
const draw = (d = data(), sort = "points") => renderToStaticMarkup(React.createElement(StrategyFindings, { data: d, sort }));
const words = (s: string) => s.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ");

it("answers which strategy led, explains its picks and shows the points/essence tradeoff from one case", () => {
  const html = draw(); const text = words(html);
  expect(text).toContain("Keeper with his defender leads on points");
  expect(text).toContain("Pairs the goalkeeper with a defender from the same club.");
  expect(text).toContain("+20 points vs xScore");
  expect(text).toContain("More points did not mean more essence.");
  expect(text).toContain("xScore averaged 300 Limited essence, compared with 250 for Keeper with his defender.");
  expect(text).toContain("All strategies are tied");
  expect(text).toContain("Avg points / lineup");
  expect(text).toContain("Lineups rewarded");
  expect(html).not.toContain("st-bar");
  expect(text).not.toContain("too few");
});

it("ranking by essence changes the comparison order and keeps the units", () => {
  const html = draw(data(), "essence:limited");
  expect(words(html)).toContain("xScore leads on Limited essence");
  const list = html.split('<ol aria-label="Strategy comparison">')[1]!;
  expect(list.indexOf("<h3>xScore</h3>")).toBeLessThan(list.indexOf("<h3>Keeper with his defender</h3>"));
  expect(words(list)).toContain("Avg Limited essence / lineup");
});

it("keeps unknown prize checks distinct from checked zero rewards", () => {
  const d = data(); d.rewardCases = 0; d.amountCases = 0; d.rewardLeaders = []; d.essenceLeaders = {};
  d.rows.forEach(r => { r.cashAverage = null; r.essence = {}; });
  expect(words(draw(d))).toContain("Prize checks pending");
  expect(words(draw(d))).not.toContain("0 / 0");
  d.rewardCases = 1; d.amountCases = 1; d.rewardLeaders = d.rows.map(r => r.key);
  d.rows.forEach(r => { r.rewardWins = 0; r.won = { card: 0, cash: 0, essence: 0, xp: 0, none: 1 }; r.cashAverage = 0; });
  expect(words(draw(d))).toContain("No strategy reached a reward");
  expect(words(draw(d))).toContain("0 / 1");
});

it("does not combine essence rarities or invent a winner without comparisons", () => {
  const d = data(); d.rows[0]!.essence.rare = { average: 2, cases: 1 }; d.essenceLeaders.rare = ["xscore"];
  const text = words(draw(d)); expect(text).toContain("Most Limited essence"); expect(text).toContain("Most Rare essence");
  d.pointsCases = 0; d.pointLeaders = []; d.rows.forEach(r => { r.average = null; r.delta = null; });
  expect(words(draw(d))).toContain("Waiting for comparable results");
  expect(words(draw(d))).not.toContain("leads on points");
});

it("draws the overall comparison against the eligible hindsight best with explicit units and a point gap", () => {
  const d = data(); d.hindsight = { cases: 1, average: 150 };
  d.rows[0]!.hindsight = { average: 100, share: 2 / 3, gap: 50 };
  d.rows[1]!.hindsight = { average: 120, share: .8, gap: 30 };
  const html = draw(d); const text = words(html);
  expect(text).toContain("80% of your cards’ best replay");
  expect(text).toContain("30 points / lineup left to gain");
  expect(text).toContain("Best found in hindsight");
  expect(text).toContain("150 avg points");
  expect(html).toContain('aria-label="Keeper with his defender: 80% of hindsight best"');
  expect(html).toContain('role="meter"');
});

it("shows unavailable and partial hindsight honestly without hiding the overall results", () => {
  expect(words(draw())).toContain("Hindsight comparison pending");
  const d = data(); d.pointsCases = 4; d.hindsight = { cases: 1, average: 0 };
  d.rows.forEach(r => { r.hindsight = { average: 0, share: null, gap: 0 }; });
  const text = words(draw(d));
  expect(text).toContain("1 of 4 lineups have a hindsight comparison");
  expect(text).not.toContain("0% of your cards’ best replay");
  expect(text).not.toContain("100% of your cards’ best replay");
});

it("does not clamp a strategy that beats the saved replay into an invented maximum", () => {
  const d = data(); d.hindsight = { cases: 1, average: 100 };
  d.rows[1]!.hindsight = { average: 120, share: 1.2, gap: -20 };
  const text = words(draw(d));
  expect(text).toContain("120% of your cards’ best replay");
  expect(text).toContain("20 points / lineup above the saved replay");
  expect(text).not.toContain("-20 points / lineup left to gain");
});
