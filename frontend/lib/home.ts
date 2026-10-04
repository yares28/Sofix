import { SHOCK, cellBucket, formatDay, formatShortKickoff, runStats, windowRange } from "./grid";
import { gameweekMatches, type Match } from "./matches";
import { nextWeek, weekPlan, type PlayerGame, type PlayingPlayer, type Sorare } from "./play";
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

export interface GameweekHead {
  number: number;
  from: string;
  to: string;
  matches: number;
  days: HeadDay[];
  state: HeadState;
}

/** One of your cards in the header: the player, his projected score, and the art of a card you hold. */
export interface HeadCard {
  name: string;
  short: string;
  pos: PlayingPlayer["pos"];
  x: number;
  p: number;
  pic: string;
  rarity: string;
  cards: number;
}

export type HeadGamePlayer = HeadCard;

/** A game your players play. Win and clean sheet are that club's chances, and only for a LaLiga fixture we rate. */
export interface HeadGame {
  key: string;
  /** The team actually playing; during an international break this is the national team, not the player's club. */
  team: string;
  opponent: string;
  teamCrest: string | null;
  opponentCrest: string | null;
  venue: PlayerGame["venue"];
  competition: string;
  /** The club's chance of winning, and of a clean sheet. Null when the game is outside LaLiga. */
  win: number | null;
  cleanSheet: number | null;
  /** Every owned player/card represented in the fixture, highest projection first. */
  players: HeadGamePlayer[];
  /** The best projection you have in the game: it ranks otherwise-equivalent rows. */
  x: number;
}

export interface HeadCast {
  /** Sorare's gameweek number, shown when these cards are not the LaLiga week's own. */
  gw: number;
  named: boolean;
  cards: HeadCard[];
  games: HeadGame[];
}

const HEADER_POSITION_LIMITS: Record<PlayingPlayer["pos"], number> = {
  GK: 3,
  DEF: 4,
  MID: 3,
  FWD: 4,
};

const HEADER_POSITIONS = Object.keys(HEADER_POSITION_LIMITS) as PlayingPlayer["pos"][];

const playedOut = (status: GridCell["status"]) => status === "finished";

const timesKnown = (grid: FixtureGrid, column: number) =>
  grid.teams.some((team) => (team.cells[column] ?? []).some((cell) => cell.date_confirmed));

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

const shortName = (name: string) => name.split(" ").filter(Boolean).at(-1) ?? name;

/** Club words Sorare adds and the board does not: "FC Barcelona" and "Barcelona" are the same club. */
const CLUB_WORDS = new Set(["fc", "cf", "ud", "rc", "cd", "ac", "sc", "sad", "de", "club"]);

/**
 * Clubs Sorare names differently from the board even without those words ("Deportivo Alavés" is "Alavés" on the
 * board), as club key -> the board's club key. Checked against Sorare's LaLiga club list on 2026-09-29 and again on 2026-10-03,
 * when "Celta de Vigo" (the board says "Celta") was found missing: all 20 names are in overlay.test.ts.
 */
const CLUB_ALIASES: Record<string, string> = {
  "deportivo alaves": "alaves",
  "deportivo la coruna": "deportivo",
  "celta vigo": "celta",
};

export const clubKey = (name: string): string => {
  const words = name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean);
  const kept = words.filter((word) => !CLUB_WORDS.has(word));
  const key = (kept.length ? kept : words).join(" ");
  return CLUB_ALIASES[key] ?? key;
};

export const NATIONAL_COMPETITION = /(nations-league|world-cup|euro-qual|olympic|international)/i;

/** Old cached payloads did not name the player's side. Never turn his club into a national team by accident. */
function playingSide(player: PlayingPlayer, game: PlayerGame, forecast: SideOutlook | undefined): { name: string; crest: string | null } {
  if (forecast) return { name: forecast.club, crest: player.crest };
  if (game.team) return { name: game.team, crest: game.teamCrest ?? null };
  if (NATIONAL_COMPETITION.test(game.competition)) {
    return { name: "National team", crest: null };
  }
  return { name: player.club ?? `${shortName(player.name)}'s team`, crest: player.crest };
}

export interface SideOutlook {
  club: string;
  opponent: string;
  win: number | null;
  cleanSheet: number | null;
  /** The goals the model expects his side to score in the game. */
  xgFor: number | null;
  /** The board's result difficulty, 0–100 and 1 (easiest) to 5, with its plain-language label. */
  difficulty: number | null;
  bucket: Bucket | null;
  label: string | null;
}

/**
 * Each club's own forecast for a fixture, keyed by club, venue and opponent. A season has one home meeting,
 * so the names are the game. Anything we cannot name on both sides is left out: the model only rates LaLiga.
 */
export function sideOutlook(grid: FixtureGrid): Map<string, SideOutlook> {
  const byCode = new Map(grid.teams.map((team) => [team.code, team]));
  const index = new Map<string, SideOutlook>();
  for (const team of grid.teams) {
    for (const column of team.cells) {
      for (const cell of column) {
        const opponent = byCode.get(cell.opponent_code);
        if (!opponent) continue;
        const key = `${clubKey(team.name)}|${cell.venue}|${clubKey(opponent.name)}`;
        const next: SideOutlook = {
          club: team.name,
          opponent: opponent.name,
          win: cell.prediction?.probabilities.win ?? null,
          cleanSheet: cell.prediction?.clean_sheet ?? null,
          xgFor: cell.prediction?.xg_for ?? null,
          difficulty: cell.prediction?.difficulty ?? null,
          bucket: cell.prediction?.bucket ?? null,
          label: cell.prediction?.label ?? null,
        };
        const prev = index.get(key);
        if (!prev || (prev.win === null && next.win !== null)) index.set(key, next);
      }
    }
  }
  return index;
}

/**
 * The header's cards are the best owned cards in each position (3 GK, 4 DEF, 3 MID and 4 FWD). A game is one
 * fixture, ranked by the best projection you have in it, so two of your players in the same match count once.
 * Win and clean sheet are your club's chances in that fixture when it is a LaLiga game on the board.
 */
export function headCast(players: PlayingPlayer[], gw: number, named: boolean, grid: FixtureGrid | null = null): HeadCast | null {
  if (!players.length) return null;
  const outlook = grid ? sideOutlook(grid) : null;
  const toHeadCard = (player: PlayingPlayer): HeadCard => ({
    name: player.name,
    short: shortName(player.name),
    pos: player.pos,
    x: player.x,
    p: player.p,
    pic: player.pic,
    rarity: player.rarity,
    cards: player.cards,
  });
  const cards = HEADER_POSITIONS.flatMap((pos) =>
    players
      .filter((player) => player.pos === pos)
      .sort((a, b) => b.x - a.x || a.name.localeCompare(b.name))
      .slice(0, HEADER_POSITION_LIMITS[pos])
      .map(toHeadCard),
  );
  const games = new Map<string, HeadGame>();
  for (const player of players) {
    for (const game of player.games) {
      const key = game.id ?? `${game.kickoff}|${game.competition}|${game.team ?? ""}|${game.opponent}`;
      const gamePlayer: HeadGamePlayer = {
        name: player.name,
        short: shortName(player.name),
        pos: player.pos,
        x: player.x,
        p: player.p,
        pic: player.pic,
        rarity: player.rarity,
        cards: player.cards,
      };
      const existing = games.get(key);
      if (existing) {
        if (!existing.players.some((item) => item.name === player.name)) {
          existing.players.push(gamePlayer);
          existing.players.sort((a, b) => b.x - a.x || a.name.localeCompare(b.name));
        }
        existing.x = Math.max(existing.x, player.x);
        continue;
      }
      const forecast = player.club && outlook ? outlook.get(`${clubKey(player.club)}|${game.venue}|${clubKey(game.opponent)}`) : undefined;
      const side = playingSide(player, game, forecast);
      games.set(key, {
        key,
        team: side.name,
        opponent: forecast?.opponent ?? game.opponent,
        teamCrest: side.crest,
        opponentCrest: game.opponentCrest,
        venue: game.venue,
        competition: game.competition,
        win: forecast?.win ?? null,
        cleanSheet: forecast?.cleanSheet ?? null,
        players: [gamePlayer],
        x: player.x,
      });
    }
  }
  const ranked = [...games.values()]
    .sort((a, b) => Number(b.win !== null) - Number(a.win !== null) || b.x - a.x || a.key.localeCompare(b.key))
    .slice(0, 3);
  return { gw, named, cards, games: ranked };
}

/**
 * The cards for the week in the bar. A week Sorare has opened uses only that gameweek — an empty one stays
 * empty. A LaLiga week Sorare hasn't opened shows the gameweek being planned, and says so.
 */
export function castForWeek(sorare: Sorare | null, gw: string | null, grid: FixtureGrid | null = null): HeadCast | "none" | null {
  if (!sorare) return null;
  if (gw) {
    const plan = weekPlan(sorare, gw);
    if (!plan?.playing.players.length) return "none";
    return headCast(plan.playing.players, plan.gameweek.number, false, grid);
  }
  const next = nextWeek(sorare);
  return headCast(next.playing.players, next.gameweek.number, true, grid);
}

/**
 * Before a gameweek: days (and hours) to its first kickoff. During it: how many games are done. After it: how many
 * results were shocks (the board's own definition, review.surprise under SHOCK). The days are the shape of the week.
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
