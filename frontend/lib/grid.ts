import type { Bucket, CellMarket, FixtureGrid, GridCell, GridMatchday, GridTeam, Lens, LensScale } from "./types";

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
  odds: {
    label: "Odds",
    hint: "Tiles: the bookmakers' win chance. Total: market points per priced game (3 × win + draw), so clubs aren't ranked by how many of their games are priced yet",
    easy: "Favourite",
    hard: "Long shot",
    total: "Mkt/gm",
    totalLong: "market points per priced game",
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
  if (lens === "odds") return cell.market ? scaleBucket(cell.market.win, scale) : null; // needs a price, not a prediction
  if (!cell.prediction) return null;
  if (lens === "overall") return cell.prediction.bucket;
  const value = lensValue(cell, lens);
  return value === null ? null : scaleBucket(value, scale);
}

export function lensValue(cell: GridCell, lens: Lens): number | null {
  if (lens === "odds") return cell.market?.win ?? null;
  const prediction = cell.prediction;
  if (!prediction) return null;
  if (lens === "overall") return prediction.difficulty;
  if (lens === "attack") return prediction.xg_for;
  return prediction.clean_sheet;
}

/**
 * What a game is worth over a run, higher = better for the team: expected points (overall),
 * expected goals (attack), clean-sheet chance (defence) or market points from the bookmakers (odds). These add up, so a blank week adds 0
 * and a double week counts both games — which averages hide.
 */
export function runValue(cell: GridCell, lens: Lens): number | null {
  if (lens === "odds") return cell.market?.expected_points ?? null;
  const prediction = cell.prediction;
  if (!prediction) return null;
  if (lens === "overall") return prediction.expected_points;
  if (lens === "attack") return prediction.xg_for;
  return prediction.clean_sheet;
}

/**
 * One team's matchday: 0 for a blank week that's still to come, the sum over a double,
 * null when nothing in it can be rated (already played, postponed, or a past blank).
 * The odds lens is per priced game instead (bookmakers price a round or two ahead, and a club that already played
 * has no price): a double is averaged and a blank is null.
 */
export function columnTotal(cells: GridCell[] | undefined, lens: Lens, finished = false): number | null {
  if (!cells || cells.length === 0) return finished || lens === "odds" ? null : 0;
  const values = cells.map((cell) => runValue(cell, lens)).filter((v): v is number => v !== null);
  if (!values.length) return null;
  const sum = values.reduce((total, v) => total + v, 0);
  return lens === "odds" ? sum / values.length : sum;
}

export function windowRange(total: number, start: number, horizon: number): { start: number; end: number } {
  const safeStart = Math.min(Math.max(0, start), Math.max(0, total - 1));
  return { start: safeStart, end: Math.min(total, safeStart + horizon) };
}

export interface RunStats {
  total: number | null; // sum of runValue over the window, blank weeks 0; odds lens: mean per priced game
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
  const priced = columns.flat().map((cell) => runValue(cell, lens)).filter((v): v is number => v !== null);
  const total =
    lens === "odds"
      ? priced.length ? priced.reduce((sum, v) => sum + v, 0) / priced.length : null
      : counted.length ? counted.reduce((sum, v) => sum + v, 0) : null;
  return {
    total,
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
  return `${Math.round(value * 100)}%`; // defence: clean-sheet chance; odds: win chance
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

export type Position = "forwards" | "midfielders" | "defenders";

export interface PositionPick {
  team: GridTeam;
  xg: number; // expected goals over the window (blank weeks 0, doubles both)
  cleanSheets: number; // expected clean sheets over the window
  fixtures: number;
  score: number; // what the ranking used; higher = better picks
}

/** Share of a midfielder's value from attacking returns; the rest from clean sheets. */
export const MIDFIELD_ATTACK_WEIGHT = 0.65;

const zScores = (values: number[]) => {
  const mean = values.reduce((s, v) => s + v, 0) / (values.length || 1);
  const sd = Math.sqrt(values.reduce((s, v) => s + (v - mean) ** 2, 0) / (values.length || 1)) || 1;
  return values.map((v) => (v - mean) / sd);
};

/**
 * Which clubs to buy players from over the window, by position:
 * forwards live on goals (expected goals), defenders and keepers on clean sheets (expected clean sheets),
 * midfielders on both — mostly attacking returns, so a 65/35 blend of the two, each standardised
 * across the league so goals and clean sheets count on the same scale.
 */
export function positionPicks(
  teams: GridTeam[],
  attack: Map<string, RunStats>,
  defence: Map<string, RunStats>,
  count = 4,
): Record<Position, PositionPick[]> {
  const rows = teams
    .map((team) => ({
      team,
      xg: attack.get(team.code)?.total ?? null,
      cleanSheets: defence.get(team.code)?.total ?? null,
      fixtures: attack.get(team.code)?.fixtures ?? 0,
    }))
    .filter((row): row is { team: GridTeam; xg: number; cleanSheets: number; fixtures: number } =>
      row.xg !== null && row.cleanSheets !== null && row.fixtures > 0,
    );
  const zXg = zScores(rows.map((r) => r.xg));
  const zCs = zScores(rows.map((r) => r.cleanSheets));
  const rank = (score: (i: number) => number) =>
    rows
      .map((row, i) => ({ ...row, score: score(i) }))
      .sort((a, b) => b.score - a.score || a.team.name.localeCompare(b.team.name))
      .slice(0, count);
  return {
    forwards: rank((i) => rows[i]!.xg),
    midfielders: rank((i) => MIDFIELD_ATTACK_WEIGHT * zXg[i]! + (1 - MIDFIELD_ATTACK_WEIGHT) * zCs[i]!),
    defenders: rank((i) => rows[i]!.cleanSheets),
  };
}

/**
 * The kindest and toughest runs by expected points per game (overall stats), so a club that already played a
 * game of the window, has a blank or a double isn't picked for its game count. Null when fewer than two clubs
 * have games to rate.
 */
export function kindestAndToughest(teams: GridTeam[], overall: Map<string, RunStats>): { kindest: GridTeam; toughest: GridTeam } | null {
  const perGame = (team: GridTeam) => {
    const s = overall.get(team.code);
    return s && s.fixtures > 0 && s.total !== null ? s.total / s.fixtures : null;
  };
  const rated = teams
    .map((team) => ({ team, value: perGame(team) }))
    .filter((row): row is { team: GridTeam; value: number } => row.value !== null)
    .sort((a, b) => b.value - a.value || a.team.name.localeCompare(b.team.name));
  return rated.length < 2 ? null : { kindest: rated[0]!.team, toughest: rated[rated.length - 1]!.team };
}

/** The overview's window: from the selected gameweek, with "All" shown as 8 (a season of chips doesn't fit a row). */
export function overviewWindow(total: number, start: number, horizon: Horizon): { start: number; end: number; horizon: Exclude<Horizon, "all"> } {
  const shown = horizon === "all" ? "8" : horizon;
  return { ...windowRange(total, start, horizonSize(shown, total)), horizon: shown };
}

/** "GW6–GW10", "GW6", or "" when there are no gameweeks. */
export function windowLabel(matchdays: readonly { number: number }[], start: number, end: number): string {
  const first = matchdays[start]?.number;
  const last = matchdays[end - 1]?.number;
  if (first === undefined || last === undefined) return "";
  return first === last ? `GW${first}` : `GW${first}–GW${last}`;
}

// ---------------------------------------------------------------- view state in the URL

export type View = "plain" | "fdr" | "table"; // Fixtures, Difficulty, Table tabs
export type Horizon = "next" | "3" | "5" | "8" | "all"; // "next" = one gameweek as match cards
export type TableMode = "current" | "predicted";
export const HORIZON_VALUES: readonly Horizon[] = ["next", "3", "5", "8", "all"];
const LENSES = Object.keys(LENS_COPY) as Lens[];
export const MAX_PINS = 6;

/** How many gameweek columns a horizon covers. */
export function horizonSize(horizon: Horizon, total: number): number {
  if (horizon === "all") return total;
  return horizon === "next" ? 1 : Number(horizon);
}

export interface ViewState {
  view: View;
  lens: Lens;
  horizon: Horizon;
  gw: number | null; // the app-wide gameweek every tab and card starts from; null = the opening gameweek
  pins: string[];
  table: TableMode;
}

export const DEFAULT_VIEW: ViewState = {
  view: "fdr", lens: "overall", horizon: "5", gw: null, pins: [], table: "current",
};

/** Read ?view=&lens=&h=&gw=&pins=&t= leniently: anything unknown falls back to the default. */
export function parseViewState(params: URLSearchParams, knownCodes: ReadonlySet<string>): Partial<ViewState> {
  const state: Partial<ViewState> = {};
  const view = params.get("view");
  if (view === "fdr" || view === "plain" || view === "table") state.view = view;
  if (view === "next") Object.assign(state, { view: "fdr", horizon: "next" }); // links from before "Next" moved
  if (params.get("t") === "predicted") state.table = "predicted";
  const lens = params.get("lens");
  if (lens && (LENSES as readonly string[]).includes(lens)) state.lens = lens as Lens;
  const horizon = params.get("h");
  if (horizon && (HORIZON_VALUES as readonly string[]).includes(horizon)) state.horizon = horizon as Horizon;
  const gw = Number(params.get("gw") ?? params.get("from")); // ?from= is the old name
  if ((params.has("gw") || params.has("from")) && Number.isInteger(gw) && gw > 0) state.gw = gw;
  if (params.has("pins")) state.pins = parsePins(params.get("pins"), knownCodes);
  return state;
}

/** The column of the selected gameweek; the opening gameweek when none (or an unknown one) is selected. */
export function selectedColumn(matchdays: readonly Pick<GridMatchday, "number">[], gw: number | null, opening: number): number {
  const index = gw === null ? -1 : matchdays.findIndex((md) => md.number === gw);
  return index >= 0 ? index : opening;
}

// ---------------------------------------------------------------- bookmaker odds

/** Decimal odds for a fair probability ("2.50"); the backend already removed the bookmaker margin. */
export function decimalOdds(probability: number): string {
  if (!(probability > 0)) return "—";
  const price = 1 / probability;
  return price >= 100 ? "99+" : price.toFixed(2);
}

export interface OddsLine {
  label: string;
  price: string;
  spoken: string;
}

/** What the market says for this lens: result odds (overall, odds), scoring (attack), clean sheet and conceding (defence). */
export function marketLines(market: CellMarket, lens: Lens): OddsLine[] {
  const line = (label: string, spoken: string, probability: number): OddsLine => ({
    label,
    price: decimalOdds(probability),
    spoken: `${spoken} ${decimalOdds(probability)}`,
  });
  if (lens === "attack") return [line("Scores", "to score", market.scores), line("2+", "to score 2 or more", market.scores_2plus)];
  if (lens === "defence") {
    return [line("CS", "clean sheet", market.clean_sheet), line("Conc 2+", "to concede 2 or more", market.concedes_2plus)];
  }
  return [line("W", "win", market.win), line("D", "draw", market.draw), line("L", "loss", market.loss)];
}

/** Column labels for a lens' prices (the same order as marketLines). */
export function marketLabels(lens: Lens): string[] {
  if (lens === "attack") return ["Scores", "2+"];
  if (lens === "defence") return ["CS", "Conc 2+"];
  return ["W", "D", "L"];
}

export interface PriceOption {
  label: string; // in the Price menu
  short: string; // for screen readers: "win price 1.45"
  probability: (market: CellMarket) => number;
}

/** The prices a tile can show, per lens; the first is the default. "Win or draw" is double chance. */
export const PRICE_OPTIONS: Record<Lens, PriceOption[]> = (() => {
  const result: PriceOption[] = [
    { label: "Win", short: "win", probability: (m) => m.win },
    { label: "Draw", short: "draw", probability: (m) => m.draw },
    { label: "Loss", short: "loss", probability: (m) => m.loss },
    { label: "Win or draw", short: "win or draw", probability: (m) => m.win + m.draw },
  ];
  return {
    overall: result,
    odds: result,
    attack: [
      { label: "To score", short: "to score", probability: (m) => m.scores },
      { label: "2+ goals", short: "to score 2 or more", probability: (m) => m.scores_2plus },
    ],
    defence: [
      { label: "Clean sheet", short: "clean sheet", probability: (m) => m.clean_sheet },
      { label: "Concede 2+", short: "to concede 2 or more", probability: (m) => m.concedes_2plus },
    ],
  };
})();

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
  if (state.gw !== null) params.set("gw", String(state.gw));
  if (state.pins.length) params.set("pins", state.pins.join(","));
  if (state.table !== DEFAULT_VIEW.table) params.set("t", state.table);
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

/** "Sat 21:00" (Madrid): for lists already grouped under one gameweek. */
export function formatShortKickoff(iso: string): string {
  const parts = madridParts(iso);
  return `${parts.weekday} ${parts.hour}:${parts.minute}`;
}

export function formatKickoff(iso: string): string {
  const parts = madridParts(iso);
  return `${parts.weekday} ${formatDay(iso)}, ${parts.hour}:${parts.minute}`;
}

/** Spoken label for a fixture tile: everything the colour and the tooltip convey, in words. */
export function cellLabel(cell: GridCell, team: string, matchday: number, opponent: string, lens: Lens): string {
  const head = `Gameweek ${matchday}, ${team} ${cell.venue === "H" ? "at home to" : "away to"} ${opponent}`;
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
  if (lens === "odds") {
    parts.push(cell.market ? `bookmakers' win price ${decimalOdds(cell.market.win)}` : "not priced by bookmakers yet");
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
