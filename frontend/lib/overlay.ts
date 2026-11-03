import { z } from "zod";
import { NATIONAL_COMPETITION, clubKey, nextFive, sideOutlook, type NextGameCell, type SideOutlook } from "./home";
import { squadBar, verdict, type Verdict } from "./cards";
import { cardScore, likelyResult, nextWeek, proOpen, resultLabel, waitingFor, weekPlan, type FfStatus, type GameweekPlan, type Lineup, type MarketFixture, type MarketPlayer, type PlayerGame, type PlayingPlayer, type Sorare, type StartSource } from "./play";
import { appearances, type Appearance } from "./apply";
import type { MissionPlan } from "./missions";
import type { MissionsStatus } from "./missionsToday";
import type { Bucket, FixtureGrid } from "./types";
import { prices } from "./prices";
import { BOARD_OF } from "./arcadeFdr";
import { isEuropean } from "./competitions";

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
    /** Also answer with the gameweek's plan: the dock asks for it, never with the cards. */
    plan: z.boolean().optional(),
    /** Also answer with today's missions (the dock's Missions tab), never with the cards. */
    missions: z.boolean().optional(),
    /** Also answer with what each card of the gallery cost and is worth now (your gallery page, plans/overlay-bridge.md B2). */
    worth: z.boolean().optional(),
    /** Also answer with Sofix's line on this one player (his Sorare player page, plans/overlay-bridge.md B3). */
    profile: slug.optional(),
    /**
     * The Sorare gameweek the page's address names ("football-25-29-sep-2026"), when it names one: the cards on it are
     * about that gameweek, so it is that gameweek's numbers that are answered. Without it, the one being planned.
     */
    fixture: z
      .string()
      .regex(/^football-[a-z0-9-]{1,80}-\d{4}$/)
      .optional(),
    /**
     * The game a card is about where the page says so ("c:<card>" or "p:<player>" to Sorare's game id): a lineup's own game on Sorare's
     * lineup pages. That card is answered for that game, and with nothing when Sofix has no numbers for it.
     */
    games: z.record(z.string().regex(/^[cp]:[a-z0-9][a-z0-9_-]{0,119}$/), z.string().regex(/^[A-Za-z0-9:_-]{1,80}$/)).optional(),
    /** The leaderboard of the lineup builder the page is ("football-6-10-nov-2026-seasonal-spain-in_season_spain_limited"): each card's game that counts there. */
    board: z.string().regex(/^[a-z0-9][a-z0-9_-]{0,160}$/).optional(),
  })
  .refine((body) => body.cards.length + body.players.length <= OVERLAY_CAP, { message: `At most ${OVERLAY_CAP} slugs per call.` })
  .refine((body) => Object.keys(body.games ?? {}).length <= OVERLAY_CAP, { message: `At most ${OVERLAY_CAP} games per call.` });
export type OverlayRequest = z.infer<typeof OverlayRequest>;

/**
 * Sofix's read of the game Sorare's card shows: his next one in the gameweek. Win and clean sheet are fractions (0.56
 * is 56%); difficulty is the board's 0-100 with its label and 1 (easiest) to 5 bucket. `source` says where it came
 * from: the board's own model for a LaLiga game, else Sorare's odds for the game (any league or national team).
 */
export type OverlayGame = {
  win: number | null;
  cleanSheet: number | null;
  /** The goals his side is expected to score in it and to concede: the model's for a game a board rates, else what Sorare's prices imply. */
  goalsFor: number | null;
  goalsAgainst?: number | null;
  difficulty: number;
  bucket: Bucket;
  label: string;
  source: "model" | "sorare";
};

/** The game an answer is about, as Sorare names it: the side actually playing (a national team too) and its opponent. */
export type OverlayMatch = {
  id: string | null;
  kickoff: string;
  venue: "H" | "A" | null;
  competition: string;
  team: string | null;
  teamCrest: string | null;
  opponent: string;
  opponentCrest: string | null;
  /** The opponent's three letters and colour, for a crest Sorare does not have; null on payloads before 3 Nov 2026. */
  opponentCode: string | null;
  opponentColor: string | null;
};

/** A stat's place among the games Sofix rates that week, in sixths: 0 the worst sixth (Sorare's red) to 5 the best (its cyan). */
export type Tones = Partial<Record<Stat, number>>;
type Stat = "win" | "cleanSheet" | "goalsFor" | "goalsAgainst";

/** One game in the crest's island (plans/overlay-v2.md 1.2): who plays whom, when, the numbers for his side and where each stands. */
export type OverlayIslandGame = OverlayMatch & { game: OverlayGame | null; tones: Tones };

export type OverlayEntry = {
  /** His games for the island, kickoff order: the game the numbers are about, and the week's second one when he has two. */
  island?: OverlayIslandGame[];
  /** The game these numbers are about (plans/overlay-v2.md 1.7): his next one, a lineup's own, or the one counting on a builder. */
  match?: OverlayMatch;
  /** What he is expected to score, the chance he plays (a substitute appearance counts), and the average every cap counts. */
  x: number;
  p: number;
  average: number | null;
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

/** The gameweek's plan for the dock: what the best plan adds up to, what it uses, and each of its lineups. */
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
      /** When the gameweek locks (ISO), and each lineup of the best plan for the dock, likeliest to pay first. */
      lock?: string;
      /** The gameweek's address on Sorare ("football-19-23-oct-2026"): what the dock reads your entered lineups by. */
      fixture?: string;
      rows?: DockRow[];
      /** Set when these are the Pro lineups of the week being played that have not kicked off yet (`proPlan`): the first kickoff. */
      pro?: { starts: string | null; rank: number };
    }
  | { state: "waiting" | "none"; week: number; note: string };

/** One lineup of the best plan as the dock lists it, with what entering it on Sorare takes (`board`, `boardId`, `appearances`). */
export type DockRow = {
  comp: string;
  board: string;
  boardId: string;
  /** The days its games are played on, Madrid time ("Wed", "Tue–Thu"). */
  when: string;
  x: number;
  need: number | null;
  p: number;
  ess: number;
  cards: { slug: string; name: string; pic: string; s: number; captain: boolean; sub: boolean; slot: string }[];
  appearances: Appearance[];
  /** The starters whose game is still ahead and who are unlikely to start, each with the player of yours Sofix would put in (the dock's alarm). */
  alarms?: DockAlarm[];
  /** A Pro lineup (entered on Sorare's Pro board, open until `starts`, its first kickoff, ISO). */
  pro?: boolean;
  starts?: string | null;
  /** A Pro lineup rebuilt on the announced elevens (Play's "Load from Sorare"): its cards for Guide me, and the swaps named. */
  rebuilt?: { at: string; cards: DockRow["cards"]; swaps: { out: string; in: string; why: string }[] };
};

/** Each Pro row of the dock's plan with its rebuild, when the rebuild was made from that plan. */
export function withRebuild(plan: OverlayPlan, rebuild: { plan: number; at: string; lineups: (Lineup & { swaps: { out: string; in: string; why: string }[] })[] } | null, rank: number): OverlayPlan {
  if (plan.state !== "ready" || !plan.rows || !rebuild || rebuild.plan !== rank) return plan;
  return {
    ...plan,
    rows: plan.rows.map((row) => {
      const lineup = rebuild.lineups.find((one) => one.board === row.board);
      return lineup ? { ...row, rebuilt: { at: rebuild.at, cards: dockRow(lineup).cards, swaps: lineup.swaps } } : row;
    }),
  };
}

/** A starter at risk: `out` is his card in the lineup; `in` is a player of yours (a player slug, as Guide me finds a card by it) not in the plan, likelier to start. */
export type DockAlarm = {
  out: { slug: string; name: string; pic: string; pStart: number | null; why: string };
  in: { slug: string; name: string; pic: string; pStart: number; s: number } | null;
  /** Why there is no `in`: none of the players who can play in this competition is likely enough ("none"), or the plan does not say
   * who can (a plan made before the job listed them, "unknown"); then nothing is offered rather than a guess. */
  none?: "none" | "unknown";
};

/** Today's missions for the dock: what you picked, what Sofix would pick and the swaps between the two. */
export type DockPick = { slug: string; name: string; pic: string; chance: number | null };
export type DockMission = { id: string; title: string; reward: string | null; picks: number; yours: DockPick[]; sofix: DockPick[]; swaps: { out: DockPick; in: DockPick }[] };
export type DockMissions = { status: MissionsStatus; seenAt: string | null; rarity: string; missions: DockMission[] };

/**
 * Your gallery's prices for the overlay (plans/overlay-bridge.md, B2): each valued card by its slug, [what you paid, its worth now]
 * (paid null for a card you did not buy, crafted or won), the bought cards' totals as the Prices page has them, whose gallery it is
 * (the Sorare account the job reads) and when Sorare's values were read. A card Sorare does not value is left out.
 */
export type OverlayWorth = { user: string; at: string; paid: number; worth: number; profit: number; bought: number; cards: Record<string, [number | null, number]> };

export function overlayWorth(sorare: Sorare): OverlayWorth {
  const collection = sorare.collection ?? [];
  const p = prices(collection);
  const cards: OverlayWorth["cards"] = {};
  for (const card of collection) {
    if (typeof card.value === "number") cards[card.slug] = [typeof card.paid === "number" && card.paid > 0 ? card.paid : null, card.value];
  }
  return { user: sorare.user, at: sorare.generatedAt, paid: p.paid, worth: p.worth, profit: p.profit, bought: p.bought.length, cards };
}

export type OverlayAnswer = {
  /** The Sorare gameweek these numbers are for. */
  week: number;
  cards: Record<string, OverlayEntry>;
  players: Record<string, OverlayEntry>;
  plan?: OverlayPlan;
  missions?: DockMissions;
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
    lock: gameweek.gameweek.lock,
    fixture: gameweek.gameweek.slug,
    rows: [...best.lineups].filter((lineup) => !lineup.expected).sort((a, b) => (b.pReturn ?? 0) - (a.pReturn ?? 0)).map((lineup) => dockRow(lineup, alarmsOf(gameweek, best.lineups, lineup, now))),
  };
}

/**
 * The dock during a gameweek being played: its Pro lineups whose first player has not kicked off, the only lineups still open to a
 * change (the owner, 20 Oct 2026: "show pro mode games that are going to get played"). Null when there is none.
 */
export function proPlan(gameweek: GameweekPlan, now: Date): OverlayPlan | null {
  const open = new Set((gameweek.plans[0]?.lineups ?? []).filter((lineup) => proOpen(lineup, now)).map((lineup) => lineup.board));
  const plan = open.size ? overlayPlan(gameweek, now) : null;
  if (plan?.state !== "ready") return null;
  const rows = (plan.rows ?? []).filter((row) => open.has(row.board)).sort((a, b) => (a.starts ?? "").localeCompare(b.starts ?? ""));
  return { ...plan, rows, pro: { starts: rows[0]?.starts ?? null, rank: gameweek.plans[0]!.rank } };
}

/** Under this chance of starting (or injured, or suspended) a starter sets the alarm off. The owner has not named a figure: 50% until he does. */
export const ALARM_BELOW = 0.5;
/** A replacement must be at least this likely to start: a swap that only trades one doubt for another is not offered. */
const REPLACEMENT_AT = 0.7;

/**
 * The starters of one lineup whose game is still ahead and who are unlikely to start, and for each the player of yours likeliest to
 * start (his score if he starts breaks a tie) among those the job says can take that slot in this competition (`alts`: its rules, and
 * in no lineup of the plan). The numbers are the ones the cards already show; a game that has kicked off is never an alarm, since
 * nothing can be changed then.
 */
function alarmsOf(gameweek: GameweekPlan, lineups: Lineup[], lineup: Lineup, now: Date): DockAlarm[] {
  const playing = new Map<string, PlayingPlayer>();
  for (const player of gameweek.playing.players) if (player.player) playing.set(player.player, player);
  const named = new Set(gameweek.playing.players.map((player) => player.name));
  const used = new Set(lineups.flatMap((one) => [...(one.starters ?? []), ...(one.subs ?? [])]).flatMap((card) => [card.player ?? "", card.name]));
  const readOf = (player: PlayingPlayer) => entryFor(player, null, now, "", undefined);
  const unwell = (kind: FfStatus["kind"] | undefined) => kind === "out" || kind === "suspended";
  const taken = new Set<string>();
  return (lineup.starters ?? []).flatMap((card, index): DockAlarm[] => {
    const player = card.player ? playing.get(card.player) : gameweek.playing.players.find((one) => one.name === card.name && named.has(card.name));
    if (!player) return [];
    const now1 = readOf(player);
    if (now1.over || now1.pStart === undefined) return [];
    const kind = now1.ffStatus?.kind;
    if (now1.pStart >= ALARM_BELOW && !unwell(kind)) return [];
    const fits = lineup.alts?.[index];
    const pool = (fits ?? [])
      .flatMap((slug) => playing.get(slug) ?? [])
      .filter((one) => !used.has(one.player!) && !taken.has(one.player!))
      .flatMap((one) => {
        const read = readOf(one);
        return read.over || read.pStart === undefined || read.pStart < REPLACEMENT_AT || unwell(read.ffStatus?.kind) ? [] : [{ one, read }];
      })
      .sort((a, b) => b.read.pStart! - a.read.pStart! || (b.read.start ?? b.read.x) - (a.read.start ?? a.read.x));
    const pick = pool[0];
    if (pick) taken.add(pick.one.player!);
    const why = kind === "out" ? "injured" : kind === "suspended" ? "suspended" : kind === "doubt" ? "a doubt" : "";
    return [{
      out: { slug: card.slug, name: card.name, pic: card.pic, pStart: now1.pStart, why },
      in: pick ? { slug: pick.one.player!, name: pick.one.name, pic: pick.one.pic, pStart: pick.read.pStart!, s: Math.round(pick.read.start ?? pick.read.x) } : null,
      ...(pick ? {} : { none: fits ? ("none" as const) : ("unknown" as const) }),
    }];
  });
}

const DAY = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Madrid", weekday: "short" });

function dockRow(given: Lineup, alarms: DockAlarm[] = []): DockRow {
  const lineup = { ...given, starters: given.starters ?? [], subs: given.subs ?? [] }; // an older payload may lack a list
  const kickoffs = lineup.starters.flatMap((card) => (card.fixture?.kickoff ? [Date.parse(card.fixture.kickoff)] : [])).sort((a, b) => a - b);
  const days = kickoffs.length ? [DAY.format(kickoffs[0]!), DAY.format(kickoffs[kickoffs.length - 1]!)] : [];
  const card = (one: Lineup["starters"][number], sub: boolean) => ({ slug: one.slug, name: one.name, pic: one.pic, s: cardScore(one).value, captain: one.captain === true, sub, slot: sub ? "SUB" : (one.slot ?? one.pos) });
  return {
    comp: lineup.comp,
    board: lineup.board,
    boardId: lineup.boardId,
    when: days[0] === days[1] ? (days[0] ?? "") : days.join("–"),
    x: Math.round(lineup.x),
    need: lineup.need ?? null,
    p: lineup.pReturn ?? 0,
    ess: Math.round(lineup.eEss ?? 0),
    cards: [...lineup.starters.map((one) => card(one, false)), ...lineup.subs.map((one) => card(one, true))],
    appearances: appearances(lineup),
    ...(lineup.pro ? { pro: true, starts: kickoffs.length ? new Date(kickoffs[0]!).toISOString() : null } : {}),
    ...(alarms.length ? { alarms } : {}),
  };
}

/**
 * Today's missions in the few words the dock shows. Your picks and Sofix's carry the chance Sofix gives each (none for a card it has no
 * number for); a swap pairs a pick of yours Sofix would not make with one of Sofix's you have not made, only when Sofix's is the likelier.
 */
export function dockMissions(today: { status: MissionsStatus; seenAt: string | null; rarity: string; plans: MissionPlan[] }): DockMissions {
  const missions = today.status !== "today" ? [] : today.plans.map((plan): DockMission => {
    const known = new Map(plan.all.map((one) => [one.slug, one]));
    const pick = (slug: string): DockPick => {
      const one = known.get(slug) ?? plan.picks.find((p) => p.slug === slug);
      return { slug, name: one?.name ?? slug, pic: one?.pic ?? "", chance: one && !one.noEstimate ? one.chance : null };
    };
    const yours = (plan.mission.appearances ?? []).map((a) => pick(a.player));
    const sofix = plan.picks.map((p) => pick(p.slug));
    const out = yours.filter((y) => !sofix.some((s) => s.slug === y.slug));
    const add = sofix.filter((s) => !yours.some((y) => y.slug === s.slug));
    const swaps = out.flatMap((one, i) => {
      const better = add[i];
      return better && better.chance !== null && (one.chance === null || better.chance > one.chance) ? [{ out: one, in: better }] : [];
    });
    return { id: plan.mission.id, title: plan.mission.title, reward: plan.reward, picks: plan.mission.picks, yours, sofix, swaps };
  });
  return { status: today.status, seenAt: today.seenAt, rarity: today.rarity, missions };
}

/** The board only models LaLiga. Sorare names it "laliga-es"; "laliga-2" and every cup are other competitions. */
const LALIGA = /^laliga(-es)?$/i;

/** Which game an answer is about: a named one (a lineup's), else one of these leagues (a builder's), else any. */
type Pick = { id?: string; leagues?: string[] | null };

/** The game to show: the one named, else the next one still to be played (of the leagues asked for), or the last when they are all done. */
function shownGame(games: PlayerGame[], now: Date, pick: Pick = {}): PlayerGame | null {
  if (pick.id) return games.find((game) => game.id === pick.id) ?? null;
  const counted = pick.leagues ? games.filter((game) => pick.leagues!.includes(game.competition)) : games;
  if (!counted.length) return null;
  const ordered = [...counted].sort((a, b) => Date.parse(a.kickoff) - Date.parse(b.kickoff));
  return ordered.find((game) => Date.parse(game.kickoff) + GAME_MS > now.getTime()) ?? ordered[ordered.length - 1]!;
}

/**
 * A game stays a card's game until its final whistle (plans/overlay-v2.md edge case 4), so the crest turns into the live pill while it
 * is on: 115 minutes after kick-off, the extension's own rule for a game being over (overlay.js NEED_GAME_MS).
 */
const GAME_MS = 115 * 60_000;
const ahead = (game: { kickoff?: string | null } | null | undefined, now: Date) => Boolean(game?.kickoff) && Date.parse(game!.kickoff!) + GAME_MS > now.getTime();

function matchOf(game: PlayerGame | MarketFixture, club: string | null): OverlayMatch {
  return {
    id: game.id ?? null,
    kickoff: game.kickoff ?? "",
    venue: game.venue ?? null,
    competition: game.competition ?? "",
    team: game.team ?? club,
    teamCrest: game.teamCrest ?? null,
    opponent: game.opponent ?? "",
    opponentCrest: game.opponentCrest ?? null,
    opponentCode: game.opponentCode ?? null,
    opponentColor: game.opponentColor ?? null,
  };
}

/**
 * The read of his next game. A LaLiga game is the board's own numbers, matched on the side he plays for, its
 * venue and the opponent, so it says what /difficulty says. Anything else (or a LaLiga game the board has no
 * forecast for) is Sorare's odds as the job published them, and no odds at all is `null`.
 */
function boardFor(
  game: { team?: string | null; opponent?: string | null; venue?: string | null; kickoff?: string | null; competition?: string | null },
  club: string | null,
  grids: (FixtureGrid | null)[],
): SideOutlook | undefined {
  const code = BOARD_OF[game.competition ?? ""];
  const side = game.team ?? club;
  if (!code || !side || !game.opponent) return undefined;
  const matches: SideOutlook[] = [];
  for (const grid of grids) {
    if (!grid || (grid.competition ?? "PD") !== code) continue;
    for (const team of grid.teams) {
      if (clubKey(team.name) !== clubKey(side)) continue;
      for (const cell of team.cells.flat()) {
        const opponent = grid.teams.find(t => t.code === cell.opponent_code);
        const p = cell.prediction;
        if (!opponent || clubKey(opponent.name) !== clubKey(game.opponent) || cell.venue !== game.venue || !p) continue;
        // A European pair can meet again in a knockout: the actual date identifies the leg.
        if (isEuropean(code) && (!game.kickoff || Math.abs(Date.parse(cell.kickoff_utc) - Date.parse(game.kickoff)) > 20 * 60_000)) continue;
        matches.push({ club: team.name, opponent: opponent.name, win: p.probabilities.win, cleanSheet: p.clean_sheet,
          xgFor: p.xg_for, xgAgainst: p.xg_against, difficulty: p.difficulty, bucket: p.bucket, label: p.label });
      }
    }
  }
  return matches.length === 1 ? matches[0] : undefined;
}

function gameFor(player: PlayingPlayer, game: PlayerGame | null, outlook: Map<string, SideOutlook> | null, grids: (FixtureGrid | null)[]): OverlayGame | null {
  if (!game) return null;
  const side = game.team ?? player.club;
  const board = (outlook && side && LALIGA.test(game.competition) ? outlook.get(`${clubKey(side)}|${game.venue}|${clubKey(game.opponent)}`) : undefined) ?? boardFor(game,player.club,grids);
  if (board && board.win !== null && board.difficulty !== null && board.bucket !== null && board.label !== null) {
    return { win: board.win, cleanSheet: board.cleanSheet, goalsFor: board.xgFor, goalsAgainst: board.xgAgainst ?? null, difficulty: board.difficulty, bucket: board.bucket, label: board.label, source: "model" };
  }
  const odds = game.odds;
  return odds
    ? { win: odds.win, cleanSheet: odds.cleanSheet, goalsFor: odds.goalsFor ?? null, goalsAgainst: odds.goalsAgainst ?? null, difficulty: odds.difficulty, bucket: odds.bucket, label: odds.label, source: "sorare" }
    : null;
}

const STATS: Record<Stat, (cell: FixtureGrid["teams"][number]["cells"][number][number]) => number | null | undefined> = {
  win: (cell) => cell.prediction?.probabilities.win,
  cleanSheet: (cell) => cell.prediction?.clean_sheet,
  goalsFor: (cell) => cell.prediction?.xg_for,
  goalsAgainst: (cell) => cell.prediction?.xg_against,
};
const LOWER_IS_BETTER: Stat[] = ["goalsAgainst"];

/**
 * Each stat's five cut points (sixths) over every game Sofix rates between two times, on every board (plans/overlay-v2.md 7): a game
 * is one side's cell. A week of fewer than 12 rated games is too few to rank fairly, so the season's games are used instead.
 */
export function weekCuts(grids: (FixtureGrid | null)[], from: number, to: number): Record<Stat, number[] | undefined> {
  const cells = grids.flatMap((grid) => (grid ? grid.teams.flatMap((team) => team.cells.flat()) : [])).filter((cell) => cell.prediction);
  const week = cells.filter((cell) => {
    const at = Date.parse(cell.kickoff_utc);
    return at >= from && at <= to;
  });
  const pool = week.length >= 12 ? week : cells;
  const out = {} as Record<Stat, number[] | undefined>;
  for (const stat of Object.keys(STATS) as Stat[]) {
    const values = pool.map(STATS[stat]).filter((v): v is number => typeof v === "number" && Number.isFinite(v)).sort((a, b) => a - b);
    out[stat] = values.length >= 12 ? [1, 2, 3, 4, 5].map((k) => values[Math.min(values.length - 1, Math.floor((k * values.length) / 6))]!) : undefined;
  }
  return out;
}

/** A value's sixth: 0 (worst) to 5 (best), against five cut points. */
export function toneOf(value: number, cuts: number[], higherIsBetter: boolean): number {
  const above = cuts.filter((cut) => value > cut).length;
  return higherIsBetter ? above : 5 - above;
}

function tonesOf(game: OverlayGame | null, cuts: ReturnType<typeof weekCuts>): Tones {
  if (!game) return {};
  const out: Tones = {};
  const values: Record<Stat, number | null | undefined> = { win: game.win, cleanSheet: game.cleanSheet, goalsFor: game.goalsFor, goalsAgainst: game.goalsAgainst };
  for (const stat of Object.keys(values) as Stat[]) {
    const value = values[stat];
    const statCuts = cuts[stat];
    if (typeof value === "number" && statCuts) out[stat] = toneOf(value, statCuts, !LOWER_IS_BETTER.includes(stat));
  }
  return out;
}

/**
 * His expected goals in the game he is shown, if he starts: his non-penalty rate scaled by how many goals his side is
 * expected to score in it against its own average (clamped to half and double, so one odd price cannot make a number),
 * plus his penalty part. A national-team game is his own rate as it is: a club average is no yardstick for a country's
 * goals. No game, or no goals for it, is his own rate as well. Nothing at all when Understat has no numbers on him.
 */
function xgFor(player: PlayingPlayer, game: OverlayGame | null, shown: PlayerGame | null): number | undefined {
  const base = player.xg;
  if (!base) return undefined;
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
  grids: (FixtureGrid | null)[] = [],
  shown: PlayerGame | null = shownGame(player.games, now),
  /** A Pro or Arcade card plays one game: its own numbers, when the job published them, instead of the week's. */
  oneGame = false,
): OverlayEntry {
  if (oneGame && shown?.x !== undefined) player = { ...player, x: shown.x, ...(shown.start !== undefined ? { start: shown.start } : {}) };
  const game = gameFor(player, shown, outlook, grids);
  const xg = xgFor(player, game, shown);
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
    ...(shown ? { match: matchOf(shown, player.club) } : {}),
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

/** A player Sofix rates but your plan does not hold: his market row (xScore, chance to play) and his league's board for the game. */
function marketEntry(row: MarketPlayer, boards: (FixtureGrid | null)[], now: Date, at: string, oneGame = false): OverlayEntry | null {
  const f = row.fixture;
  if (oneGame && f?.x !== undefined) row = { ...row, x: f.x, ...(f.start !== undefined ? { start: f.start } : {}) };
  if (row.pos === "UNK" || row.x === undefined || row.p === undefined || !f?.kickoff) return null;
  const board = boardFor(f,row.club,boards);
  return {
    match: matchOf(f, row.club),
    x: row.x,
    p: row.p,
    average: row.average,
    pos: row.pos,
    laliga: LALIGA.test(f.competition ?? ""),
    at,
    game: board ? { win: board.win, cleanSheet: board.cleanSheet, goalsFor: board.xgFor, goalsAgainst: board.xgAgainst ?? null, difficulty: board.difficulty!, bucket: board.bucket!, label: board.label!, source: "model" } : null,
    ...(Date.parse(f.kickoff) <= now.getTime() ? { over: true as const } : {}),
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
  /**
   * Every player Sofix rates (not only yours) and the leagues' boards; `weeks` are other weeks a lineup's game may sit in (the one
   * being played), read only for a game a page names; `playing` is the week being played, whose games still ahead come first on a
   * page that names no week (plans/overlay-v2.md 1.7.3: his next game, whatever the week).
   */
  others: { market: MarketPlayer[]; grids: (FixtureGrid | null)[]; weeks?: GameweekPlan[]; playing?: GameweekPlan | null } = { market: [], grids: [] },
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
    // The dock asked for this week's plan: say there is none in words, not nothing (it read nothing as "Sofix is not reachable").
    const note = { state: "none" as const, week, note: "Sofix holds nothing on this gameweek." };
    return { week, cards: {}, players: {}, ...(request.plan ? { plan: note } : {}) };
  }
  const outlook = grid ? sideOutlook(grid) : null;
  // The numbers of a week kept apart are as they stood when it finished, and its plan was a replay, not what you entered.
  const madeAt = plan.builtAt ?? (plan === kept ? plan.gameweek.end : sorare.generatedAt);

  const owners = new Map((sorare.collection ?? []).map((card) => [card.slug, card.player]));
  // The week after the one being planned: a card whose game this week is played (or who has none) is answered for his next one there
  // (plans/overlay-v2.md 1.7), unless the page names its week. Other weeks (the one being played) only answer a game a page names.
  const planned = nextWeek(sorare);
  const afterPlanned = sorare.weeks[sorare.weeks.indexOf(planned) + 1] ?? null;
  const following = plan === planned ? afterPlanned : null;
  const roll = !request.fixture && !request.week;
  const weeks = [plan, following, ...(others.weeks ?? [])].filter((week): week is GameweekPlan => Boolean(week));
  const read = new Map<GameweekPlan, { playing: Map<string, PlayingPlayer>; inPlan: Map<string, NonNullable<OverlayEntry["inPlan"]>>; at: string }>();
  const weekOf = (week: GameweekPlan) => {
    if (!read.has(week)) {
      const playing = new Map<string, PlayingPlayer>();
      for (const player of week.playing.players) if (player.player) playing.set(player.player, player);
      // The best plan's cards, by the player each belongs to, with the lineup each is in and whether he captains it.
      const inPlan = new Map<string, NonNullable<OverlayEntry["inPlan"]>>();
      for (const lineup of (week === kept ? [] : (week.plans ?? [])[0]?.lineups) ?? []) {
        for (const card of [...(lineup.starters ?? []), ...(lineup.subs ?? [])]) {
          const owner = owners.get(card.slug);
          if (owner) inPlan.set(owner, { ...inPlan.get(owner), [card.slug]: { lineup: lineup.comp, captain: card.captain === true } });
        }
      }
      read.set(week, { playing, inPlan, at: week === plan ? madeAt : (week.builtAt ?? sorare.generatedAt) });
    }
    return read.get(week)!;
  };

  // Anyone else Sofix rates (an Arcade common, a player you do not hold): his market row for the week being planned, and the one after.
  const market = plan === planned || plan === afterPlanned ? new Map(others.market.map((row) => [row.slug, row])) : new Map<string, MarketPlayer>();
  const nextOf = (row: MarketPlayer): MarketPlayer | null => (row.next ? { ...row, ...row.next, fixture: row.next.fixture } : null);
  // His game of the week being played, still ahead: the refresh leaves the side's crest out of it (the row has it).
  const nowOf = (row: MarketPlayer): MarketPlayer | null =>
    row.now ? { ...row, ...row.now, fixture: { ...row.now.fixture, teamCrest: row.now.fixture.teamCrest ?? row.crest } } : null;
  const boards = [...new Map([grid, ...others.grids].flatMap(g => g ? [[g.competition ?? "PD", g] as const] : [])).values()];
  const leaguesOf = (week: GameweekPlan) => (request.board ? (week.boards?.[request.board] ?? null) : null);
  const counted = (row: MarketPlayer | null, week: GameweekPlan) => {
    const leagues = leaguesOf(week);
    return row?.fixture && (!leagues || leagues.includes(row.fixture.competition ?? "")) ? row : null;
  };
  // Pro and Arcade cards play one game: a lineup page's card (it names its game) and a Pro board's builder. Classic counts the week.
  const oneGame = (week: GameweekPlan, hint: string | undefined) => Boolean(hint) || Boolean(request.board && week.perGame?.includes(request.board));
  const priced = (row: MarketPlayer | null, one: boolean) => {
    const entry = row ? marketEntry(row, boards, now, sorare.generatedAt, one) : null;
    if (!entry || !row?.fixture?.kickoff) return entry;
    const week = row.now && row.fixture.id === row.now.fixture.id ? (others.playing ?? null) : plan === afterPlanned || row.fixture === row.next?.fixture ? afterPlanned : plan;
    const fixture = { ...row.fixture, kickoff: row.fixture.kickoff, competition: row.fixture.competition ?? "", opponent: row.fixture.opponent ?? "", venue: row.fixture.venue ?? "H" } as PlayerGame;
    return { ...entry, island: islandOf([fixture], row.club, week, () => entry.game) };
  };

  // The island ranks each stat against the games of the week it is about (the gameweek's dates, else three and a half days either side).
  const cutsFor = new Map<string, ReturnType<typeof weekCuts>>();
  const cutsAround = (week: GameweekPlan | null, kickoff: string) => {
    const start = Date.parse(week?.gameweek.start ?? "");
    const end = Date.parse(week?.gameweek.end ?? "");
    const at = Date.parse(kickoff);
    const [from, to] = Number.isFinite(start) && Number.isFinite(end) ? [start, end] : [at - 84 * 3_600_000, at + 84 * 3_600_000];
    const key = `${from}|${to}`;
    if (!cutsFor.has(key)) cutsFor.set(key, weekCuts(boards, from, to));
    return cutsFor.get(key)!;
  };
  const islandOf = (games: PlayerGame[], club: string | null, week: GameweekPlan | null, game: (one: PlayerGame) => OverlayGame | null): OverlayIslandGame[] =>
    [...games]
      .sort((a, b) => Date.parse(a.kickoff) - Date.parse(b.kickoff))
      .map((one) => {
        const numbers = game(one);
        return { ...matchOf(one, club), game: numbers, tones: tonesOf(numbers, cutsAround(week, one.kickoff)) };
      });

  const ownedFor = (playerSlug: string, week: GameweekPlan, pick: Pick): { entry: OverlayEntry; ahead: boolean } | null => {
    const known = weekOf(week);
    const player = known.playing.get(playerSlug);
    const shown = player ? shownGame(player.games, now, pick) : null;
    if (!player || !shown) return null;
    const entry = entryFor(player, outlook, now, known.at, known.inPlan.get(playerSlug), boards, shown, oneGame(week, pick.id));
    // A lineup's card is about its one game; elsewhere the island lists the week's games that count on the page (two: both crests).
    const counted = pick.id ? [shown] : player.games.filter((one) => !pick.leagues || pick.leagues.includes(one.competition));
    const island = islandOf(counted, player.club, week, (one) => gameFor(player, one, outlook, boards));
    return { entry: { ...entry, island }, ahead: ahead(shown, now) };
  };

  const answer = (playerSlug: string, hint: string | undefined): OverlayEntry | null => {
    const row = market.get(playerSlug) ?? null;
    if (hint) {
      for (const week of weeks) {
        const found = ownedFor(playerSlug, week, { id: hint });
        if (found) return found.entry;
      }
      return priced([row, row && nextOf(row)].find((one) => one?.fixture?.id === hint) ?? null, true);
    }
    // Yours: a game of the week being played while it is still ahead (3 Nov 2026: Mbappé's Wednesday Champions League game, not his
    // Saturday one), then this week's game while it is ahead (or the page is about this week), else his next one in the week after.
    const playing = roll && others.playing && others.playing !== plan ? others.playing : null;
    const sooner = playing ? ownedFor(playerSlug, playing, { leagues: leaguesOf(playing) }) : null;
    if (sooner?.ahead) return sooner.entry;
    // Not in that week's plan (an Arcade common you hold): his market row's game of the week being played, from the refresh.
    const soon = roll && row ? nowOf(row) : null;
    if (soon && ahead(soon.fixture, now) && counted(soon, playing ?? plan)) return priced(soon, oneGame(playing ?? plan, undefined));
    const here = ownedFor(playerSlug, plan, { leagues: leaguesOf(plan) });
    if (here && (here.ahead || !roll || !following)) return here.entry;
    const later = roll && following ? ownedFor(playerSlug, following, { leagues: leaguesOf(following) }) : null;
    if (later?.ahead) return later.entry;
    if (here) return here.entry;
    // Anyone else, the same from his market row (his game of the week being played came first, above); a page about the week after
    // reads that row's next game.
    if (!row) return null;
    if (plan === afterPlanned) return priced(counted(nextOf(row), plan), oneGame(plan, undefined));
    const current = counted(row, plan);
    if (current && (ahead(current.fixture, now) || !roll)) return priced(current, oneGame(plan, undefined));
    const next = roll && following ? counted(nextOf(row), following) : null;
    return next ? priced(next, oneGame(following!, undefined)) : priced(current, oneGame(plan, undefined));
  };

  const entries = new Map<string, OverlayEntry | null>();
  const forPlayer = (playerSlug: string | undefined, hint: string | undefined): OverlayEntry | null => {
    if (!playerSlug) return null;
    const key = `${playerSlug}|${hint ?? ""}`;
    if (!entries.has(key)) entries.set(key, answer(playerSlug, hint));
    return entries.get(key) ?? null;
  };

  const cards: Record<string, OverlayEntry> = {};
  for (const cardSlug of request.cards) {
    const entry = forPlayer(owners.get(cardSlug), request.games?.[`c:${cardSlug}`]);
    if (entry) cards[cardSlug] = entry;
  }
  const players: Record<string, OverlayEntry> = {};
  for (const playerSlug of request.players) {
    const entry = forPlayer(playerSlug, request.games?.[`p:${playerSlug}`]);
    if (entry) players[playerSlug] = entry;
  }
  return { week: plan.gameweek.number, cards, players, ...(request.plan ? { plan: overlayPlan(plan, now) } : {}) };
}

/** Sofix's line on one LaLiga player's Sorare page (plans/overlay-bridge.md, B3), with the numbers his /players page shows. */
export type OverlayProfile = {
  name: string;
  /** His score if he starts (if he plays, when `ifStarts` is false); null when Sofix has none for the week. */
  score: number | null;
  ifStarts: boolean;
  pStart: number | null;
  startSource?: StartSource;
  sources: Partial<Record<StartSource, number>>;
  yours: boolean;
  /** The lineups of the best plan his cards are in. */
  inPlan: string[];
  verdict: Verdict | null;
  next: NextGameCell[];
  at: string;
};

/**
 * `planned`, `market` and `plan` are what /players/<slug> reads for the week in the top bar, so the two say the same. Null outside
 * LaLiga (his club is not on the board) or when Sofix holds nothing on him: the page then draws nothing, never zeros.
 */
export function overlayProfile(
  sorare: Sorare,
  grid: FixtureGrid | null,
  slug: string,
  read: { plan: GameweekPlan | null; planned: PlayingPlayer | null; market: MarketPlayer | null },
  now: Date,
): OverlayProfile | null {
  const { planned, market, plan } = read;
  const club = planned?.club ?? market?.club;
  const next = grid && club ? nextFive(grid, club, now) : null;
  if (!next || !(planned ?? market)) return null;
  // As PlayerView: your planned player's own numbers, else his row of the LaLiga index when it has the week's xScore.
  const theirs = !planned && market && typeof market.x === "number" ? market : null;
  const start = planned?.start ?? theirs?.start;
  const score = planned ? Math.round(planned.start ?? planned.x) : theirs && typeof (theirs.start ?? theirs.mu) === "number" ? Math.round((theirs.start ?? theirs.mu)!) : null;
  const collection = sorare.collection ?? [];
  const owned = new Set(collection.map((card) => card.player));
  const mine = new Set(collection.filter((card) => card.player === slug).map((card) => card.slug));
  const inPlan = (plan?.plans[0]?.lineups ?? [])
    .filter((lineup) => [...(lineup.starters ?? []), ...(lineup.subs ?? [])].some((card) => mine.has(card.slug)))
    .map((lineup) => lineup.comp);
  const source = planned ?? theirs;
  return {
    name: (planned ?? market)!.name,
    score,
    ifStarts: typeof start === "number",
    pStart: typeof source?.pStart === "number" ? source.pStart : null,
    ...(source?.startSource ? { startSource: source.startSource } : {}),
    sources: source?.sources ?? {},
    yours: owned.has(slug),
    inPlan,
    verdict: market ? verdict(market, squadBar(collection), owned) : null,
    next,
    at: plan?.builtAt ?? sorare.generatedAt,
  };
}
