import { z } from "zod";
import { NATIONAL_COMPETITION, clubKey, sideOutlook, type SideOutlook } from "./home";
import { likelyResult, nextWeek, resultLabel, waitingFor, weekPlan, type FfStatus, type GameweekPlan, type Lineup, type PlayerGame, type PlayingPlayer, type Sorare, type StartSource } from "./play";
import type { Bucket, FixtureGrid } from "./types";

/**
 * What the sorare.com overlay draws on a card (extension/overlay.js): the numbers Sofix already has for the
 * player, keyed by the Sorare slug the page itself carries. Nothing here is computed: xScore, the chance of
 * playing and the game's odds and difficulty are the ones the job published and the board shows. The game's
 * numbers are Sofix's own read of it, drawn under Sorare's odds, so there is no opponent or kickoff: Sorare's own
 * card already draws those.
 */

/** Most slugs one call may carry (cards and players together): a page is asked in batches, never all at once. */
export const OVERLAY_CAP = 120;

const slug = z.string().regex(/^[a-z0-9][a-z0-9_-]{0,119}$/);

export const OverlayRequest = z
  .object({
    /** A Sorare gameweek number. Without it, or when unknown, the gameweek being planned. */
    week: z.string().regex(/^\d{1,4}$/).optional(),
    cards: z.array(slug),
    players: z.array(slug),
    /** Also answer with the gameweek's plan: the drawer asks for it when it is opened, never with the cards. */
    plan: z.boolean().optional(),
    /**
     * The Sorare gameweek the page's address names ("football-25-29-sep-2026"), when it names one: the cards on it are
     * about that gameweek, so it is that gameweek's numbers that are answered. Without it, the one being planned.
     */
    fixture: z
      .string()
      .regex(/^football-[a-z0-9-]{1,80}-\d{4}$/)
      .optional(),
  })
  .refine((body) => body.cards.length + body.players.length <= OVERLAY_CAP, { message: `At most ${OVERLAY_CAP} slugs per call.` });
export type OverlayRequest = z.infer<typeof OverlayRequest>;

/**
 * Sofix's read of the game Sorare's card shows: his next one in the gameweek. Win and clean sheet are fractions (0.56
 * is 56%); difficulty is the board's 0-100 with its label and 1 (easiest) to 5 bucket. `source` says where it came
 * from: the board's own model for a LaLiga game, else Sorare's odds for the game (any league or national team).
 */
export type OverlayGame = {
  win: number | null;
  cleanSheet: number | null;
  /** The goals his side is expected to score in it: the model's for a LaLiga game, else what Sorare's prices imply. */
  goalsFor: number | null;
  difficulty: number;
  bucket: Bucket;
  label: string;
  source: "model" | "sorare";
};

export type OverlayEntry = {
  /** What he is expected to score, the chance he plays (a substitute appearance counts), and the average every cap counts. */
  x: number;
  p: number;
  average: number;
  /** His position, which decides the tile's driver (difficulty for a goalkeeper or defender, expected goals otherwise). */
  pos: PlayingPlayer["pos"];
  /** Whether the game the tile shows is a LaLiga one, the only competition Futbol Fantasy covers: the panel says so when it has no number. */
  laliga?: boolean;
  /** When the job published these numbers (ISO time), for the hover's "updated ... ago". */
  at: string;
  /** Null when neither the model nor Sorare has priced his game yet: the tile says "no odds", never zeros. */
  game: OverlayGame | null;
  /**
   * His score if he starts (the tile's number) and if he does not, and the chance of each. Absent for a payload
   * published before they existed: the overlay then falls back to `x` rather than showing an invented split.
   */
  start?: number;
  bench?: number;
  /** His score if he comes on from the bench: a substitute starts at 35 like a starter, so about 40 (P7). Absent in older payloads. */
  on?: number;
  pStart?: number;
  pOn?: number;
  /**
   * Whose number `pStart` is, when it was read and what the page says of him, for the hover. Only when the job told his
   * game game by game (Futbol Fantasy spoke about it); the other entries have no source to name yet.
   */
  startSource?: StartSource;
  startAt?: string;
  ffStatus?: FfStatus;
  /** What each source says of his first game (Futbol Fantasy's only when it has one): the panel's list of sources. */
  sources?: Partial<Record<StartSource, number>>;
  /**
   * What the extension needs to read Futbol Fantasy live for him (plans/futbolfantasy.md, S7): the match page of the game the tile
   * shows and his number on it, and the rate at which he comes on in games he does not start.
   */
  ffMatch?: { id: number; url: string };
  ffPlayer?: string;
  benchedOn?: number;
  /** His expected goals in this game if he starts. Absent when Understat has nothing on him: the tile says "xG -". */
  xg?: number;
  /**
   * What the best plan does with the cards he is on, by card slug: the lineup it uses each in, and whether he captains it.
   * Only cards the plan uses are here, so a card it leaves out has nothing. Absent when there is no plan yet.
   */
  inPlan?: Record<string, { lineup: string; captain: boolean }>;
  /** His game has kicked off (or been played): the numbers are about a game that is no longer ahead. */
  over?: true;
  /**
   * Each of his games in the gameweek, in kickoff order, when he has more than one (an international week, a double gameweek):
   * the tile says "2 games" and the panel lists them. Absent for a single game. The tile's own numbers are about the next one.
   */
  fixtures?: OverlayFixture[];
};

export type OverlayFixture = { opponent: string; venue: "H" | "A"; kickoff: string; competition: string };

/** The gameweek's plan in a few numbers, for the drawer: what the best plan adds up to and what it uses. */
export type OverlayPlan =
  | {
      state: "ready";
      week: number;
      lineups: number;
      /** What the plan's lineups are expected to score together, and the name and cards of the one leading it. */
      x: number;
      comp: string;
      pics: string[];
      /** The chance anything pays, the plan's most likely result in words ("nothing", "250 essence"), and how many of your cards it uses. */
      pAny: number;
      likely: string;
      cardsUsed: number;
      cardsAvailable: number;
    }
  | { state: "waiting" | "none"; week: number; note: string };

export type OverlayAnswer = {
  /** The Sorare gameweek these numbers are for. */
  week: number;
  cards: Record<string, OverlayEntry>;
  players: Record<string, OverlayEntry>;
  plan?: OverlayPlan;
};

/** The plan's lineups, the one expected to score most first. */
const lineupsByScore = (lineups: Lineup[]): Lineup[] => [...lineups].sort((a, b) => b.x - a.x);

export function overlayPlan(gameweek: GameweekPlan, now: Date): OverlayPlan {
  const week = gameweek.gameweek.number;
  const best = gameweek.plans[0];
  if (gameweek.state !== "ready" || !best) {
    return { state: gameweek.state === "waiting" ? "waiting" : "none", week, note: waitingFor(gameweek, now) ?? "Nothing is planned for this gameweek yet." };
  }
  const leading = lineupsByScore(best.lineups)[0];
  return {
    state: "ready",
    week,
    lineups: best.lineups.length,
    x: Math.round(best.lineups.reduce((sum, lineup) => sum + lineup.x, 0)),
    comp: leading?.comp ?? "",
    pics: [...new Set(lineupsByScore(best.lineups).flatMap((lineup) => lineup.starters.map((card) => card.pic)).filter(Boolean))],
    pAny: best.pAny,
    likely: resultLabel(likelyResult(best)),
    cardsUsed: best.cardsUsed,
    cardsAvailable: best.cardsAvailable,
  };
}

/** The board only models LaLiga. Sorare names it "laliga-es"; "laliga-2" and every cup are other competitions. */
const LALIGA = /^laliga(-es)?$/i;

/** The game to show: the next one still to be played, or the last when they are all done. */
function shownGame(games: PlayerGame[], now: Date): PlayerGame | null {
  if (!games.length) return null;
  const ordered = [...games].sort((a, b) => Date.parse(a.kickoff) - Date.parse(b.kickoff));
  return ordered.find((game) => Date.parse(game.kickoff) > now.getTime()) ?? ordered[ordered.length - 1]!;
}

/**
 * The read of his next game. A LaLiga game is the board's own numbers, matched on the side he plays for, its
 * venue and the opponent, so it says what /difficulty says. Anything else (or a LaLiga game the board has no
 * forecast for) is Sorare's odds as the job published them, and no odds at all is `null`.
 */
function gameFor(player: PlayingPlayer, outlook: Map<string, SideOutlook> | null, now: Date): OverlayGame | null {
  const game = shownGame(player.games, now);
  if (!game) return null;
  const side = game.team ?? player.club;
  const board = outlook && side && LALIGA.test(game.competition) ? outlook.get(`${clubKey(side)}|${game.venue}|${clubKey(game.opponent)}`) : undefined;
  if (board && board.win !== null && board.difficulty !== null && board.bucket !== null && board.label !== null) {
    return { win: board.win, cleanSheet: board.cleanSheet, goalsFor: board.xgFor, difficulty: board.difficulty, bucket: board.bucket, label: board.label, source: "model" };
  }
  const odds = game.odds;
  return odds
    ? { win: odds.win, cleanSheet: odds.cleanSheet, goalsFor: odds.goalsFor ?? null, difficulty: odds.difficulty, bucket: odds.bucket, label: odds.label, source: "sorare" }
    : null;
}

/**
 * His expected goals in the game he is shown, if he starts: his non-penalty rate scaled by how many goals his side is
 * expected to score in it against its own average (clamped to half and double, so one odd price cannot make a number),
 * plus his penalty part. A national-team game is his own rate as it is: a club average is no yardstick for a country's
 * goals. No game, or no goals for it, is his own rate as well. Nothing at all when Understat has no numbers on him.
 */
function xgFor(player: PlayingPlayer, game: OverlayGame | null, now: Date): number | undefined {
  const base = player.xg;
  if (!base) return undefined;
  const shown = shownGame(player.games, now);
  const scaled = shown && !NATIONAL_COMPETITION.test(shown.competition) && game?.goalsFor && base.team;
  const factor = scaled ? Math.min(2, Math.max(0.5, game.goalsFor! / base.team!)) : 1;
  return Math.round((base.np * factor + base.pen) * 100) / 100;
}

function entryFor(
  player: PlayingPlayer,
  outlook: Map<string, SideOutlook> | null,
  now: Date,
  at: string,
  inPlan: OverlayEntry["inPlan"],
): OverlayEntry {
  const game = gameFor(player, outlook, now);
  const xg = xgFor(player, game, now);
  const shown = shownGame(player.games, now);
  const over = shown !== null && Date.parse(shown.kickoff) <= now.getTime();
  // The chance of the game the tile shows: its own when the job told it game by game (Futbol Fantasy spoke about one of his
  // games), else the one for the week, as before. Either is used only with the two scores it splits.
  const told = shown && shown.pStart !== undefined && shown.pOn !== undefined ? shown : null;
  const pStart = told?.pStart ?? player.pStart;
  const pOn = told?.pOn ?? player.pOn;
  const fixtures =
    player.games.length > 1
      ? [...player.games]
          .sort((a, b) => Date.parse(a.kickoff) - Date.parse(b.kickoff))
          .map((one): OverlayFixture => ({ opponent: one.opponent, venue: one.venue, kickoff: one.kickoff, competition: one.competition }))
      : undefined;
  const hasSplit = player.start !== undefined && player.bench !== undefined && pStart !== undefined && pOn !== undefined;
  const split = hasSplit ? { start: player.start, bench: player.bench, ...(player.on !== undefined ? { on: player.on } : {}), pStart, pOn } : {};
  const named = told?.startSource ?? player.startSource;
  const source = {
    ...(named ? { startSource: named } : {}),
    ...(told?.startSource && told.startAt ? { startAt: told.startAt } : {}),
    ...(told?.startSource && told.ffStatus ? { ffStatus: told.ffStatus } : {}),
    ...(player.sources ? { sources: player.sources } : {}),
    ...(told?.ffMatch && told.ffPlayer && over === false ? { ffMatch: told.ffMatch, ffPlayer: told.ffPlayer } : {}),
    ...(player.benchedOn !== undefined ? { benchedOn: player.benchedOn } : {}),
  };
  return {
    x: player.x,
    p: player.p,
    average: player.average,
    pos: player.pos,
    ...(shown ? { laliga: LALIGA.test(shown.competition) } : {}),
    at,
    game,
    ...split,
    ...(hasSplit ? source : {}),
    ...(xg !== undefined ? { xg } : {}),
    ...(fixtures ? { fixtures } : {}),
    ...(inPlan ? { inPlan } : {}),
    ...(over ? { over: true as const } : {}),
  };
}

/**
 * The numbers for the cards and players asked about. A card of yours answers with its player's numbers (xScore
 * belongs to the player, not the copy), and so does the player's own slug, which is how a card you do not own
 * still gets a ribbon for a player you do. Anything unknown is left out, so a page never draws an empty chip.
 *
 * A page whose address names a gameweek (`request.fixture`) is about that gameweek: it is answered from that week, from the
 * page's own copy or from the one the job kept apart (`archived`, which the endpoint reads when the timeline says there is
 * one), and with nothing at all when Sofix holds none. It is never answered with this week's numbers under another week's name.
 */
export function overlayNumbers(
  sorare: Sorare,
  grid: FixtureGrid | null,
  request: OverlayRequest,
  now: Date,
  archived: GameweekPlan | null = null,
): OverlayAnswer {
  const named = request.fixture ? sorare.timeline.find((item) => item.slug === request.fixture) : undefined;
  const kept = named && archived && archived.gameweek.slug === named.slug ? archived : null;
  const plan: GameweekPlan | null = request.fixture
    ? named
      ? (weekPlan(sorare, named.id) ?? kept)
      : null
    : ((request.week ? weekPlan(sorare, request.week) : null) ?? nextWeek(sorare));
  if (!plan) {
    const week = named?.number ?? 0;
    // The drawer asked for this week's plan: say there is none in words, not nothing (it read nothing as "Sofix is not reachable").
    const note = { state: "none" as const, week, note: "Sofix holds nothing on this gameweek." };
    return { week, cards: {}, players: {}, ...(request.plan ? { plan: note } : {}) };
  }
  const outlook = grid ? sideOutlook(grid) : null;
  // The numbers of a week kept apart are as they stood when it finished, and its plan was a replay, not what you entered.
  const madeAt = plan.builtAt ?? (plan === kept ? plan.gameweek.end : sorare.generatedAt);

  const owners = new Map((sorare.collection ?? []).map((card) => [card.slug, card.player]));
  const playing = new Map<string, PlayingPlayer>();
  for (const player of plan.playing.players) if (player.player) playing.set(player.player, player);

  // The best plan's cards, by the player each belongs to, with the lineup each is in and whether he captains it.
  const inPlan = new Map<string, NonNullable<OverlayEntry["inPlan"]>>();
  for (const lineup of (plan === kept ? [] : (plan.plans ?? [])[0]?.lineups) ?? []) {
    for (const card of [...(lineup.starters ?? []), ...(lineup.subs ?? [])]) {
      const owner = owners.get(card.slug);
      if (owner) inPlan.set(owner, { ...inPlan.get(owner), [card.slug]: { lineup: lineup.comp, captain: card.captain === true } });
    }
  }

  const entries = new Map<string, OverlayEntry | null>();
  const forPlayer = (playerSlug: string | undefined): OverlayEntry | null => {
    const player = playerSlug ? playing.get(playerSlug) : undefined;
    if (!playerSlug || !player) return null;
    if (!entries.has(playerSlug)) entries.set(playerSlug, entryFor(player, outlook, now, madeAt, inPlan.get(playerSlug)));
    return entries.get(playerSlug) ?? null;
  };

  const cards: Record<string, OverlayEntry> = {};
  for (const cardSlug of request.cards) {
    const entry = forPlayer(owners.get(cardSlug));
    if (entry) cards[cardSlug] = entry;
  }
  const players: Record<string, OverlayEntry> = {};
  for (const playerSlug of request.players) {
    const entry = forPlayer(playerSlug);
    if (entry) players[playerSlug] = entry;
  }
  return { week: plan.gameweek.number, cards, players, ...(request.plan ? { plan: overlayPlan(plan, now) } : {}) };
}
