import type { FixtureGrid, GridCell, GridTeam } from "./types";

export type Outcome = "W" | "D" | "L";

export interface StandingRow {
  team: GridTeam;
  position: number;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
  points: number;
  form: Outcome[]; // last five results, oldest first
}

const POINTS: Record<Outcome, number> = { W: 3, D: 1, L: 0 };

interface Played {
  opponent: string;
  goalsFor: number;
  goalsAgainst: number;
  outcome: Outcome;
  kickoff: number;
}

function playedGames(team: GridTeam, through: number): Played[] {
  return team.cells
    .slice(0, through + 1)
    .flat()
    .filter((cell): cell is GridCell & { result: NonNullable<GridCell["result"]> } => cell.status === "finished" && cell.result !== null)
    .map((cell) => ({
      opponent: cell.opponent_code,
      goalsFor: cell.result.goals_for,
      goalsAgainst: cell.result.goals_against,
      outcome: cell.result.outcome,
      kickoff: Date.parse(cell.kickoff_utc),
    }))
    .sort((a, b) => a.kickoff - b.kickoff);
}

/**
 * The league table from played games up to and including gameweek column `through` (default: all of them),
 * so a past gameweek shows the table as it stood then. Ties on points follow LaLiga: head-to-head points, then
 * head-to-head goal difference — but only once every game between the tied clubs has been played; until then
 * (and after that) overall goal difference, then goals scored.
 */
export function currentTable(grid: FixtureGrid, through = Number.POSITIVE_INFINITY): StandingRow[] {
  const games = new Map(grid.teams.map((team) => [team.code, playedGames(team, through)]));
  const rows = grid.teams.map((team): Omit<StandingRow, "position"> => {
    const played = games.get(team.code)!;
    const sum = (pick: (g: Played) => number) => played.reduce((s, g) => s + pick(g), 0);
    const goalsFor = sum((g) => g.goalsFor);
    const goalsAgainst = sum((g) => g.goalsAgainst);
    return {
      team,
      played: played.length,
      won: played.filter((g) => g.outcome === "W").length,
      drawn: played.filter((g) => g.outcome === "D").length,
      lost: played.filter((g) => g.outcome === "L").length,
      goalsFor,
      goalsAgainst,
      goalDifference: goalsFor - goalsAgainst,
      points: sum((g) => POINTS[g.outcome]),
      form: played.slice(-5).map((g) => g.outcome),
    };
  });

  const byPoints = new Map<number, typeof rows>();
  for (const row of rows) byPoints.set(row.points, [...(byPoints.get(row.points) ?? []), row]);
  const headToHead = new Map<string, { points: number; goalDifference: number } | null>();
  for (const tied of byPoints.values()) {
    if (tied.length < 2) continue;
    const codes = new Set(tied.map((r) => r.team.code));
    // every pair meets twice in a double round robin: count the whole season, not just up to `through`
    const scheduled = tied.map((r) => r.team.cells.flat().filter((c) => codes.has(c.opponent_code)).length);
    const allPlayed = tied.every((r, i) => games.get(r.team.code)!.filter((g) => codes.has(g.opponent)).length === scheduled[i]);
    for (const row of tied) {
      if (!allPlayed || scheduled.some((n) => n === 0)) {
        headToHead.set(row.team.code, null);
        continue;
      }
      const mini = games.get(row.team.code)!.filter((g) => codes.has(g.opponent));
      headToHead.set(row.team.code, {
        points: mini.reduce((s, g) => s + POINTS[g.outcome], 0),
        goalDifference: mini.reduce((s, g) => s + g.goalsFor - g.goalsAgainst, 0),
      });
    }
  }

  return rows
    .sort((a, b) => {
      if (b.points !== a.points) return b.points - a.points;
      const ha = headToHead.get(a.team.code);
      const hb = headToHead.get(b.team.code);
      if (ha && hb) {
        if (hb.points !== ha.points) return hb.points - ha.points;
        if (hb.goalDifference !== ha.goalDifference) return hb.goalDifference - ha.goalDifference;
      }
      return b.goalDifference - a.goalDifference || b.goalsFor - a.goalsFor || a.team.name.localeCompare(b.team.name);
    })
    .map((row, i) => ({ ...row, position: i + 1 }));
}

// LaLiga 2026/27 places: 1–4 Champions League, 5 Europa League, 6 Conference League play-off, 18–20 relegation.
export function zone(position: number, size: number): { className: string; label: string } | null {
  if (position <= 4) return { className: "zone-ucl", label: "Champions League" };
  if (position === 5) return { className: "zone-uel", label: "Europa League" };
  if (position === 6) return { className: "zone-uecl", label: "Conference League" };
  if (position > size - 3) return { className: "zone-rel", label: "Relegation" };
  return null;
}

export interface PredictedRow {
  team: GridTeam;
  position: number;
  currentPosition: number;
  points: number; // now
  remaining: number; // games still to play that have a forecast
  expectedToCome: number; // expected points from those games
  projectedPoints: number;
  projectedGoalDifference: number;
  title: number; // chance of finishing 1st (0–1)
  top4: number;
  relegation: number; // bottom three
}

export interface PredictOptions {
  simulations?: number;
  seed?: number;
  relegated?: number;
}

/** Small, fast, seeded generator: the same data always gives the same percentages. */
export function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * The predicted final table: points so far plus expected points from every remaining fixture, and the
 * chances of each finish from simulating the rest of the season with the model's win/draw/loss
 * probabilities (ties in a simulation are split by projected goal difference).
 */
export function predictedTable(grid: FixtureGrid, options: PredictOptions = {}): PredictedRow[] {
  const { simulations = 5000, seed = 2026, relegated = 3 } = options;
  const current = currentTable(grid);
  const index = new Map(current.map((row, i) => [row.team.code, i]));
  const expected = current.map(() => 0);
  const remaining = current.map(() => 0);
  const goalDiff = current.map((row) => row.goalDifference);

  // One entry per remaining fixture, from the home side (whose probabilities are the home team's).
  const fixtures: { home: number; away: number; win: number; draw: number }[] = [];
  for (const team of grid.teams) {
    for (const cell of team.cells.flat()) {
      const p = cell.prediction;
      if (cell.status === "finished" || !p) continue;
      const i = index.get(team.code)!;
      expected[i]! += p.expected_points;
      remaining[i]! += 1;
      goalDiff[i]! += (p.xg_for ?? 0) - (p.xg_against ?? 0);
      const opponent = index.get(cell.opponent_code);
      if (cell.venue === "H" && opponent !== undefined) {
        fixtures.push({ home: i, away: opponent, win: p.probabilities.win, draw: p.probabilities.draw });
      }
    }
  }

  const n = current.length;
  const firsts = new Array<number>(n).fill(0);
  const tops = new Array<number>(n).fill(0);
  const bottoms = new Array<number>(n).fill(0);
  const random = mulberry32(seed);
  const points = new Array<number>(n);
  const order = Array.from({ length: n }, (_, i) => i);
  for (let s = 0; s < simulations; s++) {
    for (let i = 0; i < n; i++) points[i] = current[i]!.points;
    for (const f of fixtures) {
      const r = random();
      if (r < f.win) points[f.home]! += 3;
      else if (r < f.win + f.draw) {
        points[f.home]! += 1;
        points[f.away]! += 1;
      } else points[f.away]! += 3;
    }
    order.sort((a, b) => points[b]! - points[a]! || goalDiff[b]! - goalDiff[a]!);
    firsts[order[0]!]! += 1;
    for (let k = 0; k < Math.min(4, n); k++) tops[order[k]!]! += 1;
    for (let k = Math.max(0, n - relegated); k < n; k++) bottoms[order[k]!]! += 1;
  }

  return current
    .map((row, i): Omit<PredictedRow, "position"> => ({
      team: row.team,
      currentPosition: row.position,
      points: row.points,
      remaining: remaining[i]!,
      expectedToCome: expected[i]!,
      projectedPoints: row.points + expected[i]!,
      projectedGoalDifference: goalDiff[i]!,
      title: simulations ? firsts[i]! / simulations : 0,
      top4: simulations ? tops[i]! / simulations : 0,
      relegation: simulations ? bottoms[i]! / simulations : 0,
    }))
    .sort(
      (a, b) =>
        b.projectedPoints - a.projectedPoints ||
        b.projectedGoalDifference - a.projectedGoalDifference ||
        a.team.name.localeCompare(b.team.name),
    )
    .map((row, i) => ({ ...row, position: i + 1 }));
}
