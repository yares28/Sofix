import { readFileSync } from "node:fs";
import { beforeEach, expect, it, vi } from "vitest";
import type { FixtureGrid } from "./types";

const { forecast } = vi.hoisted(() => ({ forecast: vi.fn() }));
vi.mock("./standings", async original => ({ ...await original<typeof import("./standings")>(), standings: forecast }));
import { tableRows } from "./tableRows";
import { currentTable } from "./table";
import { leaguePhaseGrid } from "./competitions";

const fixture = JSON.parse(readFileSync(new URL("../e2e/fixtures/grid-response.json", import.meta.url), "utf8")).data as FixtureGrid;
beforeEach(() => forecast.mockReset().mockReturnValue([]));

it("opens Actual and changes its GW/split without running a season simulation", () => {
  for (const split of ["total", "home", "away"] as const) {
    for (const through of [null, 0, 2, fixture.matchdays.length - 1]) {
      const rows = tableRows(fixture, { mode: "actual", split, through });
      const grid = split === "total" ? fixture : { ...fixture, teams: fixture.teams.map(team => ({ ...team, cells: team.cells.map(cells => cells.filter(cell => cell.venue === (split === "home" ? "H" : "A"))) })) };
      expect(rows.map(({ actualPosition, ...row }) => ({ ...row, team: row.team.code, position: actualPosition }))).toEqual(currentTable(grid, through ?? undefined).map(row => ({ ...row, team: row.team.code })));
      expect(rows.every(row => !("title" in row) && !("xPts" in row))).toBe(true);
      expect(rows.every(row => row.team === fixture.teams.find(team => team.code === row.team.code))).toBe(true); // Next game still includes both venues.
    }
  }
  expect(forecast).not.toHaveBeenCalled();
});

it("preserves the existing forecast inputs and full simulation when a forecast view is requested", () => {
  const options = { mode: "predicted", split: "away", through: 2, stop: 2 } as const;
  tableRows(fixture, options);
  expect(forecast).toHaveBeenCalledWith(fixture, options);
});

it("keeps European Actual restricted to league-phase fixtures and handles an empty season", () => {
  const european: FixtureGrid = { ...fixture, competition: "CL", teams: fixture.teams.map(team => ({ ...team, cells: team.cells.map(cells => cells.map(cell => ({ ...cell, phase: cell.fixture_id % 2 ? "league" as const : "knockout" as const }))) })) };
  expect(tableRows(european, { mode: "actual" }).map(row => row.team.code)).toEqual(currentTable(leaguePhaseGrid(european)).map(row => row.team.code));
  expect(tableRows({ ...fixture, teams: [], matchdays: [] }, { mode: "actual" })).toEqual([]);
  expect(forecast).not.toHaveBeenCalled();
});
