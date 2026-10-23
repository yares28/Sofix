import { currentTable, mulberry32, type Outcome } from "./table";
import type { FixtureGrid, GridCell, GridTeam } from "./types";
import { isEuropean, leaguePhaseGrid } from "./competitions";

/**
 * The Table page's three readings of the season, each with its chances (docs/how_it_works.md §6):
 *
 * - actual: the real table. Its chances add the games still to play, at today's forecasts, to the points won.
 * - expected: every game of the season, played or not, at the strength the model gives each club today. The model
 *   is refitted after every result, so this moves with form: a club that loses eight in a row drops, and climbs
 *   again when it starts winning. Today's strength is read back from today's forecasts (`strengthNow`).
 * - predicted: every game at the strength the model gave each club before the season (the committed pre-season
 *   projection, backend/artifacts/opening_projection.json). It never changes.
 */
export type StandingMode = "actual" | "expected" | "predicted";
export type Split = "total" | "home" | "away";

export interface StandingRow {
  team: GridTeam;
  position: number;
  actualPosition: number; // where the real table (same split) has the club
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
  points: number;
  form: Outcome[];
  xPts: number; // the mode's points for the split, to the end of the season (or to `stop`)
  xGD: number;
  title: number; // chances in the full league table, whatever the split (0–1)
  ucl: number; // top four
  uel: number; // fifth
  uecl: number; // sixth: the Conference League play-off
  rel: number; // bottom three
}

export interface StandingOptions {
  mode: StandingMode;
  split?: Split;
  through?: number | null; // the real table up to this gameweek column (a gameweek picked by hand)
  stop?: number | null; // chances and xPts up to this gameweek column; null = the whole season
  simulations?: number;
  seed?: number;
}

interface Chances {
  win: number;
  draw: number;
  loss: number;
  xgFor: number;
  xgAgainst: number;
}

interface Game {
  column: number;
  home: number;
  away: number;
  cell: GridCell; // the home side's cell
}

/** Every game of the season once, from the home side. */
function games(grid: FixtureGrid, index: Map<string, number>): Game[] {
  const out: Game[] = [];
  grid.teams.forEach((team, home) =>
    team.cells.forEach((column, c) => {
      for (const cell of column) {
        const away = index.get(cell.opponent_code);
        if (cell.venue === "H" && away !== undefined) out.push({ column: c, home, away, cell });
      }
    }),
  );
  return out;
}

const poisson = (rate: number) => {
  const out = [Math.exp(-rate)];
  for (let k = 1; k <= 10; k++) out.push((out[k - 1]! * rate) / k);
  return out;
};

/** Win/draw/loss for two goal rates, each side's goals counted on their own. */
export function chancesFromGoals(goalsFor: number, goalsAgainst: number): Chances {
  const a = poisson(goalsFor);
  const b = poisson(goalsAgainst);
  let win = 0;
  let draw = 0;
  let loss = 0;
  a.forEach((p, i) =>
    b.forEach((q, j) => {
      if (i > j) win += p * q;
      else if (i === j) draw += p * q;
      else loss += p * q;
    }),
  );
  const total = win + draw + loss;
  return { win: win / total, draw: draw / total, loss: loss / total, xgFor: goalsFor, xgAgainst: goalsAgainst };
}

/**
 * Each club's strength as the model has it today, read back from today's forecasts: the expected goals of every
 * game still to play fit `log goals = base + home + attack(club) − defence(opponent)` almost exactly (the forecasts
 * come from that shape), so any pairing, including a game already played, can be priced at today's strength.
 * Late in the season, when a club has nothing left, its last forecasts before kickoff stand in.
 */
export function strengthNow(grid: FixtureGrid): ((home: number, away: number) => Chances) | null {
  const index = new Map(grid.teams.map((team, i) => [team.code, i]));
  const rows = (all: boolean) =>
    grid.teams.flatMap((team, i) =>
      team.cells.flat().flatMap((cell) => {
        const p = cell.prediction;
        const j = index.get(cell.opponent_code);
        if (!p?.xg_for || j === undefined || (!all && cell.status === "finished")) return [];
        return [{ team: i, opponent: j, home: cell.venue === "H" ? 1 : 0, y: Math.log(p.xg_for) }];
      }),
    );
  let data = rows(false);
  if (new Set(data.map((row) => row.team)).size < grid.teams.length) data = rows(true);
  if (!data.length) return null;

  const n = grid.teams.length;
  const attack = new Array<number>(n).fill(0);
  const defence = new Array<number>(n).fill(0);
  let base = 0;
  let home = 0;
  const fitted = (r: (typeof data)[number]) => base + home * r.home + attack[r.team]! - defence[r.opponent]!;
  const mean = (values: number[]) => (values.length ? values.reduce((s, v) => s + v, 0) / values.length : 0);
  // Coordinate descent: each parameter in turn takes the mean of what is left over. Converges in a few dozen rounds.
  for (let round = 0; round < 60; round++) {
    base += mean(data.map((r) => r.y - fitted(r)));
    const homeRows = data.filter((r) => r.home);
    home += mean(homeRows.map((r) => r.y - fitted(r)));
    for (let i = 0; i < n; i++) {
      attack[i]! += mean(data.filter((r) => r.team === i).map((r) => r.y - fitted(r)));
      defence[i]! -= mean(data.filter((r) => r.opponent === i).map((r) => r.y - fitted(r)));
    }
  }
  return (h, a) =>
    chancesFromGoals(Math.exp(base + home + attack[h]! - defence[a]!), Math.exp(base + attack[a]! - defence[h]!));
}

const fromPrediction = (cell: GridCell): Chances | null => {
  const p = cell.prediction;
  if (!p || p.xg_for === null || p.xg_against === null) return null;
  return { ...p.probabilities, xgFor: p.xg_for, xgAgainst: p.xg_against };
};

const fromOpening = (cell: GridCell): Chances | null => {
  const o = cell.opening;
  return o ? { win: o.win, draw: o.draw, loss: o.loss, xgFor: o.xg_for, xgAgainst: o.xg_against } : null;
};

/** Whether the grid carries the pre-season chances (an older payload, or a new season's file not built yet, does not). */
export const hasPredicted = (grid: FixtureGrid) => grid.teams.some((team) => team.cells.some((column) => column.some((cell) => cell.opening)));

/** The season's table for one reading and one split, with each club's chances. */
export function standings(grid: FixtureGrid, options: StandingOptions): StandingRow[] {
  grid = leaguePhaseGrid(grid);
  const european = isEuropean(grid.competition);
  const { mode, split = "total", through = null, stop = null, simulations = 5000, seed = 2026 } = options;
  const teams = grid.teams;
  const n = teams.length;
  const index = new Map(teams.map((team, i) => [team.code, i]));
  const all = games(grid, index).filter((game) => stop === null || game.column <= stop);
  const now = mode === "predicted" || european ? null : strengthNow(grid); // also prices a postponed game, which has no forecast

  // What each game is worth in this reading: a known result, or chances.
  const played = (game: Game) => (mode === "actual" || european) && game.cell.status === "finished" && game.cell.result !== null;
  const priced = all.map((game) => {
    if (played(game)) return null;
    if (mode === "predicted") return fromOpening(game.cell);
    const forecast = game.cell.status !== "finished" ? fromPrediction(game.cell) : null;
    return forecast ?? now?.(game.home, game.away) ?? null;
  });

  // Points and goal difference banked from real results (actual only), then the expected rest.
  const banked = new Array<number>(n).fill(0);
  const goals = new Array<number>(n).fill(0);
  const xPts = new Array<number>(n).fill(0);
  const xGD = new Array<number>(n).fill(0);
  const counts = (game: Game, side: "H" | "A") => split === "total" || split === (side === "H" ? "home" : "away");
  all.forEach((game, g) => {
    const result = played(game) ? game.cell.result : null;
    const chances = priced[g];
    for (const side of ["H", "A"] as const) {
      const i = side === "H" ? game.home : game.away;
      let points = 0;
      let margin = 0;
      if (result) {
        const gf = side === "H" ? result.goals_for : result.goals_against;
        const ga = side === "H" ? result.goals_against : result.goals_for;
        points = gf > ga ? 3 : gf === ga ? 1 : 0;
        margin = gf - ga;
        banked[i]! += points;
        goals[i]! += margin;
      } else if (chances) {
        const win = side === "H" ? chances.win : chances.loss;
        points = 3 * win + chances.draw;
        margin = side === "H" ? chances.xgFor - chances.xgAgainst : chances.xgAgainst - chances.xgFor;
        goals[i]! += margin;
      }
      if (counts(game, side)) {
        xPts[i]! += points;
        xGD[i]! += margin;
      }
    }
  });

  // The season played out `simulations` times from those chances; places in the full table.
  const odds = { title: zeros(n), ucl: zeros(n), uel: zeros(n), uecl: zeros(n), rel: zeros(n) };
  const open = all.flatMap((game, g) => (priced[g] ? [{ game, chances: priced[g]! }] : []));
  const random = mulberry32(seed);
  const points = new Array<number>(n);
  const order = Array.from({ length: n }, (_, i) => i);
  for (let s = 0; s < simulations; s++) {
    for (let i = 0; i < n; i++) points[i] = banked[i]!;
    for (const { game, chances } of open) {
      const r = random();
      if (r < chances.win) points[game.home]! += 3;
      else if (r < chances.win + chances.draw) {
        points[game.home]! += 1;
        points[game.away]! += 1;
      } else points[game.away]! += 3;
    }
    order.sort((a, b) => points[b]! - points[a]! || goals[b]! - goals[a]!);
    order.forEach((club, place) => {
      if (place === 0) odds.title[club]! += 1;
      if (place < (european ? 8 : 4)) odds.ucl[club]! += 1;
      if (european ? place >= 8 && place < 24 : place === 4) odds.uel[club]! += 1;
      if (european ? place < 24 : place === 5) odds.uecl[club]! += 1;
      if (place >= (european ? 24 : n - (grid.competition === "BL1" ? 2 : 3))) odds.rel[club]! += 1;
    });
  }
  const share = (count: number) => (simulations ? count / simulations : 0);

  // The real table for the split, as it stood after `through`.
  const venue = split === "home" ? "H" : split === "away" ? "A" : null;
  const splitGrid = venue
    ? { ...grid, teams: teams.map((team) => ({ ...team, cells: team.cells.map((column) => column.filter((cell) => cell.venue === venue)) })) }
    : grid;
  const real = currentTable(splitGrid, through ?? undefined);
  const byCode = new Map(teams.map((team, i) => [team.code, i]));

  const rows = real.map((row) => {
    const i = byCode.get(row.team.code)!;
    return {
      ...row,
      team: teams[i]!,
      actualPosition: row.position,
      xPts: xPts[i]!,
      xGD: xGD[i]!,
      title: share(odds.title[i]!),
      ucl: share(odds.ucl[i]!),
      uel: share(odds.uel[i]!),
      uecl: share(odds.uecl[i]!),
      rel: share(odds.rel[i]!),
    };
  });
  if (mode === "actual") return rows;
  return [...rows]
    .sort((a, b) => b.xPts - a.xPts || b.xGD - a.xGD || a.team.name.localeCompare(b.team.name))
    .map((row, i) => ({ ...row, position: i + 1 }));
}

const zeros = (n: number) => new Array<number>(n).fill(0);

/** A club's next game still to be played, from now: the earliest kickoff that isn't finished or postponed. */
export function nextGame(team: GridTeam): GridCell | null {
  let best: GridCell | null = null;
  for (const cell of team.cells.flat()) {
    if (cell.status === "finished" || cell.status === "postponed") continue;
    if (!best || Date.parse(cell.kickoff_utc) < Date.parse(best.kickoff_utc)) best = cell;
  }
  return best;
}
