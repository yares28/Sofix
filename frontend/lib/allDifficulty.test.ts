import { describe, expect, it } from "vitest";
import { allWindow, boardStats, calendarColumn, topClubs, teamHref } from "./allDifficulty";
import type { FixtureGrid, GridCell, GridTeam } from "./types";

describe("all competition difficulty", () => {
  it("ranks before taking forty, keeps zero and excludes unavailable totals", () => {
    const teams = Array.from({ length: 45 }, (_, i) => ({ code: `T${i}`, name: `Club ${i}` }) as GridTeam);
    const stats = new Map(teams.map((t, i) => [t.code, { total: i === 44 ? null : i }]));
    const best = topClubs(teams, stats);
    expect(best).toHaveLength(40);
    expect(best[0]?.code).toBe("T43");
    expect(best.at(-1)?.code).toBe("T4");
    expect(topClubs(teams.slice(0, 1), stats)[0]?.code).toBe("T0");
  });
  it("uses Madrid dates including the Sunday UTC start of a Monday week", () => {
    const rounds = [{ number: 1, date_from: "2026-10-18T22:00:00Z", date_to: "2026-10-25T22:59:59Z", finished: true },
      { number: 2, date_from: "2026-10-25T23:00:00Z", date_to: "2026-11-01T22:59:59Z", finished: false }];
    expect(calendarColumn(rounds, "2026-10-26")).toBe(1);
    expect(calendarColumn(rounds, "2026-10-25")).toBe(0);
    expect(calendarColumn(rounds, "2028-01-01")).toBeNull();
  });
  it("links merged clubs to their real competition and original abbreviation", () => {
    expect(teamHref({ code: "BL1FCB", source_code: "FCB", source_competition: "BL1" })).toBe("/team/FCB?league=BL1");
    expect(teamHref({ code: "FCB" })).toBe("/team/FCB");
  });
  it("counts both games, preserves zero, excludes finished and missing ratings, and trims only the displayed columns", () => {
    const cell = { status: "scheduled", prediction: { expected_points: 0, difficulty: 50 } } as GridCell;
    const teams = [{ code: "A", name: "A", cells: [[cell, { ...cell, prediction: { ...cell.prediction!, expected_points: 2 } }],
      [{ ...cell, status: "finished" }], [{ ...cell, prediction: null }], [cell]] }] as GridTeam[];
    const grid = { competition: "ALL", teams, matchdays: [1, 2, 3, 4].map(number => ({ number, finished: false })),
      lens_scales: { overall: { cuts: [20, 40, 60, 80], higher_is_easier: false } } } as FixtureGrid;
    expect(boardStats(grid, teams[0]!, 0, 1, "overall").total).toBe(2);
    expect(boardStats(grid, teams[0]!, 1, 3, "overall").total).toBeNull();
    expect(boardStats(grid, teams[0]!, 3, 4, "overall").total).toBe(0);
    const compact = allWindow(grid, 1, 2);
    expect(compact.grid.matchdays.map(m => m.number)).toEqual([2, 3]);
    expect(compact.grid.teams[0]?.cells).toHaveLength(2);
    expect(compact.baseline.A?.total).toBe(0);
  });
});
