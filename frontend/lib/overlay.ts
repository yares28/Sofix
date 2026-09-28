import { z } from "zod";
import { NATIONAL_COMPETITION, clubKey, sideOutlook, type SideOutlook } from "./home";
import { nextWeek, waitingFor, weekPlan, type GameweekPlan, type PlayerGame, type PlayingPlayer, type Sorare } from "./play";
import type { Bucket, FixtureGrid } from "./types";

/**
 * What the sorare.com overlay draws on a card (extension/overlay.js): the numbers Sofix already has for the
 * player, keyed by the Sorare slug the page itself carries. Nothing here is computed: xScore, the chance of
 * playing and the difficulty are the ones the job published and the board shows.
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
  })
  .refine((body) => body.cards.length + body.players.length <= OVERLAY_CAP, { message: `At most ${OVERLAY_CAP} slugs per call.` });
export type OverlayRequest = z.infer<typeof OverlayRequest>;

export type OverlayEntry = {
  /** What he is expected to score, the chance he plays, and the average every cap counts. */
  x: number;
  p: number;
  average: number;
  /** His game: the opponent as Sorare names it, the board's short code, the side he plays, the kickoff. */
  opponent: string;
  code: string;
  venue: "H" | "A";
  kickoff: string;
  competition: string;
  /** The board's difficulty for that game. Absent outside LaLiga: there are no odds there, and none are invented. */
  difficulty?: number;
  bucket?: Bucket;
  label?: string;
};

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
      /** The chance anything pays, the essence expected, and how many of your cards the plan uses. */
      pAny: number;
      essence: number;
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

export function overlayPlan(gameweek: GameweekPlan, now: Date): OverlayPlan {
  const week = gameweek.gameweek.number;
  const best = gameweek.plans[0];
  if (gameweek.state !== "ready" || !best) {
    return { state: gameweek.state === "waiting" ? "waiting" : "none", week, note: waitingFor(gameweek, now) ?? "Nothing is planned for this gameweek yet." };
  }
  const leading = [...best.lineups].sort((a, b) => b.x - a.x)[0];
  return {
    state: "ready",
    week,
    lineups: best.lineups.length,
    x: Math.round(best.lineups.reduce((sum, lineup) => sum + lineup.x, 0)),
    comp: leading?.comp ?? "",
    pics: (leading?.starters ?? []).map((card) => card.pic).filter(Boolean).slice(0, 5),
    pAny: best.pAny,
    essence: Math.round(best.essence),
    cardsUsed: best.cardsUsed,
    cardsAvailable: best.cardsAvailable,
  };
}

/** The game to show: the next one still to be played, or the last when they are all done. */
function shownGame(games: PlayerGame[], now: Date): PlayerGame | null {
  if (!games.length) return null;
  const ordered = [...games].sort((a, b) => Date.parse(a.kickoff) - Date.parse(b.kickoff));
  return ordered.find((game) => Date.parse(game.kickoff) > now.getTime()) ?? ordered[ordered.length - 1]!;
}

function entryFor(player: PlayingPlayer, outlook: Map<string, SideOutlook> | null, now: Date): OverlayEntry | null {
  const game = shownGame(player.games, now);
  if (!game) return null;
  const board =
    outlook && player.club && !NATIONAL_COMPETITION.test(game.competition)
      ? outlook.get(`${clubKey(player.club)}|${game.venue}|${clubKey(game.opponent)}`)
      : undefined;
  return {
    x: player.x,
    p: player.p,
    average: player.average,
    opponent: game.opponent,
    code: board?.code ?? clubKey(game.opponent).replace(/\s/g, "").slice(0, 3).toUpperCase(),
    venue: game.venue,
    kickoff: game.kickoff,
    competition: game.competition,
    ...(board && board.difficulty !== null && board.bucket !== null && board.label !== null
      ? { difficulty: board.difficulty, bucket: board.bucket, label: board.label }
      : {}),
  };
}

/**
 * The numbers for the cards and players asked about. A card of yours answers with its player's numbers (xScore
 * belongs to the player, not the copy), and so does the player's own slug, which is how a card you do not own
 * still gets a ribbon for a player you do. Anything unknown is left out, so a page never draws an empty chip.
 */
export function overlayNumbers(sorare: Sorare, grid: FixtureGrid | null, request: OverlayRequest, now: Date): OverlayAnswer {
  const plan = (request.week ? weekPlan(sorare, request.week) : null) ?? nextWeek(sorare);
  const outlook = grid ? sideOutlook(grid) : null;

  const owners = new Map((sorare.collection ?? []).map((card) => [card.slug, card.player]));
  const playing = new Map<string, PlayingPlayer>();
  for (const player of plan.playing.players) if (player.player) playing.set(player.player, player);

  const entries = new Map<string, OverlayEntry | null>();
  const forPlayer = (playerSlug: string | undefined): OverlayEntry | null => {
    const player = playerSlug ? playing.get(playerSlug) : undefined;
    if (!playerSlug || !player) return null;
    if (!entries.has(playerSlug)) entries.set(playerSlug, entryFor(player, outlook, now));
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
