import type { Bucket, CellMarket, CellRecord, FixtureGrid, GridCell, GridMatchday, GridTeam, Lens, LensScale } from "./types";

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
    hint: "Tiles: result difficulty 0–100, coloured by how often clubs actually win at that difficulty, home or away. Total: expected points",
    easy: "Very favourite",
    hard: "Big underdog",
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
  record: {
    label: "Record",
    hint: "Tiles: how often this club wins games like this one, next to how often the league does. Total: that gap, per game",
    easy: "Wins more than most",
    hard: "Wins less than most",
    total: "Gap",
    totalLong: "gap against the league, per game",
  },
  market_record: {
    label: "Vs odds",
    hint: "The same, but games are grouped by the bookmakers' price instead of ours — so only games with a price get a colour",
    easy: "Wins more than most",
    hard: "Wins less than most",
    total: "Gap",
    totalLong: "gap against the league, per game",
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

/** Lenses whose run total is a mean per rated game rather than a sum: prices and rates don't add up. */
const AVERAGED = new Set<Lens>(["odds", "record", "market_record"]);

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
  if (lens === "record" || lens === "market_record") {
    const value = lensValue(cell, lens);
    return value === null ? null : scaleBucket(value, scale);
  }
  if (!cell.prediction) return null;
  if (lens === "overall") return cell.prediction.bucket;
  const value = lensValue(cell, lens);
  return value === null ? null : scaleBucket(value, scale);
}

export function lensValue(cell: GridCell, lens: Lens): number | null {
  // A played game keeps the forecast it had before kickoff (for the review), but nothing on the board
  // rates it any more: colours, totals and cut points are all about the games still to come.
  if (cell.status === "finished") return null;
  if (lens === "odds") return cell.market?.win ?? null;
  if (lens === "record") return cell.record?.edge ?? null; // needs a past record, not a prediction
  if (lens === "market_record") return cell.record_price?.edge ?? null;
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
  if (cell.status === "finished") return null; // history, not a game still to come (see lensValue)
  if (lens === "odds") return cell.market?.expected_points ?? null;
  // An edge is a rate, not a quantity: it averages over a run instead of adding up (see columnTotal).
  if (lens === "record" || lens === "market_record") return lensValue(cell, lens);
  const prediction = cell.prediction;
  if (!prediction) return null;
  if (lens === "overall") return prediction.expected_points;
  if (lens === "attack") return prediction.xg_for;
  return prediction.clean_sheet;
}

/**
 * What a game that has already been played was worth on this lens, from the forecast it carried before
 * kickoff. Kept out of every total (see runValue): it is there to be looked back at, not counted.
 */
export function playedValue(cell: GridCell, lens: Lens): number | null {
  if (cell.status !== "finished") return null;
  if (lens === "record") return cell.record?.edge ?? null;
  const prediction = cell.prediction;
  if (!prediction) return null;
  if (lens === "overall") return prediction.expected_points;
  if (lens === "attack") return prediction.xg_for;
  if (lens === "defence") return prediction.clean_sheet;
  return null; // odds and vs odds: the bookmakers' prices go once a game kicks off
}

/**
 * One team's matchday: 0 for a blank week that's still to come, the sum over a double,
 * null when nothing in it can be rated (already played, postponed, or a past blank).
 * The odds lens is per priced game instead (bookmakers price a round or two ahead, and a club that already played
 * has no price): a double is averaged and a blank is null.
 */
export function columnTotal(cells: GridCell[] | undefined, lens: Lens, finished = false): number | null {
  if (!cells || cells.length === 0) return finished || AVERAGED.has(lens) ? null : 0;
  const values = cells.map((cell) => runValue(cell, lens)).filter((v): v is number => v !== null);
  if (!values.length) return null;
  const sum = values.reduce((total, v) => total + v, 0);
  return AVERAGED.has(lens) ? sum / values.length : sum;
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
  const total = AVERAGED.has(lens)
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
  // An edge is a gap between two rates, so it reads in points and always carries its sign.
  if (lens === "record" || lens === "market_record") return formatEdge(value);
  return `${Math.round(value * 100)}%`; // defence: clean-sheet chance; odds: win chance
}

/**
 * Below this a played result counts as a shock: the forecast put less than a fifth of its probability on
 * results this odd or odder (app/services/postmortem.py). One game in five or six on an ordinary weekend.
 */
export const SHOCK = 0.2;

/** An edge as percentage points, signed: +6 pts, −4 pts, level. */
export function formatEdge(value: number): string {
  const points = Math.round(value * 100);
  if (points === 0) return "level";
  return `${points > 0 ? "+" : "−"}${Math.abs(points)} pts`;
}

export function formatTotal(value: number, lens?: Lens): string {
  if (lens === "record" || lens === "market_record") return formatEdge(value); // an average edge, not a sum
  return value.toFixed(1);
}

/** A price band as the board writes it: "35-50%" from the API reads "35–50%". */
export function bandWords(band: string): string {
  return band.replace("-", "–");
}

export interface RecordCopy {
  headline: string;
  evidence: string | null;
}

/**
 * The club's record at this price in one sentence, with the counts and the band underneath.
 * The rate covers the whole band, not the exact price in the headline, so the band has to be shown:
 * "Wins 38% of games at odds 2.60 (38%)" / "24 of 63 priced 35–50% · league 44% · −6 pts".
 */
export function recordCopy(record: CellRecord | null | undefined, chance: number | null, priced: boolean): RecordCopy {
  if (!record) {
    return { headline: priced ? "No record at these odds yet" : "No record at this rating yet", evidence: null };
  }
  const pct = (value: number) => `${Math.round(value * 100)}%`;
  const at =
    chance === null
      ? priced ? "priced like this" : "rated like this"
      : priced
        ? `at odds ${decimalOdds(chance)} (${pct(chance)})`
        : `rated ${pct(chance)}`;
  return {
    headline: `Wins ${pct(record.rate)} of games ${at}`,
    evidence: `${record.wins} of ${record.games} ${priced ? "priced" : "rated"} ${bandWords(record.band)} · league ${pct(record.league)} · ${formatEdge(record.edge)}`,
  };
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

const perGame = (stats: RunStats | undefined) =>
  stats && stats.fixtures > 0 && stats.total !== null ? stats.total / stats.fixtures : null;

function bestAndWorst(rows: { team: GridTeam; value: number }[]): { best: GridTeam; worst: GridTeam } | null {
  const sorted = [...rows].sort((a, b) => b.value - a.value || a.team.name.localeCompare(b.team.name));
  return sorted.length < 2 ? null : { best: sorted[0]!.team, worst: sorted[sorted.length - 1]!.team };
}

/**
 * The clubs with the most and fewest expected points per game (overall stats), so a club that already played a
 * game of the window, has a blank or a double isn't picked for its game count. Null when fewer than two clubs
 * have games to rate.
 *
 * This ranks the match-ups, which is mostly club strength: over nine backtested seasons the top of this list was
 * a top-three club on every Monday. For a soft schedule, see scheduleSwing.
 */
export function mostPointsComing(teams: GridTeam[], overall: Map<string, RunStats>): { best: GridTeam; worst: GridTeam } | null {
  const rows = teams
    .map((team) => ({ team, value: perGame(overall.get(team.code)) }))
    .filter((row): row is { team: GridTeam; value: number } => row.value !== null);
  return bestAndWorst(rows);
}

export interface Swing { team: GridTeam; swing: number } // expected points above (+) or below (−) the club's usual, per game

/**
 * The softest and hardest schedules: the window compared with the club's own usual level, which is what a
 * "kind run" normally means. Swing per game = the window's expected points per game minus the club's expected
 * points per game over all its remaining fixtures from the same gameweek, so a strong club with a normal run
 * sits at zero.
 *
 * A club needs at least twice the window left to rate, as in the backtest: with less, the window is most of the
 * baseline and the comparison says nothing. Null when fewer than two clubs qualify (late in the season).
 */
export function scheduleSwing(
  teams: GridTeam[],
  window: Map<string, RunStats>,
  rest: Map<string, RunStats>,
): { best: Swing; worst: Swing } | null {
  const rows = teams
    .map((team) => {
      const run = window.get(team.code);
      const baseline = rest.get(team.code);
      if (!run || !baseline || baseline.fixtures < 2 * run.fixtures) return { team, value: null };
      const here = perGame(run);
      const usual = perGame(baseline);
      return { team, value: here === null || usual === null ? null : here - usual };
    })
    .filter((row): row is { team: GridTeam; value: number } => row.value !== null);
  const picked = bestAndWorst(rows);
  if (!picked) return null;
  const swingOf = (team: GridTeam) => rows.find((row) => row.team.code === team.code)!.value;
  return { best: { team: picked.best, swing: swingOf(picked.best) }, worst: { team: picked.worst, swing: swingOf(picked.worst) } };
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
/** Each tab has its own address; the rest of the board's settings stay in the query string. */
export const VIEW_PATH: Record<View, string> = { plain: "/fixtures", fdr: "/difficulty", table: "/table" };
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

/** Query keys that only ever meant the board, from when it lived at "/" (the home page reads just ?gw=). */
const BOARD_KEYS = ["view", "lens", "h", "pins", "t", "board", "from"];

/**
 * Where an old board link ("/?view=table&t=predicted", "/?h=next", "/?from=6") lives now, or null when the
 * link is a home page link. Unknown values are left for the board to ignore, as they always were.
 */
export function legacyBoardUrl(params: URLSearchParams): string | null {
  if (!BOARD_KEYS.some((key) => params.has(key))) return null;
  const view = params.get("view");
  const path = view === "plain" ? VIEW_PATH.plain : view === "table" ? VIEW_PATH.table : VIEW_PATH.fdr;
  const next = new URLSearchParams(params);
  next.delete("view");
  next.delete("board");
  if (view === "next" && !next.has("h")) next.set("h", "next");
  if (next.has("from") && !next.has("gw")) next.set("gw", next.get("from")!);
  next.delete("from");
  const query = next.toString();
  return query ? `${path}?${query}` : path;
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
  if (lens === "attack") {
    return [
      line("Scores", "to score", market.scores),
      line("2+", "to score 2 or more", market.scores_2plus),
      line("BTS", "both teams to score", market.both_score),
    ];
  }
  if (lens === "defence") {
    return [line("CS", "clean sheet", market.clean_sheet), line("Conc 2+", "to concede 2 or more", market.concedes_2plus)];
  }
  return [line("W", "win", market.win), line("D", "draw", market.draw), line("L", "loss", market.loss)];
}

/** Column labels for a lens' prices (the same order as marketLines). */
export function marketLabels(lens: Lens): string[] {
  if (lens === "attack") return ["Scores", "2+", "BTS"];
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
    { label: "Both score", short: "both teams to score", probability: (m) => m.both_score },
  ];
  return {
    overall: result,
    odds: result,
    record: result,
    market_record: result,
    attack: [
      { label: "To score", short: "to score", probability: (m) => m.scores },
      { label: "2+ goals", short: "to score 2 or more", probability: (m) => m.scores_2plus },
      { label: "Both score", short: "both teams to score", probability: (m) => m.both_score },
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

/** Query string with only the non-default parts, so a plain visit keeps a clean URL. The tab is the path (VIEW_PATH). */
export function serializeViewState(state: ViewState): string {
  const params = new URLSearchParams();
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
    const said = cell.review ? `, the board gave that result ${Math.round(cell.review.outcome_chance * 100)}%` : "";
    return `${head}, ${verb} ${goals_for}–${goals_against}${said}`;
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
  if (lens === "record" || lens === "market_record") {
    const record = lens === "record" ? cell.record : cell.record_price;
    const chance = lens === "record" ? (p?.probabilities.win ?? null) : (cell.market?.win ?? null);
    const copy = recordCopy(record, chance, lens === "market_record");
    parts.push(record ? `${copy.headline}, ${record.wins} of ${record.games}, ${formatEdge(record.edge)} against the league` : copy.headline);
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
