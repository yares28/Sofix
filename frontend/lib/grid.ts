import type { Bucket, GridCell, GridTeam, Lens, LensScale } from "./types";

export type { Bucket };
export type SortKey = { kind: "team" } | { kind: "average" } | { kind: "matchday"; column: number };
export interface SortState {
  key: SortKey;
  dir: "asc" | "desc"; // asc = A→Z for teams, easiest first otherwise
}

// Saturated variants for thin marks (bars, strips) where the pale tiles would disappear.
export const BUCKET_STRONG: Record<Bucket, string> = { 1: "#248a5a", 2: "#5cc58d", 3: "#c7c7cc", 4: "#ff7b6e", 5: "#c4312a" };

export const LENS_COPY: Record<Lens, { label: string; average: string; hint: string }> = {
  overall: { label: "Overall", average: "Avg difficulty", hint: "Result difficulty, 0–100" },
  attack: { label: "Attack", average: "Avg xG", hint: "Expected goals scored" },
  defence: { label: "Defence", average: "Avg clean sheet", hint: "Chance of a clean sheet" },
};

// Placeholder scale for sorting code paths that only need averages, not buckets.
const NEUTRAL_SCALE: LensScale = { cuts: [0, 0, 0, 0], higher_is_easier: true };

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

/** Higher = easier, so every lens sorts the same way. */
export function ease(value: number, lens: Lens): number {
  return lens === "overall" ? -value : value;
}

export function windowRange(total: number, start: number, horizon: number): { start: number; end: number } {
  const safeStart = Math.min(Math.max(0, start), Math.max(0, total - 1));
  return { start: safeStart, end: Math.min(total, safeStart + horizon) };
}

export interface RunStats {
  average: number | null;
  fixtures: number;
  home: number;
  buckets: Bucket[];
}

export function runStats(team: GridTeam, start: number, end: number, lens: Lens, scale: LensScale): RunStats {
  const upcoming = team.cells.slice(start, end).flat().filter((cell) => lensValue(cell, lens) !== null);
  const values = upcoming.map((cell) => lensValue(cell, lens) as number);
  return {
    average: values.length ? values.reduce((sum, v) => sum + v, 0) / values.length : null,
    fixtures: values.length,
    home: upcoming.filter((cell) => cell.venue === "H").length,
    buckets: upcoming.map((cell) => cellBucket(cell, lens, scale) as Bucket),
  };
}

function firstValue(team: GridTeam, column: number, lens: Lens): number | null {
  const cell = team.cells[column]?.find((c) => c.prediction);
  return cell ? lensValue(cell, lens) : null;
}

export function sortTeams(
  teams: GridTeam[], sort: SortState, start: number, end: number, lens: Lens, stats?: Map<string, RunStats>,
): GridTeam[] {
  const direction = sort.dir === "asc" ? 1 : -1;
  const byName = (a: GridTeam, b: GridTeam) => a.name.localeCompare(b.name);
  if (sort.key.kind === "team") return [...teams].sort((a, b) => byName(a, b) * direction);

  const key = sort.key;
  const values = new Map(teams.map((team) => [
    team.code,
    key.kind === "average"
      ? (stats?.get(team.code) ?? runStats(team, start, end, lens, NEUTRAL_SCALE)).average
      : firstValue(team, key.column, lens),
  ]));

  return [...teams].sort((a, b) => {
    const va = values.get(a.code) ?? null;
    const vb = values.get(b.code) ?? null;
    if (va === null && vb === null) return byName(a, b);
    if (va === null) return 1; // teams without a value always go last
    if (vb === null) return -1;
    return (ease(vb, lens) - ease(va, lens)) * direction || byName(a, b);
  });
}

export function formatLensValue(value: number, lens: Lens): string {
  if (lens === "overall") return String(Math.round(value));
  if (lens === "attack") return value.toFixed(2);
  return `${Math.round(value * 100)}%`;
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

export function relativeTime(iso: string, now: Date = new Date()): string {
  const minutes = Math.round((now.getTime() - new Date(iso).getTime()) / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours} h ago`;
  return `${Math.round(hours / 24)} days ago`;
}
