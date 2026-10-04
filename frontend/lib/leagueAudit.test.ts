import { describe, expect, it } from "vitest";
import { alongPairs, dot, enough, missBars, pct, scaleMax, weekHeight, weeklyStory, type LeagueAudit, type Rate } from "./leagueAudit";

const rate = (games: number): Rate => ({ rate: 0.55, lo: 0.5, hi: 0.6, pairs: 1000, games });

describe("the league figures", () => {
  it("round a share to a whole percent and have nothing for one that is not there", () => {
    expect(pct(0.5417)).toBe(54);
    expect(pct(null)).toBeNull();
    expect(pct(undefined)).toBeNull();
  });

  it("place a pair share on the 45 to 65 scale and keep it on the chart", () => {
    expect(alongPairs(0.5)).toBeCloseTo(25);
    expect(alongPairs(0.55)).toBeCloseTo(50);
    expect(alongPairs(0.3)).toBe(0);
    expect(alongPairs(0.9)).toBe(100);
  });

  it("draw a figure only with 100 cases behind it", () => {
    expect(enough(rate(99))).toBe(false);
    expect(enough(rate(100))).toBe(true);
    expect(enough(null)).toBe(false);
  });

  it("say how many gameweeks beat a coin flip and the lowest and highest", () => {
    const weeks = [0.6, 0.52, 0.48, 0.65].map((r, i) => ({ from: `2026-0${i + 1}-01`, rate: r, pairs: 500 }));
    expect(weeklyStory(weeks)).toEqual({ total: 4, above: 3, lowest: 0.48, highest: 0.65 });
    expect(weeklyStory([])).toBeNull();
    expect(weekHeight(0.4)).toBe(4);
    expect(weekHeight(0.575)).toBeCloseTo(50);
  });

  it("mark the four middle bars of the miss chart, the starts within 7 points", () => {
    const miss: LeagueAudit["miss"] = { from: -49, step: 3.5, counts: Array.from({ length: 28 }, (_, i) => (i === 13 ? 100 : 10)), n: 380, within7: 0.3, within15: 0.6 };
    const bars = missBars(miss);
    expect(bars).toHaveLength(28);
    expect(bars.map((b, i) => (b.middle ? i : -1)).filter((i) => i >= 0)).toEqual([12, 13, 14, 15]);
    expect(bars[13]!.h).toBe(100);
    expect(bars[0]!.h).toBe(10);
  });

  it("place a calibration group on the square by what was said and what happened, and size it by its starts", () => {
    expect(dot({ said: 0.25, happened: 0.2, n: 400 }, 0.5)).toEqual({ x: 50, y: 40, size: 18 });
    expect(dot({ said: 0.9, happened: 0.9, n: 5000 }, 0.5)).toMatchObject({ x: 100, y: 100, size: 22 });
    expect(scaleMax([{ said: 0.09, happened: 0.13, n: 70 }, { said: 0.4, happened: 0.43, n: 70 }])).toBeCloseTo(0.45);
  });
});
