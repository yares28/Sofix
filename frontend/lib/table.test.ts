import { describe, expect, it } from "vitest";
import { currentTable, mulberry32, predictedTable } from "./table";
import type { FixtureGrid, GridCell, GridTeam } from "./types";

let id = 1;
const scale = { cuts: [1, 2, 3, 4], higher_is_easier: false };

function played(opponent: string, venue: "H" | "A", gf: number, ga: number, day: number): GridCell {
  return {
    fixture_id: id++, opponent_code: opponent, venue, kickoff_utc: `2026-09-${String(day).padStart(2, "0")}T19:00:00Z`,
    date_confirmed: true, rescheduled: false, status: "finished", prediction: null, weather: null,
    result: { goals_for: gf, goals_against: ga, outcome: gf > ga ? "W" : gf === ga ? "D" : "L" },
  };
}

function upcoming(opponent: string, venue: "H" | "A", win: number, draw: number, ep: number, fixtureId: number): GridCell {
  return {
    fixture_id: fixtureId, opponent_code: opponent, venue, kickoff_utc: "2026-10-20T19:00:00Z", date_confirmed: true,
    rescheduled: false, status: "scheduled", result: null, weather: null,
    prediction: {
      difficulty: 50, label: "Normal", bucket: 3, expected_points: ep,
      probabilities: { win, draw, loss: 1 - win - draw }, clean_sheet: 0.3, xg_for: 1.5, xg_against: 1.0,
    },
  };
}

const team = (code: string, cells: GridCell[]): GridTeam => ({
  code, name: `Team ${code}`, color: "#123456", crest_url: null, cells: cells.map((c) => [c]),
});

const makeGrid = (teams: GridTeam[]): FixtureGrid => ({
  season: "2026/27", current_matchday: 1, model_version: null,
  lens_scales: { overall: scale, attack: scale, defence: scale, odds: scale },
  matchdays: [], teams,
});

describe("currentTable", () => {
  it("counts results, goal difference, points and the last five results", () => {
    const grid = makeGrid([
      team("AAA", [played("BBB", "H", 3, 1, 1), played("CCC", "A", 0, 0, 8)]),
      team("BBB", [played("AAA", "A", 1, 3, 1), played("CCC", "H", 2, 0, 8)]),
      team("CCC", [played("AAA", "H", 0, 0, 8), played("BBB", "A", 0, 2, 8)]),
    ]);
    const table = currentTable(grid);
    expect(table.map((r) => [r.position, r.team.code, r.played, r.won, r.drawn, r.lost, r.goalDifference, r.points])).toEqual([
      [1, "AAA", 2, 1, 1, 0, 2, 4],
      [2, "BBB", 2, 1, 0, 1, 0, 3],
      [3, "CCC", 2, 0, 1, 1, -2, 1],
    ]);
    expect(table[0]!.form).toEqual(["W", "D"]);
  });

  it("falls back to overall goal difference when head-to-head is level", () => {
    // 6 points each; they beat each other 1–0 at home, so head-to-head is level → YYY's +4 beats XXX's +1.
    const grid = makeGrid([
      team("XXX", [played("YYY", "H", 1, 0, 1), played("YYY", "A", 0, 1, 2), played("ZZZ", "H", 1, 0, 3)]),
      team("YYY", [played("XXX", "A", 0, 1, 1), played("XXX", "H", 1, 0, 2), played("ZZZ", "H", 4, 0, 3)]),
      team("ZZZ", [played("XXX", "A", 0, 1, 3), played("YYY", "A", 0, 4, 3)]),
    ]);
    expect(currentTable(grid).slice(0, 2).map((r) => [r.team.code, r.points])).toEqual([["YYY", 6], ["XXX", 6]]);
  });

  it("ignores head-to-head until both games between the tied clubs are played", () => {
    // Level on 3 points; AAA won the only meeting so far, but BBB has the better goal difference.
    const grid = makeGrid([
      team("AAA", [played("BBB", "H", 1, 0, 1), upcoming("BBB", "A", 0.3, 0.3, 1.2, 950), played("CCC", "A", 0, 1, 2)]),
      team("BBB", [played("AAA", "A", 0, 1, 1), upcoming("AAA", "H", 0.4, 0.3, 1.5, 950), played("CCC", "H", 5, 0, 2)]),
      team("CCC", [played("AAA", "H", 1, 0, 2), played("BBB", "A", 0, 5, 2)]),
    ]);
    expect(currentTable(grid).slice(0, 2).map((r) => r.team.code)).toEqual(["BBB", "AAA"]);
  });

  it("uses head-to-head over goal difference when the clubs are level on points", () => {
    const grid = makeGrid([
      // AAA beat BBB twice; BBB thrashed CCC. Both finish on 6 points.
      team("AAA", [played("BBB", "H", 1, 0, 1), played("BBB", "A", 1, 0, 2), played("CCC", "H", 0, 1, 3)]),
      team("BBB", [played("AAA", "A", 0, 1, 1), played("AAA", "H", 0, 1, 2), played("CCC", "H", 7, 0, 3), played("CCC", "A", 3, 0, 4)]),
      team("CCC", [played("AAA", "A", 1, 0, 3), played("BBB", "A", 0, 7, 3), played("BBB", "H", 0, 3, 4)]),
    ]);
    const table = currentTable(grid);
    const aaa = table.find((r) => r.team.code === "AAA")!;
    const bbb = table.find((r) => r.team.code === "BBB")!;
    expect([aaa.points, bbb.points]).toEqual([6, 6]);
    expect(bbb.goalDifference).toBeGreaterThan(aaa.goalDifference);
    expect(aaa.position).toBeLessThan(bbb.position);
  });
});

describe("currentTable up to a gameweek", () => {
  it("only counts games in gameweeks up to the selected one", () => {
    const grid = makeGrid([
      team("AAA", [played("BBB", "H", 3, 1, 1), played("BBB", "A", 0, 2, 8)]),
      team("BBB", [played("AAA", "A", 1, 3, 1), played("AAA", "H", 2, 0, 8)]),
    ]);
    const afterFirst = currentTable(grid, 0);
    expect(afterFirst.map((r) => [r.team.code, r.points, r.played])).toEqual([["AAA", 3, 1], ["BBB", 0, 1]]);
    expect(currentTable(grid).map((r) => r.played)).toEqual([2, 2]);
  });

  it("keeps waiting for the second meeting before head-to-head decides, even with a cutoff", () => {
    // After GW1 AAA and BBB are level on 3 points; AAA beat BBB 1–0 but BBB has the better goal difference.
    const grid = makeGrid([
      team("AAA", [played("BBB", "H", 1, 0, 1), played("CCC", "A", 0, 3, 8), upcoming("BBB", "A", 0.4, 0.3, 1.3, 900)]),
      team("BBB", [played("AAA", "A", 0, 1, 1), played("DDD", "H", 5, 0, 8), upcoming("AAA", "H", 0.3, 0.3, 1.2, 900)]),
      team("CCC", [played("AAA", "H", 3, 0, 8)]),
      team("DDD", [played("BBB", "A", 0, 5, 8)]),
    ]);
    const order = currentTable(grid, 1).map((r) => r.team.code);
    expect(order.indexOf("BBB")).toBeLessThan(order.indexOf("AAA")); // goal difference, not the single meeting
  });

  it("keeps waiting for the second meeting before head-to-head decides, even with a cutoff", () => {
    // After GW1 AAA and BBB are level on 3 points; AAA beat BBB 1–0 but BBB has the better goal difference.
    const grid = makeGrid([
      team("AAA", [played("BBB", "H", 1, 0, 1), played("CCC", "A", 0, 3, 8), upcoming("BBB", "A", 0.4, 0.3, 1.3, 900)]),
      team("BBB", [played("AAA", "A", 0, 1, 1), played("DDD", "H", 5, 0, 8), upcoming("AAA", "H", 0.3, 0.3, 1.2, 900)]),
      team("CCC", [played("AAA", "H", 3, 0, 8)]),
      team("DDD", [played("BBB", "A", 0, 5, 8)]),
    ]);
    const order = currentTable(grid, 1).map((r) => r.team.code);
    expect(order.indexOf("BBB")).toBeLessThan(order.indexOf("AAA")); // goal difference, not the single meeting
  });
});

describe("predictedTable", () => {
  it("adds expected points from remaining fixtures and simulates finishing chances deterministically", () => {
    const grid = makeGrid([
      team("TOP", [played("MID", "H", 2, 0, 1), upcoming("LOW", "H", 0.8, 0.15, 2.55, 900), upcoming("MID", "A", 0.6, 0.2, 2.0, 901)]),
      team("MID", [played("TOP", "A", 0, 2, 1), upcoming("LOW", "A", 0.5, 0.25, 1.75, 902), upcoming("TOP", "H", 0.2, 0.2, 0.8, 901)]),
      team("LOW", [upcoming("TOP", "A", 0.05, 0.15, 0.3, 900), upcoming("MID", "H", 0.25, 0.25, 1.0, 902)]),
    ]);
    const table = predictedTable(grid, { simulations: 4000, relegated: 1 });
    expect(table.map((r) => r.team.code)).toEqual(["TOP", "MID", "LOW"]);
    const top = table[0]!;
    expect(top.points).toBe(3);
    expect(top.remaining).toBe(2);
    expect(top.projectedPoints).toBeCloseTo(7.55);
    expect(top.title).toBeGreaterThan(0.7);
    expect(table.reduce((s, r) => s + r.title, 0)).toBeCloseTo(1);
    expect(table.reduce((s, r) => s + r.relegation, 0)).toBeCloseTo(1);
    expect(table[2]!.relegation).toBeGreaterThan(0.5);
    expect(predictedTable(grid, { simulations: 500 })).toEqual(predictedTable(grid, { simulations: 500 })); // seeded
  });

  it("has a reproducible random stream", () => {
    const a = mulberry32(7);
    const b = mulberry32(7);
    const values = Array.from({ length: 5 }, () => a());
    expect(values).toEqual(Array.from({ length: 5 }, () => b()));
    expect(values.every((v) => v >= 0 && v < 1)).toBe(true);
  });
});
