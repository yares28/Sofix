import { standings, type StandingOptions } from "./standings";
import { currentTable, type StandingRow } from "./table";
import { leaguePhaseGrid } from "./competitions";
import type { FixtureGrid } from "./types";

export type ActualRow = StandingRow & { actualPosition: number };
export type TableRow = ActualRow | ReturnType<typeof standings>[number];

/** Actual draws results only. Forecast views retain the full seeded simulation and its existing inputs. */
export function tableRows(grid: FixtureGrid, options: StandingOptions): TableRow[] {
  if (options.mode !== "actual") return standings(grid, options);
  grid = leaguePhaseGrid(grid);
  const teams = new Map(grid.teams.map(team => [team.code, team]));
  const venue = options.split === "home" ? "H" : options.split === "away" ? "A" : null;
  const shown = venue ? { ...grid, teams: grid.teams.map(team => ({ ...team, cells: team.cells.map(cells => cells.filter(cell => cell.venue === venue)) })) } : grid;
  return currentTable(shown, options.through ?? undefined).map(row => ({ ...row, team: teams.get(row.team.code)!, actualPosition: row.position }));
}
