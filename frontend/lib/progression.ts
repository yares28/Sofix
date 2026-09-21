import { currentTable, mulberry32, predictedTable } from "./table";
import type { FixtureGrid, GridTeam } from "./types";

/**
 * Where every club has been and where it is heading, gameweek by gameweek.
 *
 * Played gameweeks come from the real standings after that gameweek (currentTable). Future ones come from
 * the same projection the Table tab shows (predictedTable stopped at that gameweek), so a line and the
 * table can never disagree. The band around a projected line is separate: it simulates the rest of the
 * season many times and keeps the 10th and 90th percentile of where a club ends up each week, which is
 * the honest width of "we think they finish about 7th".
 */

export interface ProgressionPoint {
  column: number; // index into grid.matchdays
  gameweek: number; // the gameweek number shown to people
  position: number; // 1 = top of the table
  points: number; // won so far, or projected by then
  played: boolean;
  low: number | null; // best plausible position (10th percentile), projected weeks only
  high: number | null; // worst plausible position (90th percentile)
  /** Where the pre-season model had the club that week, before a ball was kicked; null without the artifact. */
  opening: number | null;
}

export interface ClubProgression {
  team: GridTeam;
  path: ProgressionPoint[];
  best: number; // highest position reached or projected
  worst: number;
  now: number | null; // position after the last played gameweek
  end: number; // projected final position
  openingEnd: number | null; // where the pre-season model finished the club
  openingNow: number | null; // where it had the club by the last played gameweek
}

export interface Progression {
  clubs: ClubProgression[];
  /** Column index of the last played gameweek; −1 before a ball is kicked. */
  lastPlayed: number;
  columns: number;
}

export interface ProgressionOptions {
  /** Seasons to simulate for the band. 0 skips it (and every `low`/`high` is null). */
  simulations?: number;
  seed?: number;
}

interface PlannedFixture {
  home: number;
  away: number;
  win: number;
  draw: number;
  goalDifference: number; // expected, from the home side
}

/** Remaining fixtures per gameweek column, from the home side (whose probabilities the cell carries). */
function fixturePlan(grid: FixtureGrid, index: Map<string, number>): PlannedFixture[][] {
  const columns: PlannedFixture[][] = grid.matchdays.map(() => []);
  for (const team of grid.teams) {
    const home = index.get(team.code);
    if (home === undefined) continue;
    team.cells.forEach((cells, column) => {
      for (const cell of cells) {
        const p = cell.prediction;
        if (cell.status === "finished" || !p || cell.venue !== "H") continue;
        const away = index.get(cell.opponent_code);
        if (away === undefined || !columns[column]) continue;
        columns[column].push({
          home,
          away,
          win: p.probabilities.win,
          draw: p.probabilities.draw,
          goalDifference: (p.xg_for ?? 0) - (p.xg_against ?? 0),
        });
      }
    });
  }
  return columns;
}

/** position → how many simulated seasons ended that gameweek there, per club per column. */
function simulateBands(
  grid: FixtureGrid,
  index: Map<string, number>,
  from: number,
  simulations: number,
  seed: number,
): number[][][] {
  const n = grid.teams.length;
  const columns = grid.matchdays.length;
  const start = currentTable(grid);
  const startPoints = new Array<number>(n).fill(0);
  const startDiff = new Array<number>(n).fill(0);
  for (const row of start) {
    const i = index.get(row.team.code);
    if (i !== undefined) {
      startPoints[i] = row.points;
      startDiff[i] = row.goalDifference;
    }
  }
  const plan = fixturePlan(grid, index);
  // counts[club][column][position 1..n]
  const counts = Array.from({ length: n }, () =>
    Array.from({ length: columns }, () => new Array<number>(n + 1).fill(0)),
  );
  const random = mulberry32(seed);
  const points = new Array<number>(n);
  const diff = new Array<number>(n);
  const order = Array.from({ length: n }, (_, i) => i);

  for (let s = 0; s < simulations; s++) {
    for (let i = 0; i < n; i++) {
      points[i] = startPoints[i]!;
      diff[i] = startDiff[i]!;
    }
    for (let column = from; column < columns; column++) {
      for (const fixture of plan[column] ?? []) {
        const roll = random();
        if (roll < fixture.win) points[fixture.home]! += 3;
        else if (roll < fixture.win + fixture.draw) {
          points[fixture.home]! += 1;
          points[fixture.away]! += 1;
        } else points[fixture.away]! += 3;
        diff[fixture.home]! += fixture.goalDifference;
        diff[fixture.away]! -= fixture.goalDifference;
      }
      order.sort((a, b) => points[b]! - points[a]! || diff[b]! - diff[a]!);
      for (let place = 0; place < n; place++) counts[order[place]!]![column]![place + 1]! += 1;
    }
  }
  return counts;
}

/** The position `quantile` of the simulated seasons landed on or above, from a 1..n histogram. */
function percentile(histogram: number[], quantile: number): number | null {
  const total = histogram.reduce((sum, count) => sum + count, 0);
  if (!total) return null;
  const target = quantile * total;
  let seen = 0;
  for (let position = 1; position < histogram.length; position++) {
    seen += histogram[position]!;
    if (seen >= target) return position;
  }
  return histogram.length - 1;
}

export function seasonProgression(grid: FixtureGrid, options: ProgressionOptions = {}): Progression {
  const { simulations = 400, seed = 2026 } = options;
  const columns = grid.matchdays.length;
  const index = new Map(grid.teams.map((team, i) => [team.code, i]));
  const lastPlayed = grid.matchdays.reduce((last, matchday, i) => (matchday.finished ? i : last), -1);
  if (!columns || !grid.teams.length) {
    return { clubs: [], lastPlayed, columns };
  }

  // One row per club per gameweek: the real table while it has been played, the projection after that.
  const rows: { position: number; points: number; code: string }[][] = [];
  for (let column = 0; column < columns; column++) {
    if (column <= lastPlayed) {
      rows.push(currentTable(grid, column).map((row) => ({ position: row.position, points: row.points, code: row.team.code })));
    } else {
      rows.push(
        predictedTable(grid, { through: column, simulations: 0 }).map((row) => ({
          position: row.position,
          points: row.projectedPoints,
          code: row.team.code,
        })),
      );
    }
  }

  const bands = simulations > 0 && lastPlayed < columns - 1
    ? simulateBands(grid, index, lastPlayed + 1, simulations, seed)
    : null;

  const clubs = grid.teams.map((team, i) => {
    const path: ProgressionPoint[] = [];
    for (let column = 0; column < columns; column++) {
      const row = rows[column]?.find((entry) => entry.code === team.code);
      if (!row) continue;
      const played = column <= lastPlayed;
      const histogram = !played && bands ? bands[i]?.[column] : undefined;
      path.push({
        column,
        gameweek: grid.matchdays[column]!.number,
        position: row.position,
        points: played ? row.points : Math.round(row.points * 10) / 10,
        played,
        low: histogram ? percentile(histogram, 0.1) : null,
        high: histogram ? percentile(histogram, 0.9) : null,
        opening: team.opening?.[column] ?? null,
      });
    }
    const positions = path.map((point) => point.position);
    return {
      team,
      path,
      best: positions.length ? Math.min(...positions) : 0,
      worst: positions.length ? Math.max(...positions) : 0,
      now: lastPlayed >= 0 ? (path[lastPlayed]?.position ?? null) : null,
      end: path[path.length - 1]?.position ?? 0,
      openingEnd: path[path.length - 1]?.opening ?? null,
      openingNow: lastPlayed >= 0 ? (path[lastPlayed]?.opening ?? null) : null,
    };
  });

  return { clubs, lastPlayed, columns };
}
