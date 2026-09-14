import type { Bucket, FixtureGrid, GridCell, GridTeam, Lens, LensScale } from "./types";

export type { Bucket };
export type SortKey = { kind: "team" } | { kind: "total" } | { kind: "matchday"; column: number };
export interface SortState {
  key: SortKey;
  dir: "asc" | "desc"; // asc = A→Z for teams, easiest first otherwise
}

// Saturated variants for thin marks (bars, strips) where the pale tiles would disappear.
// Colours live only in globals.css (--fdrN-strong).
export const BUCKET_STRONG: Record<Bucket, string> = {
  1: "var(--fdr1-strong)",
  2: "var(--fdr2-strong)",
  3: "var(--fdr3-strong)",
  4: "var(--fdr4-strong)",
  5: "var(--fdr5-strong)",
};

interface LensCopy {
  label: string;
  hint: string;
  easy: string;
  hard: string;
  total: string; // short column header for the run total
  totalLong: string; // spoken / sentence form
}

export const LENS_COPY: Record<Lens, LensCopy> = {
  overall: {
    label: "Overall",
    hint: "Tiles: result difficulty 0–100. Total: expected points",
    easy: "Easy",
    hard: "Hard",
    total: "Exp. pts",
    totalLong: "expected points",
  },
  attack: {
    label: "Attack",
    hint: "Tiles and total: expected goals scored",
    easy: "More xG",
    hard: "Less xG",
    total: "xG",
    totalLong: "expected goals",
  },
  defence: {
    label: "Defence",
    hint: "Tiles: chance of a clean sheet. Total: expected clean sheets",
    easy: "Clean sheet likely",
    hard: "Unlikely",
    total: "Exp. CS",
    totalLong: "expected clean sheets",
  },
};

/** Bucket of a value on a scale sent by the API (single source of truth: backend fixture_grid.lens_scales). */
export function scaleBucket(value: number, scale: LensScale): Bucket {
  const crossed = scale.higher_is_easier
    ? scale.cuts.filter((cut) => value < cut).length
    : scale.cuts.filter((cut) => value > cut).length;
  return (1 + crossed) as Bucket;
}

/** A tile's bucket. Overall uses the API's label-derived bucket so colour and label always agree. */
export function cellBucket(cell: GridCell, lens: Lens, scale: LensScale): Bucket | null {
  if (!cell.prediction) return null;
  if (lens === "overall") return cell.prediction.bucket;
  const value = lensValue(cell, lens);
  return value === null ? null : scaleBucket(value, scale);
}

export function lensValue(cell: GridCell, lens: Lens): number | null {
  const prediction = cell.prediction;
  if (!prediction) return null;
  if (lens === "overall") return prediction.difficulty;
  if (lens === "attack") return prediction.xg_for;
  return prediction.clean_sheet;
}

/**
 * What a game is worth over a run, higher = better for the team: expected points (overall),
 * expected goals (attack) or clean-sheet chance (defence). These add up, so a blank week adds 0
 * and a double week counts both games — which averages hide.
 */
export function runValue(cell: GridCell, lens: Lens): number | null {
  const prediction = cell.prediction;
  if (!prediction) return null;
  if (lens === "overall") return prediction.expected_points;
  if (lens === "attack") return prediction.xg_for;
  return prediction.clean_sheet;
}

/**
 * One team's matchday: 0 for a blank week that's still to come, the sum over a double,
 * null when nothing in it can be rated (already played, postponed, or a past blank).
 */
export function columnTotal(cells: GridCell[] | undefined, lens: Lens, finished = false): number | null {
  if (!cells || cells.length === 0) return finished ? null : 0;
  const values = cells.map((cell) => runValue(cell, lens)).filter((v): v is number => v !== null);
  return values.length ? values.reduce((sum, v) => sum + v, 0) : null;
}

export function windowRange(total: number, start: number, horizon: number): { start: number; end: number } {
  const safeStart = Math.min(Math.max(0, start), Math.max(0, total - 1));
  return { start: safeStart, end: Math.min(total, safeStart + horizon) };
}

export interface RunStats {
  total: number | null; // sum of runValue over the window; blank weeks count 0
  average: number | null; // per game, on the tile scale (difficulty / xG / clean-sheet chance)
  fixtures: number; // rated games
  blanks: number; // upcoming matchdays without a game
  doubles: number; // matchdays with two or more games
  home: number;
  buckets: Bucket[];
}

export function runStats(
  team: GridTeam,
  start: number,
  end: number,
  lens: Lens,
  scale: LensScale,
  finished: readonly boolean[] = [],
): RunStats {
  const columns = team.cells.slice(start, end);
  const rated = columns.flat().filter((cell) => lensValue(cell, lens) !== null);
  const values = rated.map((cell) => lensValue(cell, lens) as number);
  const totals = columns.map((cells, i) => columnTotal(cells, lens, finished[start + i] ?? false));
  const counted = totals.filter((v): v is number => v !== null);
  return {
    total: counted.length ? counted.reduce((sum, v) => sum + v, 0) : null,
    average: values.length ? values.reduce((sum, v) => sum + v, 0) / values.length : null,
    fixtures: values.length,
    blanks: columns.filter((cells, i) => cells.length === 0 && !finished[start + i]).length,
    doubles: columns.filter((cells) => cells.length > 1).length,
    home: rated.filter((cell) => cell.venue === "H").length,
    buckets: rated.map((cell) => cellBucket(cell, lens, scale) as Bucket),
  };
}

export function sortTeams(
  teams: GridTeam[],
  sort: SortState,
  start: number,
  end: number,
  lens: Lens,
  stats?: Map<string, RunStats>,
  finished: readonly boolean[] = [],
): GridTeam[] {
  const direction = sort.dir === "asc" ? 1 : -1;
  const byName = (a: GridTeam, b: GridTeam) => a.name.localeCompare(b.name);
  if (sort.key.kind === "team") return [...teams].sort((a, b) => byName(a, b) * direction);

  const key = sort.key;
  // Both sort values are totals (higher = easier), so doubles rank above singles and blanks sink.
  const values = new Map(
    teams.map((team) => [
      team.code,
      key.kind === "total"
        ? (stats?.get(team.code) ?? runStats(team, start, end, lens, NEUTRAL_SCALE, finished)).total
        : columnTotal(team.cells[key.column], lens, finished[key.column] ?? false),
    ]),
  );

  return [...teams].sort((a, b) => {
    const va = values.get(a.code) ?? null;
    const vb = values.get(b.code) ?? null;
    if (va === null && vb === null) return byName(a, b);
    if (va === null) return 1; // teams without a value always go last
    if (vb === null) return -1;
    return (vb - va) * direction || byName(a, b);
  });
}

// Placeholder scale for sorting code paths that only need totals, not buckets.
const NEUTRAL_SCALE: LensScale = { cuts: [0, 0, 0, 0], higher_is_easier: true };

export function formatLensValue(value: number, lens: Lens): string {
  if (lens === "overall") return String(Math.round(value));
  if (lens === "attack") return value.toFixed(2);
  return `${Math.round(value * 100)}%`;
}

export function formatTotal(value: number): string {
  return value.toFixed(1);
}

/** Pinned teams first (in the current sort order), then everyone else. */
export function withPinsFirst(rows: GridTeam[], pins: readonly string[]): { pinned: GridTeam[]; others: GridTeam[] } {
  const set = new Set(pins);
  return { pinned: rows.filter((t) => set.has(t.code)), others: rows.filter((t) => !set.has(t.code)) };
}

/**
 * Where the board opens: the first matchday where fewer than half the games are done,
 * so it doesn't open on a round that's all but finished (one moved game shouldn't hold it back).
 */
export function openingColumn(grid: FixtureGrid): number {
  const total = grid.matchdays.length;
  for (let column = 0; column < total; column++) {
    const cells = grid.teams.flatMap((team) => team.cells[column] ?? []);
    const done = cells.filter((cell) => cell.status === "finished" || cell.status === "postponed").length;
    if (cells.length > 0 && done / cells.length < 0.5) return column;
  }
  return Math.max(0, total - 1);
}

export interface Target {
  team: GridTeam;
  stats: RunStats;
}

/** Teams with the most to gain over the window on this lens. */
export function bestTargets(teams: GridTeam[], stats: Map<string, RunStats>, count = 3): Target[] {
  return teams
    .map((team) => ({ team, stats: stats.get(team.code)! }))
    .filter((entry) => entry.stats && entry.stats.total !== null && entry.stats.fixtures > 0)
    .sort((a, b) => b.stats.total! - a.stats.total! || a.team.name.localeCompare(b.team.name))
    .slice(0, count);
}

export interface RotationPair {
  first: GridTeam;
  second: GridTeam;
  total: number; // sum over the window of the better of the two each matchday
}

/**
 * The two teams whose fixtures complement each other best: each matchday you'd start whichever has
 * the better game. With pins, the pair must include a pinned team (both, if two or more are pinned).
 */
export function rotationPair(
  teams: GridTeam[],
  start: number,
  end: number,
  lens: Lens,
  finished: readonly boolean[] = [],
  pins: readonly string[] = [],
): RotationPair | null {
  const values = new Map(
    teams.map((team) => [
      team.code,
      Array.from({ length: end - start }, (_, i) => columnTotal(team.cells[start + i], lens, finished[start + i] ?? false) ?? 0),
    ]),
  );
  const pinned = new Set(pins);
  let best: RotationPair | null = null;
  for (let i = 0; i < teams.length; i++) {
    for (let j = i + 1; j < teams.length; j++) {
      const [a, b] = [teams[i]!, teams[j]!];
      const pinnedInPair = Number(pinned.has(a.code)) + Number(pinned.has(b.code));
      if (pinned.size === 1 && pinnedInPair === 0) continue;
      if (pinned.size >= 2 && pinnedInPair < 2) continue;
      const va = values.get(a.code)!;
      const vb = values.get(b.code)!;
      const total = va.reduce((sum, v, k) => sum + Math.max(v, vb[k] ?? 0), 0);
      if (total > 0 && (!best || total > best.total + 1e-9)) best = { first: a, second: b, total };
    }
  }
  return best;
}

// ---------------------------------------------------------------- view state in the URL

export type View = "fdr" | "plain";
export type Horizon = "3" | "5" | "8" | "all";
export const HORIZON_VALUES: readonly Horizon[] = ["3", "5", "8", "all"];
const LENSES: readonly Lens[] = ["overall", "attack", "defence"];
export const MAX_PINS = 6;

export interface ViewState {
  view: View;
  lens: Lens;
  horizon: Horizon;
  from: number | null; // first matchday number shown; null = the opening matchday
  pins: string[];
  played: boolean; // allow stepping back into played matchdays
}

export const DEFAULT_VIEW: ViewState = { view: "fdr", lens: "overall", horizon: "8", from: null, pins: [], played: false };

/** Read ?view=&lens=&h=&from=&pins=&played= leniently: anything unknown falls back to the default. */
export function parseViewState(params: URLSearchParams, knownCodes: ReadonlySet<string>): Partial<ViewState> {
  const state: Partial<ViewState> = {};
  const view = params.get("view");
  if (view === "fdr" || view === "plain") state.view = view;
  const lens = params.get("lens");
  if (lens && (LENSES as readonly string[]).includes(lens)) state.lens = lens as Lens;
  const horizon = params.get("h");
  if (horizon && (HORIZON_VALUES as readonly string[]).includes(horizon)) state.horizon = horizon as Horizon;
  const from = Number(params.get("from"));
  if (params.has("from") && Number.isInteger(from) && from > 0) state.from = from;
  if (params.has("pins")) state.pins = parsePins(params.get("pins"), knownCodes);
  if (params.get("played") === "1") state.played = true;
  return state;
}

export function parsePins(raw: string | null, knownCodes: ReadonlySet<string>): string[] {
  const codes = (raw ?? "").split(",").map((code) => code.trim().toUpperCase());
  return [...new Set(codes.filter((code) => knownCodes.has(code)))].slice(0, MAX_PINS);
}

/** Query string with only the non-default parts, so a plain visit keeps a clean URL. */
export function serializeViewState(state: ViewState): string {
  const params = new URLSearchParams();
  if (state.view !== DEFAULT_VIEW.view) params.set("view", state.view);
  if (state.lens !== DEFAULT_VIEW.lens) params.set("lens", state.lens);
  if (state.horizon !== DEFAULT_VIEW.horizon) params.set("h", state.horizon);
  if (state.from !== null) params.set("from", String(state.from));
  if (state.pins.length) params.set("pins", state.pins.join(","));
  if (state.played) params.set("played", "1");
  return params.toString();
}

const MADRID = "Europe/Madrid";
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
// Numeric parts only, so output doesn't depend on the locale's month abbreviations ("Sept" vs "Sep").
const partsFormat = new Intl.DateTimeFormat("en-GB", {
  timeZone: MADRID, weekday: "short", day: "numeric", month: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
});

function madridParts(iso: string): Record<string, string> {
  return Object.fromEntries(partsFormat.formatToParts(new Date(iso)).map((part) => [part.type, part.value]));
}

export function formatDay(iso: string): string {
  const parts = madridParts(iso);
  return `${Number(parts.day)} ${MONTHS[Number(parts.month) - 1]}`;
}

export function formatKickoff(iso: string): string {
  const parts = madridParts(iso);
  return `${parts.weekday} ${formatDay(iso)}, ${parts.hour}:${parts.minute}`;
}

/** Spoken label for a fixture tile: everything the colour and the tooltip convey, in words. */
export function cellLabel(cell: GridCell, team: string, matchday: number, opponent: string, lens: Lens): string {
  const head = `Matchday ${matchday}, ${team} ${cell.venue === "H" ? "at home to" : "away to"} ${opponent}`;
  if (cell.status === "finished" && cell.result) {
    const { goals_for, goals_against, outcome } = cell.result;
    const verb = outcome === "W" ? "won" : outcome === "D" ? "drew" : "lost";
    return `${head}, ${verb} ${goals_for}–${goals_against}`;
  }
  if (cell.status === "postponed") return `${head}, postponed`;
  const when = cell.status === "live"
    ? "live now"
    : cell.date_confirmed
      ? formatKickoff(cell.kickoff_utc)
      : `date to be confirmed, weekend of ${formatDay(cell.kickoff_utc)}`;
  const parts = [head, when];
  const p = cell.prediction;
  if (p) {
    parts.push(`difficulty ${Math.round(p.difficulty)} of 100, ${p.label}`);
    if (lens === "attack" && p.xg_for !== null) parts.push(`expected goals ${p.xg_for.toFixed(2)}`);
    if (lens === "defence" && p.clean_sheet !== null) parts.push(`clean sheet chance ${Math.round(p.clean_sheet * 100)}%`);
  }
  return parts.join(", ");
}

export function relativeTime(iso: string, now: Date = new Date()): string {
  const minutes = Math.round((now.getTime() - new Date(iso).getTime()) / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours} h ago`;
  return `${Math.round(hours / 24)} days ago`;
}
