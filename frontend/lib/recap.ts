import { absenceText } from "./absence";
import { formatShortKickoff } from "./grid";
import { gameweekMatches } from "./matches";
import { paidTiers, type FfStatus, type Lineup, type Plan, type PlayerGame, type PlayingPlayer, type StartSource } from "./play";
import { predictedTable, zone } from "./table";
import type { Bucket, FixtureGrid, GridTeam } from "./types";
import type { Competition } from "./competitions";

/**
 * The Recap (home) of the restructure (plans/restructure.md, R2): pure reshaping of what the payloads already hold.
 * Nothing here re-derives a backend decision; it picks, sorts and words.
 */

// ------------------------------------------------------------------------------------------------- best cards
export type BestCard = {
  player: string;
  name: string;
  pic: string;
  rarity: string;
  pos: PlayingPlayer["pos"];
  x: number;
  /** His chance of starting his first game and whose number it is, when the payload has one. */
  start: number | null;
  source: StartSource | null;
  /** "v Valencia, Sun" / "at Paderborn, Sat", or null when he has no game listed. */
  game: string | null;
};

const firstGame = (player: PlayingPlayer): PlayerGame | null =>
  [...player.games].sort((a, b) => Date.parse(a.kickoff) - Date.parse(b.kickoff))[0] ?? null;

export function gameLabel(game: Pick<PlayerGame, "venue" | "opponent" | "kickoff">): string {
  return `${game.venue === "H" ? "v" : "at"} ${game.opponent}, ${formatShortKickoff(game.kickoff).split(" ")[0]}`;
}

/** The week's best cards by xScore, all positions together; ties by name so the order never flickers. */
export function bestCards(players: PlayingPlayer[], count = 10): BestCard[] {
  return [...players]
    .sort((a, b) => b.x - a.x || a.name.localeCompare(b.name))
    .slice(0, count)
    .map((player) => {
      const game = firstGame(player);
      const start = game?.pStart ?? player.pStart ?? null;
      return {
        player: player.player ?? player.name,
        name: player.name,
        pic: player.pic,
        rarity: player.rarity,
        pos: player.pos,
        x: player.x,
        start,
        source: (game?.pStart !== undefined ? game.startSource : player.startSource) ?? null,
        game: game ? gameLabel(game) : null,
      };
    });
}

// ----------------------------------------------------------------------------------------------- the round
export type BoardSide = { team: GridTeam; win: number | null; xg: number | null; xd: number | null; cleanSheet: number | null; favourite: boolean };
export type BoardMatch = {
  fixtureId: number;
  kickoff: string;
  confirmed: boolean;
  status: string;
  score: string | null;
  home: BoardSide;
  away: BoardSide;
  draw: number | null;
  bothScore: number | null;
};

/** The round as a scoreboard: each side's chance to win, expected goals and clean-sheet chance, from the board's own forecast. */
export function roundBoard(grid: FixtureGrid, column: number): BoardMatch[] {
  return gameweekMatches(grid, column).matches.map((match) => {
    const h = match.homeCell.prediction;
    const a = match.awayCell.prediction;
    const win = h?.probabilities.win ?? null;
    const loss = h?.probabilities.loss ?? null;
    const result = match.homeCell.result;
    return {
      fixtureId: match.fixtureId,
      kickoff: match.kickoff,
      confirmed: match.homeCell.date_confirmed,
      status: match.homeCell.status,
      score: result ? `${result.goals_for}-${result.goals_against}` : null,
      home: { team: match.home, win, xg: h?.xg_for ?? null, xd: h?.xd_for ?? null, cleanSheet: h?.clean_sheet ?? null, favourite: win !== null && loss !== null && win > loss },
      away: { team: match.away, win: loss, xg: a?.xg_for ?? h?.xg_against ?? null, xd: a?.xd_for ?? null, cleanSheet: a?.clean_sheet ?? null, favourite: win !== null && loss !== null && loss > win },
      draw: h?.probabilities.draw ?? null,
      bothScore: h?.both_score ?? null,
    };
  });
}

/** A game's day in Madrid, YYYY-MM-DD: the Recap's day filter and the week window are Madrid days. */
export const madridDay = (iso: string) => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Madrid", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso));

type Side = { name: string; code: string; crest: string | null; color: string | null };
/**
 * One game of the week as the Recap's ticket stubs draw it (plans/recap-matchnight.md, step 3): only the fields they show, so a
 * client component gets a few kilobytes, not the competition's grid. `xd` is LaLiga's only (team decisives per goal).
 */
export type WeekGame = {
  id: number; comp: Competition; kickoff: string; day: string; confirmed: boolean; live: boolean; score: string | null;
  home: Side; away: Side; win: number | null; draw: number | null; loss: number | null; both: number | null;
  xg: [number, number] | null; xd: [number, number] | null; cs: [number | null, number | null] | null;
};
const side = (team: GridTeam): Side => ({ name: team.name, code: team.code, crest: team.crest_url ?? null, color: team.color ?? null });

/** Every game of a competition whose Madrid day falls between `from` and `to` (inclusive), from whichever rounds hold them. */
export function weekGames(grid: FixtureGrid, comp: Competition, from: string, to: string): WeekGame[] {
  const seen = new Map<number, WeekGame>();
  grid.matchdays.forEach((_, column) => {
    for (const match of gameweekMatches(grid, column).matches) {
      const day = madridDay(match.kickoff);
      if (day < from || day > to || seen.has(match.fixtureId)) continue;
      const h = match.homeCell.prediction, a = match.awayCell.prediction, result = match.homeCell.result;
      const xgA = a?.xg_for ?? h?.xg_against ?? null;
      seen.set(match.fixtureId, {
        id: match.fixtureId, comp, kickoff: match.kickoff, day, confirmed: match.homeCell.date_confirmed,
        live: /IN_PLAY|PAUSED|LIVE/i.test(match.homeCell.status), score: result ? `${result.goals_for}–${result.goals_against}` : null,
        home: side(match.home), away: side(match.away),
        win: h?.probabilities.win ?? null, draw: h?.probabilities.draw ?? null, loss: h?.probabilities.loss ?? null, both: h?.both_score ?? null,
        xg: h?.xg_for != null && xgA != null ? [h.xg_for, xgA] : null,
        xd: h?.xd_for != null && a?.xd_for != null ? [h.xd_for, a.xd_for] : null,
        cs: h ? [h.clean_sheet ?? null, a?.clean_sheet ?? null] : null,
      });
    }
  });
  return [...seen.values()].sort((x, y) => Date.parse(x.kickoff) - Date.parse(y.kickoff) || x.home.name.localeCompare(y.home.name));
}

export type AfterRow = { team: GridTeam; position: number; now: number; after: number; moved: number; fdr: { id: number; value: number | null; bucket: Bucket | null; label: string }[] };

/** The table once this round is played as expected: points now, points after, places gained (+) or lost (-). */
export function tableAfter(grid: FixtureGrid, column: number): AfterRow[] {
  return predictedTable(grid, { through: column, simulations: 0 }).map((row) => ({
    team: row.team,
    position: row.position,
    now: row.points,
    after: row.projectedPoints,
    moved: row.currentPosition - row.position,
    fdr: (row.team.cells[column] ?? []).map(cell => ({ id: cell.fixture_id, value: cell.prediction?.difficulty ?? null, bucket: cell.prediction?.bucket ?? null, label: `${cell.venue === "H" ? "v" : "at"} ${cell.opponent_code}: ${cell.prediction?.label ?? "FDR unavailable"}` })),
  }));
}

/** One club of the table skyline: its place and points once round `column` is played, places moved in that round, its next game's FDR. */
export type SkyRow = {
  team: Side; position: number; points: number; moved: number;
  zone: string | null; next: { value: number | null; bucket: Bucket | null; label: string } | null;
};

/** The last round with a finished game: the table "now". -1 before the season starts. */
export function latestPlayed(grid: FixtureGrid): number {
  let latest = -1;
  for (const team of grid.teams) team.cells.forEach((cells, column) => { if (column > latest && cells.some((cell) => cell.status === "finished")) latest = column; });
  return latest;
}

/**
 * The table once round `column` is played (as expected where it is not yet), each club's places moved in that round, and the FDR
 * of its next game after it. A played round's points are the real ones.
 */
export function skyline(grid: FixtureGrid, column: number): SkyRow[] {
  const after = predictedTable(grid, { through: column, simulations: 0 });
  const before = column > 0 ? new Map(predictedTable(grid, { through: column - 1, simulations: 0 }).map((row) => [row.team.code, row.position])) : null;
  return after.map((row) => {
    const next = row.team.cells.slice(column + 1).find((cells) => cells.length)?.[0] ?? null;
    return {
      team: side(row.team), position: row.position, points: Math.round(row.projectedPoints * 10) / 10,
      moved: before ? (before.get(row.team.code) ?? row.position) - row.position : 0,
      zone: zone(row.position, after.length, grid.competition ?? "PD")?.className ?? null,
      next: next ? { value: next.prediction?.difficulty ?? null, bucket: next.prediction?.bucket ?? null, label: `${next.venue === "H" ? "v" : "at"} ${next.opponent_code}: ${next.prediction?.label ?? "FDR unavailable"}` } : null,
    };
  });
}

// ------------------------------------------------------------------------------------------------- the plan
export type PlanRow = {
  lineup: Lineup;
  /** Chance of any cash or essence prize, of any other prize (a card), and what its first level pays, whole (a reward is all or nothing). */
  cashOrEssence: number;
  other: number;
  essence: number;
  cash: number;
};

/** Every lineup of a plan, likeliest reward first, with its chances split the way the owner reads them. */
export function planRows(plan: Plan): PlanRow[] {
  return plan.lineups
    .map((lineup) => {
      const paid = lineup.tiers.filter((tier) => (tier.cash ?? 0) > 0 || (tier.essence ?? 0) > 0).reduce((sum, tier) => sum + tier.p, 0);
      const first = paidTiers(lineup).at(-1);
      return {
        lineup,
        cashOrEssence: Math.min(1, paid || Math.max(0, lineup.pReturn - lineup.pCard)),
        other: lineup.pCard,
        essence: first?.essence ?? 0,
        cash: first?.cash ?? 0,
      };
    })
    .sort((a, b) => b.cashOrEssence - a.cashOrEssence || b.lineup.x - a.lineup.x);
}

// ------------------------------------------------------------------------------------------------- the news
export type NewsItem = {
  player: string;
  name: string;
  pic: string;
  rarity: string;
  kind: NonNullable<FfStatus["kind"]>;
  cause: string | null;
  note: string | null;
  since: string | null;
  start: number | null;
  game: string;
};

/** How many days ago Futbol Fantasy's "Desde 29/09 (6 días)" started, or null when it does not say. */
export function daysSince(since: string | undefined): number | null {
  const found = since?.match(/\((\d+) d[ií]as?\)/i);
  return found ? Number(found[1]) : null;
}

/**
 * The week's news about the owner's players, from Futbol Fantasy's notes on their next game: who got hurt or banned in the
 * last `days` days, and who is cleared to play after a knock ("Disponible para la jornada 8"). A long-standing injury is not
 * news; the Lineups page keeps every note.
 */
export function weekNews(players: PlayingPlayer[], round: number | null, now: Date, days = 7): { hurt: NewsItem[]; back: NewsItem[] } {
  const hurt: NewsItem[] = [];
  const back: NewsItem[] = [];
  for (const player of players) {
    const game = player.games.find((g) => g.ffStatus?.kind);
    const status = game?.ffStatus;
    if (!game || !status?.kind) continue;
    const ago = daysSince(status.since);
    const words = absenceText({ name: player.name, kind: status.kind, cause: status.cause, since: status.since, note: status.note }, round, now);
    const item: NewsItem = {
      player: player.player ?? player.name,
      name: player.name,
      pic: player.pic,
      rarity: player.rarity,
      kind: status.kind,
      cause: words.cause ?? null,
      note: words.note ?? null,
      since: words.since ?? null,
      start: game.pStart ?? player.pStart ?? null,
      game: gameLabel(game),
    };
    if (status.kind === "available") back.push(item);
    else if (ago === null || ago <= days) hurt.push(item);
  }
  const order = (a: NewsItem, b: NewsItem) => (b.start ?? 0) - (a.start ?? 0) || a.name.localeCompare(b.name);
  return { hurt: hurt.sort((a, b) => (a.kind === "out" ? -1 : 0) - (b.kind === "out" ? -1 : 0) || order(a, b)), back: back.sort(order) };
}

// ------------------------------------------------------------------------------------------------- the lock
/** "Fri 16:00, in 4 days" / "in 5 h" / "locked" for a Sorare lock, Madrid time. */
export function lockText(lock: string, now: Date): string {
  const ms = Date.parse(lock) - now.getTime();
  const when = formatShortKickoff(lock);
  if (ms <= 0) return `Locked ${when}`;
  const hours = Math.floor(ms / 3_600_000);
  const left = hours >= 48 ? `in ${Math.floor(hours / 24)} days` : hours >= 1 ? `in ${hours} h` : `in ${Math.max(1, Math.floor(ms / 60_000))} min`;
  return `Locks ${when}, ${left}`;
}
