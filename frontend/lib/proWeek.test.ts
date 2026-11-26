import { describe, expect, it } from "vitest";
import fixture from "../e2e/fixtures/pro-response.json";
import { boardWeeks, clearChance, holdMatchday, moves, reachChances, readable, stepsPlayed, type ProPlanned, type Result } from "./proWeek";

const lineup = (...reach: number[]): ProPlanned => ({ start: "2026-11-28T14:00:00+00:00", span: "batch", reach, x: 300, starters: [] });

describe("the Pro page's block", () => {
  it("reads the block the refresh publishes", () => {
    const block = readable(fixture.data);
    expect(block?.weeks[0]?.boards.map((b) => b.name)).toEqual(["LaLiga Pro", "European Champions Pro", "Europa Contenders Pro"]);
    expect(readable({ version: 2 })).toBeNull();
  });
});

describe("which week each board plays", () => {
  it("a European board plays the gameweek being played, LaLiga the next one, each board once", () => {
    const block = readable(fixture.data)!;
    const [laliga, champions, europa] = block.weeks[0]!.boards;
    const live = { ...block.weeks[0]!, slug: "live", live: true, boards: [{ ...laliga!, byBatch: [], bestFive: [], batches: [] }, europa!] };
    const next = { ...block.weeks[0]!, slug: "next", boards: [laliga!, { ...champions!, byBatch: [], bestFive: [], batches: [] }] };
    const shown = boardWeeks({ ...block, weeks: [live, next] });
    expect(shown.map((s) => s.board.name)).toEqual(["Europa Contenders Pro", "LaLiga Pro", "European Champions Pro"]);
    expect(shown[1]!.board).toBe(laliga); // LaLiga's own games, not the empty board of the week being played
    expect(shown.find((s) => s.board.key === europa!.key)!.next).toBeNull();
  });
});

describe("the step chain", () => {
  it("a cleared lineup moves every later one up a step, a missed one does not", () => {
    const four = [lineup(0.3, 0.2), lineup(0.3, 0.2), lineup(0.3, 0.2), lineup(0.3, 0.2)];
    expect(stepsPlayed(four, ["cleared", "missed", "open", "cleared"])).toEqual([0, 1, 1, 1]);
  });

  it("the chance of reaching each step adds every lineup's try in order", () => {
    const two = [lineup(0.5, 0.4), lineup(0.5, 0.4)];
    const [first, second] = reachChances(two, [], 2);
    expect(first).toBeCloseTo(0.75); // 1 - 0.5 x 0.5
    expect(second).toBeCloseTo(0.5 * 0.4); // the first clears, then the second clears the next step
    expect(reachChances(two, ["cleared"], 2)[0]).toBe(1);
  });
});

describe("hold or play", () => {
  it("one lineup a day: every one is played, the one with the best chance does not cost the others", () => {
    const week = [lineup(0.1), lineup(0.15), lineup(0.2), lineup(0.3)];
    expect(moves(week, []).map((m) => m.tag)).toEqual(["play", "play", "play", "play"]);
    expect(clearChance(week, [])).toBeCloseTo(1 - 0.9 * 0.85 * 0.8 * 0.7);
  });

  it("more than four lineups on a step: the weakest waits, four lives", () => {
    const five = [lineup(0.1), lineup(0.3), lineup(0.05), lineup(0.2), lineup(0.25)];
    expect(moves(five, []).map((m) => m.tag)).toEqual(["play", "play", "hold", "play", "play"]);
    // a missed lineup spends a life: the fifth now waits even more surely
    expect(moves(five, ["missed"]).filter((m) => m.tag === "play")).toHaveLength(3);
  });

  it("a lineup with no chance at its step is held", () => {
    expect(moves([lineup(0.4, 0), lineup(0.3, 0)], ["cleared" as Result]).map((m) => m.tag)).toEqual(["cleared", "hold"]);
  });

  it("the matchday waits only when the next one is clearly better", () => {
    expect(holdMatchday(0.3, 0.45)).toBe(true);
    expect(holdMatchday(0.3, 0.31)).toBe(false); // a near tie plays now
    expect(holdMatchday(0.3, null)).toBe(false); // nothing planned yet for the next one
  });
});
