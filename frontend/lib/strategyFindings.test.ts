import * as React from "react";
import { createRequire } from "node:module";
import { afterAll, expect, it, vi } from "vitest";
import StrategyFindings from "../components/audit/StrategyFindings";
import { rankingTiers } from "./strategyCharts";
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

it("opens with a podium and three different charts instead of tables", () => {
 const html = draw(); const text = words(html);
 expect(text).toContain("Best strategies");
 expect(html).toContain('aria-label="Best strategies podium"');
 for (const type of ["dumbbell", "scatter", "donut"]) expect(html).toContain(`data-chart="${type}"`);
 expect(text).toContain("How close to your best lineup?");
 expect(text).toContain("Points or rewards?");
 expect(text).toContain("What did it win?");
 expect(html).not.toMatch(/<table|<dl/);
 expect(text).toContain("Pairs the goalkeeper with a defender from the same club.");
});

it("preserves ties and keeps distinct essence currencies", () => {
 const d = data(); d.rows.push({ ...d.rows[0]!, key: "tie", label: "Tied" });
 const html = draw(d); expect(words(html)).toContain("Shared 2nd");
 expect(words(html)).toContain("Tied");
 d.rows.forEach(r => { r.average = 0; });
 expect(words(draw(d))).toContain("Shared 1st");
 d.rows[0]!.essence.rare = { average: 2, cases: 1 };
 expect(words(draw(d, "essence:rare"))).toContain("Rare essence");
});

it("shows zero rewards but never turns unknown prize checks into losses", () => {
 const d = data(); d.rows.forEach(r => { r.rewardWins = 0; r.won = { card: 0, cash: 0, essence: 0, xp: 0, none: 1 }; });
 expect(words(draw(d))).toContain("0% rewarded");
 d.rewardCases = 0; d.amountCases = 0; d.rows.forEach(r => { r.won.none = 0; r.essence = {}; r.cashAverage = null; });
 expect(words(draw(d))).toContain("Prize checks pending");
 expect(words(draw(d))).not.toContain("0% rewarded");
 expect(words(draw(d))).not.toContain("too few");
});

it("shows a matched hindsight comparison and its actual coverage", () => {
 const d = data(); d.pointsCases = 4; d.hindsight = { cases: 1, average: 150 };
 d.rows[0]!.hindsight = { average: 100, share: 2 / 3, gap: 50 };
 d.rows[1]!.hindsight = { average: 120, share: .8, gap: 30 };
 const text = words(draw(d)); expect(text).toContain("1 of 4 lineups");
 expect(text).toContain("30 points left to gain");
 expect(text).toContain("Best found in hindsight");
});

it("keeps unavailable benchmarks and outcomes unknown", () => {
 expect(words(draw())).toContain("Hindsight comparison pending");
 const d = data(); d.pointsCases = 3;
 expect(draw(d)).toContain('aria-label="Pending: 2 lineups"');
 expect(draw(d)).not.toContain('aria-label="Nothing: 2 lineups"');
});

it("does not clamp a score above the saved replay into an invented maximum", () => {
 const d = data(); d.hindsight = { cases: 1, average: 100 };
 d.rows[1]!.hindsight = { average: 120, share: 1.2, gap: -20 };
 expect(words(draw(d))).toContain("20 points above the saved replay");
});

it("does not award a bronze podium to ninth place after a seven-way second-place tie", () => {
 const d = data(); d.rows = [row("first", "First", 120, 1), ...Array.from({ length: 7 }, (_, i) => row(`t${i}`, `Tie ${i}`, 100, 1)), row("ninth", "Ninth", 80, 1)];
 expect(rankingTiers(d, "points").map(t => t.rank)).toEqual([1, 2]);
 expect(rankingTiers(d, "points")[1]!.rows).toHaveLength(7);
});

it("retains owner and whole-plan averages as unranked chart references with their own coverage", () => {
 const html = renderToStaticMarkup(React.createElement(StrategyFindings, { data: data(), references: [{ key: "you", label: "You", average: 280, cases: 60 }] }));
 expect(words(html)).toContain("Your entries &amp; whole plans");
 expect(words(html)).toContain("Different saved coverage");
 expect(html).toContain('aria-label="You: 280 average points from 60 checked lineups"');
});
