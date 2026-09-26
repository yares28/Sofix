import { SHOCK, cellBucket, formatDay, formatShortKickoff, runStats, windowRange } from "./grid";
import { gameweekMatches, type Match } from "./matches";
import { currentTable, type Outcome } from "./table";
import type { Bucket, FixtureGrid, GridCell, GridTeam, Venue } from "./types";

/**
 * The home page's tiles, from the same grid the board reads (no extra data). Design: docs/sorare/design/S2-home.html.
 * Everything here is pure so the server renders it and the tests pin it.
 */

const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;

/** "9–12 Oct", "30 Sep – 2 Oct" (Madrid dates). */
export function dateRange(from: string, to: string): string {
  const [a, b] = [formatDay(from), formatDay(to)];
  if (a === b) return a;
  const [dayA, monthA] = a.split(" ");
  const [dayB, monthB] = b.split(" ");
  return monthA === monthB ? `${dayA}–${dayB} ${monthB}` : `${a} – ${b}`;
}

// ---------------------------------------------------------------- head: the one hero number

export type HeadState =
  | { kind: "upcoming"; days: number; hours: number; kickoff: string; confirmed: boolean }
  | { kind: "live"; played: number; total: number }
  | { kind: "played"; shocks: number; total: number };

/** One Madrid day of the gameweek, and how many of its matches are already played. */
export interface HeadDay {
  label: string; // "9 Oct"
  weekday: string; // "Fri"
  day: string; // "9"
  matches: number;
  done: number;
}

export type HeadClub = Pick<GridTeam, "code" | "name" | "color" | "crest_url">;

/**
 * The one match the header points at. Upcoming: the clearest favourite. Live: the game on now, else the next one.
 * Played: the least expected result.
 */
export interface HeadSpotlight {
  home: HeadClub;
  away: HeadClub;
  pick: "home" | "away" | null;
  label: string;
  detail: string;
  chance: number | null;
  score: [number, number] | null;
  bar: { home: number; draw: number; away: number } | null;
}

export interface GameweekHead {
  number: number;
  from: string;
  to: string;
  matches: number;
  days: HeadDay[];
  spotlight: HeadSpotlight | null;
  state: HeadState;
}

const playedOut = (status: GridCell["status"]) => status === "finished";

const timesKnown = (grid: FixtureGrid, column: number) =>
  grid.teams.some((team) => (team.cells[column] ?? []).some((cell) => cell.date_confirmed));

const clubOf = (team: GridTeam): HeadClub => ({
  code: team.code,
  name: team.name,
  color: team.color,
  crest_url: team.crest_url,
});

/** Matches grouped by Madrid date, in kickoff order. */
function headDays(matches: Match[]): HeadDay[] {
  const days: HeadDay[] = [];
  for (const match of matches) {
    const label = formatDay(match.kickoff);
    const weekday = formatShortKickoff(match.kickoff).split(" ")[0] ?? "";
    const done = playedOut(match.homeCell.status) ? 1 : 0;
    const last = days[days.length - 1];
    if (last && last.label === label) {
      last.matches += 1;
      last.done += done;
    } else {
      days.push({ label, weekday, day: label.split(" ")[0] ?? "", matches: 1, done });
    }
  }
  return days;
}

function callOf(match: Match): { pick: "home" | "away" | null; chance: number; detail: string; bar: HeadSpotlight["bar"] } | null {
  const p = match.homeCell.prediction?.probabilities;
  if (!p) return null;
  const bar = { home: p.win, draw: p.draw, away: p.loss };
  if (Math.abs(p.win - p.loss) < 0.005) return { pick: null, chance: p.draw, detail: "level", bar };
  const pick = p.win > p.loss ? "home" : "away";
  const club = pick === "home" ? match.home : match.away;
  return { pick, chance: Math.max(p.win, p.loss), detail: `${club.name} to win`, bar };
}

function spotlightOf(match: Match, label: string, detail: string, chance: number | null, score: [number, number] | null, pick: "home" | "away" | null, bar: HeadSpotlight["bar"]): HeadSpotlight {
  return { home: clubOf(match.home), away: clubOf(match.away), pick, label, detail, chance, score, bar };
}

/** The match worth putting on the header, or nothing when the gameweek has no forecast and no result. */
function headSpotlight(matches: Match[], state: HeadState): HeadSpotlight | null {
  if (state.kind === "played") {
    const finished = matches.filter((m) => playedOut(m.homeCell.status) && m.homeCell.result);
    finished.sort((a, b) => (a.homeCell.review?.surprise ?? 2) - (b.homeCell.review?.surprise ?? 2) || Date.parse(a.kickoff) - Date.parse(b.kickoff));
    const match = finished[0];
    if (!match?.homeCell.result) return null;
    const review = match.homeCell.review;
    const { goals_for, goals_against } = match.homeCell.result;
    const shock = Boolean(review && review.surprise < SHOCK);
    return spotlightOf(match, shock ? "Shock" : "Least expected", "given this", review?.outcome_chance ?? null, [goals_for, goals_against], null, null);
  }
  if (state.kind === "live") {
    const live = matches.find((m) => m.homeCell.status === "live");
    const next = matches.find((m) => !playedOut(m.homeCell.status) && m.homeCell.status !== "live");
    const match = live ?? next;
    if (!match) return null;
    const call = callOf(match);
    const when = formatShortKickoff(match.kickoff);
    return spotlightOf(match, live ? "Live" : "Next", live ? (call?.detail ?? "on now") : when, call?.chance ?? null, null, call?.pick ?? null, call?.bar ?? null);
  }
  let best: { match: Match; call: NonNullable<ReturnType<typeof callOf>> } | null = null;
  for (const match of matches) {
    const call = callOf(match);
    if (call && (!best || call.chance > best.call.chance)) best = { match, call };
  }
  if (!best) return null;
  return spotlightOf(best.match, "Clearest", best.call.detail, best.call.chance, null, best.call.pick, best.call.bar);
}

/**
 * Before a gameweek: days (and hours) to its first kickoff. During it: how many games are done. After it: how many
 * results were shocks (the board's own definition, review.surprise under SHOCK). The days and the spotlight are
 * the rest of the header: how the matches sit across the week, and the one game worth naming.
 *
 * "Played" is the backend's matchday flag (a single game moved weeks later doesn't hold a gameweek open), and
 * "under way" starts at the gameweek's first regular kickoff (date_from), so a game brought forward weeks early
 * doesn't turn the countdown into a live gameweek.
 */
export function gameweekHead(grid: FixtureGrid, column: number, now: Date): GameweekHead {
  const md = grid.matchdays[column]!;
  const { matches } = gameweekMatches(grid, column);
  const counted = matches.filter((m) => m.homeCell.status !== "postponed");
  const done = counted.filter((m) => playedOut(m.homeCell.status));
  const wait = Date.parse(md.date_from) - now.getTime();
  const state: HeadState = md.finished
    ? { kind: "played", shocks: done.filter((m) => m.homeCell.review && m.homeCell.review.surprise < SHOCK).length, total: done.length }
    : wait <= 0
      ? { kind: "live", played: done.length, total: counted.length }
      : {
          kind: "upcoming",
          days: Math.floor(wait / DAY_MS),
          hours: Math.floor((wait % DAY_MS) / HOUR_MS),
          kickoff: md.date_from,
          confirmed: timesKnown(grid, column),
        };
  return {
    number: md.number,
    from: md.date_from,
    to: md.date_to,
    matches: counted.length,
    days: headDays(counted),
    spotlight: headSpotlight(counted, state),
    state,
  };
}

// ---------------------------------------------------------------- fixtures tile

export interface FixtureRow {
  id: number;
  home: GridTeam;
  away: GridTeam;
  when: string; // "21:00", "TBC", "FT", "Live", "PPD"
  status: GridCell["status"];
  score: [number, number] | null;
  chances: { home: number; draw: number; away: number } | null;
  lead: { code: string; chance: number } | null; // the likelier winner, for upcoming games
  given: number | null; // the chance the board gave the result, for played games
  shock: boolean;
}

export interface FixtureDay {
  label: string; // "Fri 9 Oct"
  rows: FixtureRow[];
}

/** The gameweek's matches grouped by day (Madrid time). */
export function fixtureDays(grid: FixtureGrid, column: number): FixtureDay[] {
  const days: FixtureDay[] = [];
  for (const m of gameweekMatches(grid, column).matches) {
    const cell = m.homeCell;
    const p = cell.prediction?.probabilities ?? null;
    const played = playedOut(cell.status) && cell.result !== null;
    const label = `${formatShortKickoff(m.kickoff).split(" ")[0]} ${formatDay(m.kickoff)}`;
    const row: FixtureRow = {
      id: m.fixtureId,
      home: m.home,
      away: m.away,
      when: played
        ? "FT"
        : cell.status === "live"
          ? "Live"
          : cell.status === "postponed"
            ? "PPD"
            : cell.date_confirmed
              ? formatShortKickoff(m.kickoff).split(" ")[1]!
              : "TBC",
      status: cell.status,
      score: played && cell.result ? [cell.result.goals_for, cell.result.goals_against] : null,
      chances: p ? { home: p.win, draw: p.draw, away: p.loss } : null,
      lead: p && !played ? (p.win >= p.loss ? { code: m.home.code, chance: p.win } : { code: m.away.code, chance: p.loss }) : null,
      given: played ? (cell.review?.outcome_chance ?? null) : null,
      shock: played && Boolean(cell.review && cell.review.surprise < SHOCK),
    };
    const last = days[days.length - 1];
    if (last && last.label === label) last.rows.push(row);
    else days.push({ label, rows: [row] });
  }
  return days;
}

// ---------------------------------------------------------------- difficulty tile

export type MosaicCell =
  | { kind: "game"; bucket: Bucket | null; opponent: string; venue: Venue; games: number }
  | { kind: "played" }
  | { kind: "postponed" }
  | { kind: "blank" };

export interface MosaicRow {
  team: GridTeam;
  total: number | null; // expected points from the games still to play in the window
  cells: MosaicCell[];
}

export interface Mosaic {
  gameweeks: number[];
  rows: MosaicRow[]; // most expected points first
}

/**
 * Every club's next five games from the gameweek, coloured like the board (the API's bucket), ranked by the
 * expected points still to come (runStats, the same total as the board's ranking: played games don't count).
 */
export function difficultyMosaic(grid: FixtureGrid, column: number, span = 5): Mosaic {
  const { start, end } = windowRange(grid.matchdays.length, column, span);
  const finished = grid.matchdays.map((md) => md.finished);
  const scale = grid.lens_scales.overall;
  const rows = grid.teams.map((team): MosaicRow => {
    const cells = team.cells.slice(start, end).map((games): MosaicCell => {
      if (games.length === 0) return { kind: "blank" };
      const toPlay = games.filter((cell) => cell.status !== "finished");
      const first = toPlay[0];
      if (!first) return { kind: "played" };
      if (first.status === "postponed") return { kind: "postponed" };
      return { kind: "game", bucket: cellBucket(first, "overall", scale), opponent: first.opponent_code, venue: first.venue, games: toPlay.length };
    });
    return { team, total: runStats(team, start, end, "overall", scale, finished).total, cells };
  });
  rows.sort((a, b) => (b.total ?? -1) - (a.total ?? -1) || a.team.name.localeCompare(b.team.name));
  return { gameweeks: grid.matchdays.slice(start, end).map((md) => md.number), rows };
}

// ---------------------------------------------------------------- table tile

/** The chances the home needs from the predicted table (lib/table.ts), small enough to cache. */
export interface Chances {
  code: string;
  title: number;
  relegation: number;
}

export interface TableSummary {
  after: number | null; // the last gameweek the standings include; null before the first game
  top: { team: GridTeam; position: number; points: number; form: Outcome[] }[];
  title: { team: GridTeam; chance: number }[];
  relegation: { team: GridTeam; chance: number }[];
}

/**
 * The standings after the selected gameweek once it's played (the latest results otherwise), the top four, and
 * the three likeliest to win the league and to go down, from the season projection.
 */
export function tableSummary(grid: FixtureGrid, column: number, chances: Chances[] | null): TableSummary {
  let last = -1;
  grid.matchdays.forEach((md, i) => {
    if (md.finished && i <= column) last = i;
  });
  const through = grid.matchdays[column]?.finished ? column : undefined;
  const standings = currentTable(grid, through);
  const played = standings.some((row) => row.played > 0);
  const byCode = new Map(grid.teams.map((team) => [team.code, team]));
  const pick = (key: "title" | "relegation") =>
    (chances ?? [])
      .filter((c) => c[key] > 0 && byCode.has(c.code))
      .sort((a, b) => b[key] - a[key] || a.code.localeCompare(b.code))
      .slice(0, 3)
      .map((c) => ({ team: byCode.get(c.code)!, chance: c[key] }));
  return {
    after: played && last >= 0 ? grid.matchdays[last]!.number : null,
    top: standings.slice(0, 4).map((row, i) => ({ team: row.team, position: i + 1, points: row.points, form: row.form })),
    title: pick("title"),
    relegation: pick("relegation"),
  };
}

/** "90%", ">99%", "<1%". */
export function chanceLabel(p: number): string {
  if (p >= 0.995) return ">99%";
  if (p < 0.005) return "<1%";
  return `${Math.round(p * 100)}%`;
}

/** The board page a tile opens, keeping the gameweek unless it's the default one. */
export function boardHref(path: string, grid: FixtureGrid, column: number, opening: number): string {
  return column === opening ? path : `${path}?gw=${grid.matchdays[column]!.number}`;
}
