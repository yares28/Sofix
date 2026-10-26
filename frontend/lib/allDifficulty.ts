import type { FixtureGrid, GridMatchday, GridTeam, Lens } from "./types";
import { runStats, runValue, type RunStats } from "./grid";
import { validDay } from "./competitions";

const madridDay = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Madrid", year: "numeric", month: "2-digit", day: "2-digit" });
export const calendarDay = (iso: string) => madridDay.format(new Date(iso));

export function calendarColumn(rounds: GridMatchday[], date: string): number | null {
  if (!validDay(date)) return null;
  const index = rounds.findIndex(r => calendarDay(r.date_from) <= date && calendarDay(r.date_to) >= date);
  return index < 0 ? null : index;
}

/** Rank the complete pool before taking forty; unknown forecasts cannot win a place. */
export function topClubs(teams: GridTeam[], stats: ReadonlyMap<string, { total: number | null }>): GridTeam[] {
  return teams.filter(t => stats.get(t.code)?.total != null)
    .sort((a, b) => stats.get(b.code)!.total! - stats.get(a.code)!.total! || a.name.localeCompare(b.name)).slice(0, 40);
}

export function teamHref(team: Pick<GridTeam, "code" | "source_code" | "source_competition">): string {
  return team.source_competition && team.source_code
    ? `/team/${team.source_code}?league=${team.source_competition}` : `/team/${team.code}`;
}

export function boardStats(grid: FixtureGrid, team: GridTeam, start: number, end: number, lens: Lens): RunStats {
  const stats = runStats(team, start, end, lens, grid.lens_scales[lens], grid.matchdays.map(md => md.finished));
  if (grid.competition === "ALL") {
    const games = team.cells.slice(start, end).flat().filter(c => c.status !== "finished");
    if (!games.some(c => runValue(c, lens) !== null)) return { ...stats, total: null };
  }
  return stats;
}

/** Send only the displayed window; schedule swings need just the full run's compact totals. */
export function allWindow(grid: FixtureGrid, column: number, size: number) {
  const baseline = Object.fromEntries(grid.teams.map(t => [t.code, boardStats(grid, t, column, grid.matchdays.length, "overall")]));
  const end = Math.min(grid.matchdays.length, column + size);
  return { baseline, grid: { ...grid, matchdays: grid.matchdays.slice(column, end),
    teams: grid.teams.map(t => ({ ...t, cells: t.cells.slice(column, end) })) } };
}
