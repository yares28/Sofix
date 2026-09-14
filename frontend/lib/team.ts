import type { FixtureGrid, GridCell, GridMatchday, GridTeam, Venue } from "./types";

export interface SeasonEntry {
  matchday: GridMatchday;
  column: number;
  cell: GridCell | null; // null = blank week
}

/** Every matchday of the season for one team, one entry per game (a double week gives two). */
export function seasonEntries(grid: FixtureGrid, team: GridTeam): SeasonEntry[] {
  return grid.matchdays.flatMap<SeasonEntry>((matchday, column) => {
    const cells = team.cells[column] ?? [];
    return cells.length ? cells.map((cell) => ({ matchday, column, cell })) : [{ matchday, column, cell: null }];
  });
}

export function findTeam(grid: FixtureGrid, code: string): GridTeam | null {
  const wanted = code.toUpperCase();
  return grid.teams.find((team) => team.code === wanted) ?? null;
}

const POINTS = { W: 3, D: 1, L: 0 } as const;

export interface TrendPoint {
  matchday: number;
  value: number;
  kind: "actual" | "expected"; // points won (played) or expected points (to come)
  opponent: string;
  venue: Venue;
}

/** Points per game: actual for played games, expected for games still to come. */
export function pointsTrend(entries: SeasonEntry[]): TrendPoint[] {
  return entries.flatMap<TrendPoint>(({ matchday, cell }) => {
    if (!cell) return [];
    const base = { matchday: matchday.number, opponent: cell.opponent_code, venue: cell.venue };
    if (cell.status === "finished" && cell.result) return [{ ...base, value: POINTS[cell.result.outcome], kind: "actual" }];
    if (cell.prediction) return [{ ...base, value: cell.prediction.expected_points, kind: "expected" }];
    return [];
  });
}

export interface VenueSplit {
  venue: Venue;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  points: number;
  upcoming: number;
  expectedPoints: number; // total over the games still to come
  averageDifficulty: number | null;
}

export function venueSplit(entries: SeasonEntry[]): Record<Venue, VenueSplit> {
  const empty = (venue: Venue): VenueSplit => ({
    venue, played: 0, won: 0, drawn: 0, lost: 0, goalsFor: 0, goalsAgainst: 0, points: 0,
    upcoming: 0, expectedPoints: 0, averageDifficulty: null,
  });
  const split: Record<Venue, VenueSplit> = { H: empty("H"), A: empty("A") };
  const difficulties: Record<Venue, number[]> = { H: [], A: [] };
  for (const { cell } of entries) {
    if (!cell) continue;
    const row = split[cell.venue];
    if (cell.status === "finished" && cell.result) {
      row.played += 1;
      row.goalsFor += cell.result.goals_for;
      row.goalsAgainst += cell.result.goals_against;
      row.points += POINTS[cell.result.outcome];
      if (cell.result.outcome === "W") row.won += 1;
      else if (cell.result.outcome === "D") row.drawn += 1;
      else row.lost += 1;
    } else if (cell.prediction) {
      row.upcoming += 1;
      row.expectedPoints += cell.prediction.expected_points;
      difficulties[cell.venue].push(cell.prediction.difficulty);
    }
  }
  for (const venue of ["H", "A"] as const) {
    const values = difficulties[venue];
    split[venue].averageDifficulty = values.length ? values.reduce((s, v) => s + v, 0) / values.length : null;
  }
  return split;
}
