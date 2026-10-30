import { z } from "zod";
import { askExtension, extensionAtLeast, pingExtension } from "./extension";
import { REFRESH_HEADER } from "./refresh";
import type { Outlook, PackOdds, StartSource } from "./arcadePlan";
import { parseTierOdds, type TierOdds } from "./arcadePacks";
import type { PlayerStatus } from "./arcadeTeams";

/**
 * Arcade, step 1 (plans/set.md): your set board, common cards, gems, essence and common missions, read from your signed-in
 * Sorare tab through the extension. Read only, on demand, never polled; the last read is kept in this browser, never in the database.
 */
export const ARCADE_EXTENSION_VERSION = "0.4.5";
const MAX_CARD_PAGES = 40; // 100 cards a page
const MAX_GAME_PAGES = 10; // 50 games a page

export type ArcadeCard = {
  slug: string;
  player: string;
  name: string;
  team: string | null;
  /** The club's Sorare slug, which ties the card to its games (`games`). */
  teamSlug: string | null;
  teamPicture: string | null;
  /** The club's league as Sorare names it; null for a national team or when Sorare gives none. */
  league: { slug: string; name: string } | null;
  positions: string[];
  picture: string | null;
  edition: string | null;
  /** Sorare's edition multiplier (SkinEdition.bonus): 1 for Standard, 1.05 for +5%; null when it gives none. */
  bonus: number | null;
};
/** A card in an entered lineup. `bonus` is Sorare's multiplier for it (1.52 for a captain with a +2% club); `game` its game id. */
export type ArcadeAppearance = { slug: string | null; player: string | null; name: string | null; captain: boolean; score: number | null; locked: boolean; kickoff: string | null; bonus: number | null; game: string | null };
export type ArcadeLineup = { id: string; state: string; score: number | null; cancelled: boolean; live: boolean; updatable: boolean; forfeitable: boolean; draft: boolean; cards: ArcadeAppearance[] };
export type ArcadePack = { slug: string; title: string; price: number; currency: string; cards: number; canBuy: boolean; league: string | null };
export type ArcadeStep = {
  id: string;
  /** 1 for the board's first step. Sorare's own `level` starts at 0. */
  number: number;
  level: number;
  title: string | null;
  target: number;
  originalTarget: number | null;
  state: string;
  rewards: string[];
  /** Sorare's lineup counts for the step (CareerStep), unchanged: null when the step is not a CareerStep. */
  lineups: { max: number; remaining: number; locked: number; pending: number } | null;
  /** The step's scoring settings as Sorare gives them (EngineConfiguration). */
  captain: number | null;
  collection: boolean | null;
  packs: ArcadePack[];
  entered: ArcadeLineup[];
};
export type ArcadeMission = {
  id: string;
  kind: string;
  title: string | null;
  description: string | null;
  state: string | null;
  expired: boolean;
  rewards: string[];
  /** A Decisive Picker's picks so far; null for another kind. */
  picks: number | null;
  maxPicks: number | null;
  /** A streak's progress towards its target (e.g. 2 of 5); null for another kind. */
  progress: number | null;
  target: number | null;
  /** A Decisive Picker's counted stats (Sorare's names, e.g. goals, goal_assist), its day, and the players already picked. */
  stats: string[];
  start: string | null;
  picked: string[];
  /** True once a pick's game has started: Sorare no longer lets it be changed. */
  pickLocked: boolean;
};
/** A game the set board can be played on (`CareerBoard.pickableGames`). */
export type ArcadeGame = {
  id: string;
  kickoff: string;
  status: string;
  competition: { slug: string; name: string };
  /** Sorare's crest (extension 0.4.15); null before, when a card of the club gives one instead. */
  home: { slug: string; name: string; crest: string | null } | null;
  away: { slug: string; name: string; crest: string | null } | null;
};
export type Arcade = {
  set: { slug: string; name: string; start: string | null; end: string | null; leagues: { slug: string; name: string }[] };
  gems: number | null;
  essence: number | null;
  /** `current` is the number (1 = first) of the step you are on; null when Sorare names none. */
  board: {
    id: string;
    /** Sorare's board config, which names its compose page (`/football/play/boards/pro/<config>/<step>/compose-team`). */
    config: string | null;
    title: string | null;
    end: string | null;
    current: number | null;
    restartable: boolean | null;
    steps: ArcadeStep[];
  } | null;
  /** The board's games from now to the set's end; null when Sorare did not answer for them. */
  games: ArcadeGame[] | null;
  cards: ArcadeCard[];
  /** Common cards of other sets, which Arcade on the current set leaves out. */
  otherSetCards: number;
  /** True when the card read stopped at MAX_CARD_PAGES before Sorare said it was done. */
  cardsCut: boolean;
  missions: ArcadeMission[];
};

const s = z.string();
const n = z.number();
const opt = <T extends z.ZodTypeAny>(t: T) => t.nullish();

const Reward = z.object({
  __typename: s,
  amount: z.union([n, z.object({ eurCents: opt(n), usdCents: opt(n), referenceCurrency: opt(s) })]).nullish(),
  currency: opt(s),
  rarity: opt(s),
  quantity: opt(n),
  quality: opt(s),
  cardPack: opt(z.object({ title: opt(s) })),
});
type Reward = z.infer<typeof Reward>;

const ArcadeData = z.object({
  cardSet: z.object({
    currentSet: z.object({
      slug: s,
      name: s,
      startDate: opt(s),
      endDate: opt(s),
      availableCompetitions: z.array(z.object({ slug: s, displayName: s })),
    }).nullable(),
  }),
  currentUser: z.object({
    gems: z.array(z.object({ currency: s, amount: n })),
    essence: z.array(z.object({ rarity: s, cardShardsCount: n, cardSet: opt(z.object({ slug: s })) })),
    setBoard: z.object({
      id: s,
      title: opt(s),
      endDate: opt(s),
      configSlug: opt(s),
      restartable: opt(z.boolean()),
      myCurrentStep: opt(z.object({ id: s, level: n })),
      steps: z.array(z.object({
        id: s,
        level: n,
        target: n,
        originalTarget: opt(n),
        state: s,
        title: opt(s),
        engineConfiguration: opt(z.object({ captain: opt(n), collection: opt(z.boolean()) })),
        rewardConfigs: z.array(Reward),
        maxLineupsCount: opt(n),
        remainingLineupsCount: opt(n),
        lockedLineupsCount: opt(n),
        pendingLineupsCount: opt(n),
        cardPacks: opt(z.array(z.object({ slug: s, title: s, effectivePrice: n, currency: s, cardsCount: n, canPurchase: z.boolean(), competition: opt(z.object({ slug: s })) }))),
      })),
    }).nullable(),
  }).nullable(),
});

const Appearance = z.object({
  captain: z.boolean(),
  score: opt(n),
  locked: z.boolean(),
  anyCard: opt(z.object({ slug: s })),
  player: opt(z.object({ slug: s, displayName: s })),
  bonus: opt(n),
  game: opt(z.object({ id: opt(s), date: opt(s) })),
});
const LineupsData = z.object({
  currentUser: z.object({
    setBoard: z.object({
      steps: z.array(z.object({
        id: s,
        myLineups: z.array(z.object({
          __typename: s,
          id: opt(s),
          draft: opt(z.boolean()),
          aasmState: opt(s),
          score: opt(n),
          cancelledAt: opt(s),
          forfeitable: opt(z.boolean()),
          hasLiveGames: opt(z.boolean()),
          updatable: opt(z.boolean()),
          taskAppearances: opt(z.array(Appearance)),
        })),
      })),
    }).nullable(),
  }).nullable(),
});

/** Sorare's General daily missions (`setPlayTasks`, extension 0.4.16); an older extension sends the dead Common streaks, read as none. */
export const ARCADE_MISSIONS_VERSION = "0.4.16";
const MissionsData = z.object({
  currentUser: z.object({
    setPlayTasks: z.array(z.object({
        __typename: s,
        id: opt(s),
        title: opt(s),
        description: opt(s),
        aasmState: opt(s),
        expired: opt(z.boolean()),
        maxAppearancesCount: opt(n),
        progress: opt(n),
        target: opt(n),
        rewardConfigs: opt(z.array(Reward)),
        taskAppearances: opt(z.array(z.unknown())),
        decisiveStats: opt(z.array(z.object({ name: s }))),
        startDate: opt(s),
      })),
  }).nullable(),
});

const CardsPage = z.object({
  currentUser: z.object({
    cards: z.object({
      nodes: z.array(z.object({
        slug: s,
        pictureUrl: opt(s),
        cardEditionName: opt(s),
        anyPositions: z.array(s),
        cardSet: opt(z.object({ slug: s })),
        skinEdition: opt(z.object({ bonus: opt(n), skinName: opt(s), variantName: opt(s) })),
        anyPlayer: z.object({ slug: s, displayName: s }),
        anyTeam: opt(z.object({ slug: opt(s), name: opt(s), pictureUrl: opt(s), domesticLeague: opt(z.object({ slug: s, displayName: s })) })),
      })),
      pageInfo: z.object({ hasNextPage: z.boolean(), endCursor: opt(s) }),
      /** All your commons, every set (extension 0.4.15): unchanged with an unchanged first page means the kept pages still hold. */
      totalCount: opt(n),
    }),
  }).nullable(),
});
type CardsPage = z.infer<typeof CardsPage>;

const CARDS_KEY = "sofix-arcade-cards";
type KeptCards = { user: string; total: number; first: string[]; pages: unknown[] };
/** The card pages kept from the last read, when Sorare's count and first page say nothing changed (a pack opened changes the count). */
export function keptCards(kept: KeptCards | null, user: string, firstPage: unknown): unknown[] | null {
  const page = CardsPage.safeParse(firstPage);
  const cards = page.success ? page.data.currentUser?.cards : null;
  if (!kept || !cards || cards.totalCount == null || kept.user !== user || kept.total !== cards.totalCount) return null;
  const first = cards.nodes.map((c) => c.slug);
  return first.length === kept.first.length && first.every((slug, i) => slug === kept.first[i]) ? kept.pages : null;
}
function keepCards(user: string, pages: unknown[]) {
  const page = CardsPage.safeParse(pages[0]);
  const cards = page.success ? page.data.currentUser?.cards : null;
  if (!cards || cards.totalCount == null) return;
  try { localStorage.setItem(CARDS_KEY, JSON.stringify({ user, total: cards.totalCount, first: cards.nodes.map((c) => c.slug), pages } satisfies KeptCards)); } catch { /* full or blocked: read next time */ }
}
function readKeptCards(): KeptCards | null {
  try { return JSON.parse(localStorage.getItem(CARDS_KEY) ?? "null") as KeptCards | null; } catch { return null; }
}

/** Sorare's edition multiplier as a bonus: 1.05 → "+5%". Standard (1) and unknown give null. */
export const bonusLabel = (bonus: number | null) => (bonus !== null && bonus > 1 ? `+${Math.round((bonus - 1) * 100)}%` : null);

const Team = z.object({ slug: s, name: s, pictureUrl: opt(s) }).nullish();
const GamesPage = z.object({
  currentUser: z.object({
    setBoard: z.object({
      pickableGames: z.object({
        nodes: z.array(z.object({
          game: z.object({ id: s, date: s, statusTyped: s, competition: z.object({ slug: s, displayName: s }), homeTeam: Team, awayTeam: Team }),
        })),
        pageInfo: z.object({ hasNextPage: z.boolean(), endCursor: opt(s) }),
      }).nullish(),
    }).nullable(),
  }).nullable(),
});

/** The board's games from Sorare's pages of answers, once each, by kick-off. Null when no page could be read. */
export function parseGames(pages: unknown[]): ArcadeGame[] | null {
  const games = new Map<string, ArcadeGame>();
  let read = false;
  for (const page of pages) {
    const parsed = GamesPage.safeParse(page);
    const nodes = parsed.success ? parsed.data.currentUser?.setBoard?.pickableGames?.nodes : null;
    if (!nodes) continue;
    read = true;
    for (const { game } of nodes) {
      games.set(game.id, {
        id: game.id,
        kickoff: game.date,
        status: game.statusTyped,
        competition: { slug: game.competition.slug, name: game.competition.displayName },
        home: game.homeTeam ? { slug: game.homeTeam.slug, name: game.homeTeam.name, crest: game.homeTeam.pictureUrl ?? null } : null,
        away: game.awayTeam ? { slug: game.awayTeam.slug, name: game.awayTeam.name, crest: game.awayTeam.pictureUrl ?? null } : null,
      });
    }
  }
  return read ? [...games.values()].sort((a, b) => a.kickoff.localeCompare(b.kickoff)) : null;
}

/** A card's games on the board: those its club plays, by kick-off. */
export function gamesOf(card: Pick<ArcadeCard, "teamSlug">, games: ArcadeGame[]): ArcadeGame[] {
  return card.teamSlug ? games.filter((g) => g.home?.slug === card.teamSlug || g.away?.slug === card.teamSlug) : [];
}

const thousands = (value: number) => value.toLocaleString("en-GB");

/** What a reward is, in Sorare's own terms. A kind this does not know is shown by its Sorare name, never guessed. */
export function rewardLabel(reward: Reward): string {
  const amount = typeof reward.amount === "number" ? reward.amount : null;
  switch (reward.__typename) {
    case "MonetaryRewardConfig": {
      const money = typeof reward.amount === "object" ? reward.amount : null;
      if (money?.eurCents != null) return `€${thousands(money.eurCents / 100)}`;
      if (money?.usdCents != null) return `$${thousands(money.usdCents / 100)}`;
      return "cash";
    }
    case "CardShardRewardConfig":
      if (reward.quantity == null) return "essence";
      return reward.rarity === "common" || !reward.rarity
        ? `${thousands(reward.quantity)} essence`
        : `${thousands(reward.quantity)} ${reward.rarity.replace("_", " ").replace(/^./, (c) => c.toUpperCase())} essence`;
    case "InGameCurrencyRewardConfig":
      if (amount === null) return reward.currency ?? "currency";
      return reward.currency === "COMMON_GEM" ? `${thousands(amount)} gems` : `${thousands(amount)} ${(reward.currency ?? "").toLowerCase().replaceAll("_", " ")}`;
    case "CardRewardConfig":
      return `a ${reward.rarity ?? ""} card`.replace("  ", " ");
    case "CardPacksRewardConfig":
      return reward.cardPack?.title ?? "a card pack";
    default:
      return reward.__typename.replace(/RewardConfig$/, "");
  }
}

/** Your lineups on each step, by step id, from Sorare's answer to SofixArcadeLineups (exported for the live refresh). */
export function parseLineups(lineups: unknown): Map<string, ArcadeLineup[]> {
  const lineupsByStep = new Map<string, ArcadeLineup[]>();
  const readLineups = LineupsData.safeParse(lineups);
  for (const step of readLineups.success ? readLineups.data.currentUser?.setBoard?.steps ?? [] : []) {
    lineupsByStep.set(step.id, step.myLineups.filter((l) => l.__typename === "TaskLineup" && l.id).map((l) => ({
      id: l.id as string,
      state: l.aasmState ?? "unknown",
      score: l.score ?? null,
      cancelled: Boolean(l.cancelledAt),
      live: Boolean(l.hasLiveGames),
      updatable: Boolean(l.updatable),
      forfeitable: Boolean(l.forfeitable),
      draft: Boolean(l.draft),
      cards: (l.taskAppearances ?? []).map((a) => ({
        slug: a.anyCard?.slug ?? null,
        player: a.player?.slug ?? null,
        name: a.player?.displayName ?? null,
        captain: a.captain,
        score: a.score ?? null,
        locked: a.locked,
        kickoff: a.game?.date ?? null,
        bonus: a.bonus ?? null,
        game: a.game?.id ?? null,
      })),
    })));
  }
  return lineupsByStep;
}

/** Sorare's four answers turned into one model. Null when the main read is not usable (signed out, or a shape we do not know). */
export function parseArcade(arcade: unknown, lineups: unknown, missions: unknown, cardPages: unknown[], gamePages: unknown[] = []): Arcade | null {
  const main = ArcadeData.safeParse(arcade);
  if (!main.success || !main.data.currentUser || !main.data.cardSet.currentSet) return null;
  const set = main.data.cardSet.currentSet;
  const user = main.data.currentUser;

  const lineupsByStep = parseLineups(lineups);

  const board = user.setBoard;
  const steps: ArcadeStep[] = [...(board?.steps ?? [])].sort((a, b) => a.level - b.level).map((step, index) => ({
    id: step.id,
    number: index + 1,
    level: step.level,
    title: step.title ?? null,
    target: step.target,
    originalTarget: step.originalTarget ?? null,
    state: step.state,
    rewards: step.rewardConfigs.map(rewardLabel),
    lineups: step.maxLineupsCount == null || step.remainingLineupsCount == null ? null : {
      max: step.maxLineupsCount,
      remaining: step.remainingLineupsCount,
      locked: step.lockedLineupsCount ?? 0,
      pending: step.pendingLineupsCount ?? 0,
    },
    captain: step.engineConfiguration?.captain ?? null,
    collection: step.engineConfiguration?.collection ?? null,
    packs: (step.cardPacks ?? []).map((p) => ({ slug: p.slug, title: p.title, price: p.effectivePrice, currency: p.currency, cards: p.cardsCount, canBuy: p.canPurchase, league: p.competition?.slug ?? null })),
    entered: lineupsByStep.get(step.id) ?? [],
  }));

  const cards: ArcadeCard[] = [];
  let otherSetCards = 0;
  let cardsCut = false;
  const seen = new Set<string>();
  cardPages.forEach((page, index) => {
    const parsed = CardsPage.safeParse(page);
    const connection: CardsPage["currentUser"] = parsed.success ? parsed.data.currentUser : null;
    if (!connection) return;
    if (index === cardPages.length - 1 && connection.cards.pageInfo.hasNextPage) cardsCut = true;
    for (const card of connection.cards.nodes) {
      if (seen.has(card.slug)) continue;
      seen.add(card.slug);
      if (card.cardSet?.slug !== set.slug) {
        otherSetCards += 1;
        continue;
      }
      cards.push({
        slug: card.slug,
        player: card.anyPlayer.slug,
        name: card.anyPlayer.displayName,
        team: card.anyTeam?.name ?? null,
        teamSlug: card.anyTeam?.slug ?? null,
        teamPicture: card.anyTeam?.pictureUrl ?? null,
        league: card.anyTeam?.domesticLeague ? { slug: card.anyTeam.domesticLeague.slug, name: card.anyTeam.domesticLeague.displayName } : null,
        positions: card.anyPositions,
        picture: card.pictureUrl ?? null,
        edition: card.skinEdition?.variantName ?? card.skinEdition?.skinName ?? card.cardEditionName ?? null,
        bonus: card.skinEdition?.bonus ?? null,
      });
    }
  });

  const readMissions = MissionsData.safeParse(missions);
  const missionList: ArcadeMission[] = (readMissions.success ? readMissions.data.currentUser?.setPlayTasks ?? [] : [])
    .filter((t) => t.id && (t.__typename === "DecisivePlayerPickerTask" || t.__typename === "ThresholdsStreakTask"))
    .map((t) => ({
      id: t.id as string,
      kind: t.__typename,
      title: t.title ?? null,
      description: t.description ?? null,
      state: t.aasmState ?? null,
      expired: Boolean(t.expired),
      rewards: (t.rewardConfigs ?? []).map(rewardLabel),
      picks: t.__typename === "DecisivePlayerPickerTask" ? (t.taskAppearances ?? []).length : null,
      maxPicks: t.maxAppearancesCount ?? null,
      progress: t.progress ?? null,
      target: t.target ?? null,
      stats: (t.decisiveStats ?? []).map((d) => d.name),
      start: t.startDate ?? null,
      picked: (t.taskAppearances ?? []).flatMap((a) => { const p = z.object({ anyPlayer: z.object({ slug: s }) }).safeParse(a); return p.success ? [p.data.anyPlayer.slug] : []; }),
      pickLocked: (t.taskAppearances ?? []).some((a) => z.object({ locked: z.literal(true) }).safeParse(a).success),
    }));

  return {
    set: { slug: set.slug, name: set.name, start: set.startDate ?? null, end: set.endDate ?? null, leagues: set.availableCompetitions.map((c) => ({ slug: c.slug, name: c.displayName })) },
    gems: user.gems.find((g) => g.currency === "COMMON_GEM")?.amount ?? null,
    essence: user.essence.find((e) => e.rarity === "common" && e.cardSet?.slug === set.slug)?.cardShardsCount ?? null,
    board: board ? { id: board.id, config: board.configSlug ?? null, title: board.title ?? null, end: board.endDate ?? null, current: steps.find((step) => step.id === board.myCurrentStep?.id)?.number ?? null, restartable: board.restartable ?? null, steps } : null,
    games: parseGames(gamePages),
    cards: cards.sort((a, b) => a.name.localeCompare(b.name)),
    otherSetCards,
    cardsCut,
    missions: missionList,
  };
}

export type ArcadeRead =
  | { state: "ok"; arcade: Arcade; unread: string[] }
  | { state: "no-extension" | "signed-out" | "no-tab" | "unreadable" | "no-set" }
  | { state: "outdated"; version: string }
  | { state: "failed"; detail: string };

const Answer = z.object({ ok: z.literal(true), state: s, data: z.unknown().optional(), errors: z.array(s).optional(), status: z.number().optional() });

/** One read of everything, from the open sorare.com tab. Each of Sorare's questions is asked once; cards page by page. */
export async function readArcade(timeoutMs = 25_000): Promise<ArcadeRead> {
  const extension = await pingExtension();
  if (!extension) return { state: "no-extension" };
  if (!extensionAtLeast(extension.version, ARCADE_EXTENSION_VERSION)) return { state: "outdated", version: extension.version };

  const ask = async (step: string, extra: Record<string, unknown> = {}) => {
    const answer = Answer.safeParse(await askExtension({ type: "sorare", step, ...extra }, timeoutMs));
    if (!answer.success) return { failed: "the extension did not answer" } as const;
    if (answer.data.state === "no-tab") return { failed: "no-tab" } as const;
    if (answer.data.state !== "ok") return { failed: [answer.data.state, answer.data.status, ...(answer.data.errors ?? [])].filter(Boolean).join(": ") } as const;
    return { data: answer.data.data } as const;
  };

  const main = await ask("arcade");
  if ("failed" in main) return main.failed === "no-tab" ? { state: "no-tab" } : { state: "failed", detail: `board: ${main.failed}` };
  const user = z.object({ currentUser: z.unknown() }).safeParse(main.data);
  if (user.success && user.data.currentUser === null) return { state: "signed-out" };
  const [lineups, missions] = await Promise.all([ask("arcade-lineups"), ask("arcade-missions")]);
  const me = z.object({ currentUser: z.object({ slug: s }) }).safeParse(main.data);
  const slug = me.success ? me.data.currentUser.slug : "";
  // Your cards: the first page and Sorare's count each visit; the rest is read again only when they changed (a pack opened).
  let pages: unknown[] = [];
  let after: string | null = null;
  for (let i = 0; i < MAX_CARD_PAGES; i++) {
    const page = await ask("arcade-cards", { after });
    if ("failed" in page) return { state: "failed", detail: `cards: ${page.failed}` };
    if (i === 0) {
      const kept = keptCards(readKeptCards(), slug, page.data);
      if (kept) { pages = kept; break; }
    }
    pages.push(page.data);
    const info = CardsPage.safeParse(page.data);
    if (!info.success || !info.data.currentUser) break;
    const { hasNextPage, endCursor } = info.data.currentUser.cards.pageInfo;
    if (!hasNextPage || !endCursor) { keepCards(slug, pages); break; }
    after = endCursor;
  }

  // The board's games, from now to the set's end (no end: a week).
  const end = z.object({ cardSet: z.object({ currentSet: z.object({ endDate: opt(s) }).nullable() }) }).safeParse(main.data);
  const until = (end.success && end.data.cardSet.currentSet?.endDate) || new Date(Date.now() + 7 * 86_400_000).toISOString();
  const gamePages: unknown[] = [];
  let gamesFailed: string | null = null;
  let cursor: string | null = null;
  for (let i = 0; i < MAX_GAME_PAGES; i++) {
    const page = await ask("arcade-games", { after: cursor, fromDate: new Date().toISOString(), toDate: until });
    if ("failed" in page) {
      gamesFailed = page.failed ?? "no answer";
      break;
    }
    gamePages.push(page.data);
    const info = GamesPage.safeParse(page.data);
    const more = info.success ? info.data.currentUser?.setBoard?.pickableGames?.pageInfo : null;
    if (!more?.hasNextPage || !more.endCursor) break;
    cursor = more.endCursor;
  }

  const arcade = parseArcade(main.data, "data" in lineups ? lineups.data : null, "data" in missions ? missions.data : null, pages, gamePages);
  // Between two sets Sorare names no current set (plans/set.md U2): say so, not "unreadable".
  const between = z.object({ cardSet: z.object({ currentSet: z.null() }) }).safeParse(main.data);
  if (!arcade) return { state: between.success ? "no-set" : "unreadable" };
  // A part Sorare refused is said, never shown as "none".
  const unread = [["your lineups", lineups], ["today's missions", missions]].flatMap(([label, part]) => (typeof part === "object" && "failed" in part ? [`${label} (${part.failed})`] : []));
  if (gamesFailed) unread.push(`the board's games (${gamesFailed})`);
  if (!extensionAtLeast(extension.version, ARCADE_MISSIONS_VERSION)) unread.push(`today's missions (need extension ${ARCADE_MISSIONS_VERSION}: reload it on chrome://extensions)`);
  return { state: "ok", arcade, unread: unread as string[] };
}

const LAST_KEY = "sofix-arcade-last";
/** The last full read, kept in this browser so the next visit shows it at once while Sorare is asked again. */
export type KeptArcade = { at: number; arcade: Arcade; unread: string[] };
/**
 * The kept read, also after its set has ended: between two sets the page still shows your last board, marked ended, instead of an
 * empty page (owner, 29 Oct 2026: "counter productive to block me from looking at the page"). A new set's read replaces it.
 */
export function usableArcade(kept: KeptArcade | null): KeptArcade | null {
  return kept?.arcade?.set && Number.isFinite(kept.at) ? kept : null;
}
/** Whether a board's set has ended. */
export const setEnded = (arcade: Arcade, now = Date.now()) => Date.parse(arcade.set.end ?? "") < now;
export function lastArcade(): KeptArcade | null {
  try { return usableArcade(JSON.parse(localStorage.getItem(LAST_KEY) ?? "null") as KeptArcade | null); } catch { return null; }
}
export function keepArcade(arcade: Arcade, unread: string[], now = Date.now()) {
  try { localStorage.setItem(LAST_KEY, JSON.stringify({ at: now, arcade, unread } satisfies KeptArcade)); } catch { /* full or blocked: read next time */ }
}

/** Two sets of start % readings, the newer reading of each player in each game. */
export function newerChances(a: ArcadeChances | null, b: ArcadeChances): ArcadeChances {
  const out: ArcadeChances = { ...(a ?? {}) };
  for (const [game, players] of Object.entries(b)) {
    const merged = { ...(out[game] ?? {}) };
    for (const [player, reading] of Object.entries(players)) if (!merged[player] || merged[player]![1] <= reading[1]) merged[player] = reading;
    out[game] = merged;
  }
  return out;
}

/** Sorare's start % as saved for these games: game id, then player slug, then [basis points, seen at in epoch seconds]. */
export type ArcadeChances = Record<string, Record<string, [number, number]>>;
const Saved = z.object({ chances: z.record(s, z.record(s, z.tuple([n, n]))) });

/** The saved readings of the board's games (one small read; `null` when the app could not answer). */
export async function loadArcadeChances(games: string[]): Promise<ArcadeChances | null> {
  if (!games.length) return {};
  try {
    const response = await fetch("/api/arcade/chances", { method: "POST", headers: { "content-type": "application/json", [REFRESH_HEADER]: "1" }, body: JSON.stringify({ games: games.slice(0, 300) }) });
    const parsed = Saved.safeParse(await response.json());
    return response.ok && parsed.success ? parsed.data.chances : null;
  } catch {
    return null;
  }
}

/** One card's start % in one game, as Sorare gave it; null when Sorare has not shown one. */
export function chanceOf(chances: ArcadeChances | null, game: string, player: string): { percent: number; seenAt: number } | null {
  const reading = chances?.[game]?.[player];
  return reading ? { percent: Math.round(reading[0] / 100), seenAt: reading[1] } : null;
}

export type ArcadeWalk = { state: string; players: number | null; games: number | null };

/** "Read Arcade's start %": the extension walks the board's compose page; a few minutes at most. */
export async function walkArcade(config: string, stepId: string): Promise<ArcadeWalk> {
  const step = stepId.replace(/^.*:/, "");
  const answer = z.object({ ok: z.literal(true), state: s, players: n.optional(), games: n.optional() })
    .safeParse(await askExtension({ type: "read-arcade", config, step }, 240_000));
  if (!answer.success) return { state: "no-answer", players: null, games: null };
  return { state: answer.data.state, players: answer.data.players ?? null, games: answer.data.games ?? null };
}

/** Start % without a tab: the extension that replays Sorare's own bench question (21 Oct 2026). */
export const ARCADE_BENCH_VERSION = "0.4.15";
const BENCH_PAGES = 2; // 30 cards a page, best first: the cards a plan would pick
const BENCH_KEEP_MS = 6 * 3_600_000; // Sorare's numbers are saved too; "Read start % again" asks sooner
const BenchAnswer = z.object({ ok: z.literal(true), state: s, data: z.object({ cards: n, after: s.nullable(), rows: z.array(z.object({ game: s, player: s, basisPoints: n })) }).optional() });
export type ArcadeBench = { state: "ok" | "outdated" | "no-extension" | "refused"; chances: ArcadeChances; at: number };

/**
 * Sorare's start % for your best cards in every game to the set's end, asked from your open Sorare tab with the question Sorare's own
 * compose page asks (no page opens). Day by day, each position, the best 60 cards. Kept 6 hours in this browser; Sorare's readings are
 * also saved by the extension like any page reading. "refused" means Sorare no longer knows the question: the tab walk still works.
 */
export async function readArcadeBench(stepId: string, until: string | null, force = false, now = Date.now()): Promise<ArcadeBench> {
  const key = `sofix-arcade-bench:${stepId}`;
  if (!force) {
    try {
      const kept = JSON.parse(localStorage.getItem(key) ?? "null") as ArcadeBench | null;
      if (kept && now - kept.at < BENCH_KEEP_MS) return kept;
    } catch { /* no storage: read */ }
  }
  const extension = await pingExtension();
  if (!extension) return { state: "no-extension", chances: {}, at: now };
  if (!extensionAtLeast(extension.version, ARCADE_BENCH_VERSION)) return { state: "outdated", chances: {}, at: now };
  const task = stepId.replace(/^.*:/, "");
  const end = Math.min(Date.parse(until ?? "") || now + 7 * 86_400_000, now + 7 * 86_400_000);
  const chances: ArcadeChances = {};
  let refused = 0;
  let asked = 0;
  for (let from = now; from < end; from += 86_400_000) {
    const span = { minDate: new Date(from).toISOString(), maxDate: new Date(Math.min(from + 86_400_000, end)).toISOString() };
    await Promise.all(["Goalkeeper", "Defender", "Midfielder", "Forward"].map(async (position) => {
      let after: string | null = null;
      for (let page = 0; page < BENCH_PAGES; page++) {
        asked += 1;
        const answer = BenchAnswer.safeParse(await askExtension({ type: "sorare", step: "arcade-bench", task, position, ...span, after }, 30_000));
        if (!answer.success || answer.data.state !== "ok" || !answer.data.data) {
          if (answer.success && answer.data.state === "rejected") refused += 1;
          return;
        }
        for (const row of answer.data.data.rows) (chances[row.game] ??= {})[row.player] = [row.basisPoints, Math.floor(now / 1000)]; // seconds, as saved
        after = answer.data.data.after;
        if (!after) return;
      }
    }));
  }
  const read: ArcadeBench = { state: refused && refused >= asked / 2 ? "refused" : "ok", chances, at: now };
  try { if (read.state === "ok") localStorage.setItem(key, JSON.stringify(read)); } catch { /* full or blocked: fine */ }
  return read;
}

/** Step 3's reads need the extension that asks Sorare for club bonuses, past scores and projections. */
export const ARCADE_PLAN_VERSION = "0.4.12";
/** Sorare publishes projections about two days ahead; asking further ahead returns nothing. */
const PROJECTION_DAYS = 3;
const EXTRAS_KEEP_MS = 6 * 3_600_000;
const MAX_PROJECTION_GAMES = 60;

/** What Sofix knows of a LaLiga player's next game (the Lineups numbers), keyed by Sorare slug. */
export type ArcadeLaLiga = Record<string, { kickoff: string | null; p: number | null; source: StartSource | null; sources: Partial<Record<StartSource, number>>; ffMatch?: { id: number; url: string }; /** Sofix's xScore if he plays. */ mu?: number | null; decisive?: number | null; xd?: number | null }>;
export type ArcadeExtras = {
  /** The club bonus Sorare gives a card of each club, by club slug (0.04 for +4%). */
  club: Record<string, number>;
  /** Each player's scores in his last games he played (minutes > 0), newest first. */
  past: Record<string, number[]>;
  /** Sorare's word on each player: tier, usual role, open injury (extension 0.4.18; absent before). */
  status?: Record<string, PlayerStatus>;
  /** Sorare's L5, L10 (last ten played) and L40 averages, by player (extension 0.4.20; absent before). */
  form?: Record<string, PlayerForm>;
  /** Sorare's projection by game, then player. A game asked that Sorare has not projected is an empty record. */
  projections: Record<string, Record<string, number>>;
  unread: string[];
};

const BonusAnswer = z.object({ currentUser: z.object({ setBoard: z.record(s, z.unknown()).nullable() }).nullable() });
const BonusList = z.array(z.object({ key: s, bonusBasisPoints: n }));
const PastAnswer = z.object({ players: z.array(z.object({ slug: s, playerGameScores: z.array(z.object({ score: n, anyPlayerGameStats: opt(z.object({ minsPlayed: opt(n) })) }).nullable()).nullish() })) });
const FormAnswer = z.object({ players: z.array(z.object({ slug: s, l5: opt(n), l10: opt(n), l40: opt(n) })) });
const ProjectionAnswer = z.object({ anyGame: z.object({ id: s, playerGameScores: z.array(z.object({ projection: opt(z.object({ score: n })), anyPlayer: z.object({ slug: s }) })) }).nullable() });

/** Sorare's answers to the three step-3 questions, as plain numbers (exported for the tests). */
export function parseBonuses(answer: unknown, cards: string[]): Record<string, number> {
  const parsed = BonusAnswer.safeParse(answer);
  const board = parsed.success ? parsed.data.currentUser?.setBoard : null;
  const out: Record<string, number> = {};
  cards.forEach((card, i) => {
    const list = BonusList.safeParse(board?.[`b${i}`]);
    if (list.success) out[card] = list.data.filter((b) => b.key === "collection").reduce((sum, b) => sum + b.bonusBasisPoints, 0) / 10_000;
  });
  return out;
}
const StatusAnswer = z.object({ players: z.array(z.object({ slug: s, gameplayTier: opt(s), playingStatus: opt(s), activeInjuries: opt(z.array(z.object({ active: opt(z.boolean()), expectedEndDate: opt(s) }))) })) });
/** Sorare's tier, usual role and open injury of each player asked; a player Sorare said nothing of is left out. */
export function parseStatus(answer: unknown): Record<string, PlayerStatus> {
  const parsed = StatusAnswer.safeParse(answer);
  if (!parsed.success) return {};
  return Object.fromEntries(parsed.data.players.filter((p) => p.gameplayTier !== undefined || p.playingStatus !== undefined).map((p) => {
    const open = (p.activeInjuries ?? []).filter((i) => i.active !== false);
    return [p.slug, { tier: p.gameplayTier ?? null, playing: p.playingStatus ?? null, injured: open.length > 0, back: open.map((i) => i.expectedEndDate ?? null).find(Boolean) ?? null }];
  }));
}
export type PlayerForm = { l5: number | null; l10: number | null; l40: number | null };

/** Sorare's L5, last-ten-played and L40 averages. A player with no average is kept, as unknown. */
export function parseForm(answer: unknown): Record<string, PlayerForm> {
  const parsed = FormAnswer.safeParse(answer);
  if (!parsed.success) return {};
  return Object.fromEntries(parsed.data.players.map((p) => [p.slug, { l5: p.l5 ?? null, l10: p.l10 ?? null, l40: p.l40 ?? null }]));
}
export function parsePast(answer: unknown): Record<string, number[]> {
  const parsed = PastAnswer.safeParse(answer);
  if (!parsed.success) return {};
  return Object.fromEntries(parsed.data.players.map((p) => [p.slug, (p.playerGameScores ?? []).flatMap((g) => (g && (g.anyPlayerGameStats?.minsPlayed ?? 0) > 0 ? [g.score] : []))]));
}
export function parseProjections(answer: unknown): Record<string, number> | null {
  const parsed = ProjectionAnswer.safeParse(answer);
  if (!parsed.success || !parsed.data.anyGame) return null;
  return Object.fromEntries(parsed.data.anyGame.playerGameScores.flatMap((r) => (r.projection ? [[r.anyPlayer.slug, r.projection.score]] : [])));
}

/** Club bonuses, past scores and the next days' projections, from your Sorare tab. Read once per visit, never polled. */
export async function readArcadeExtras(arcade: Arcade, now = new Date()): Promise<ArcadeExtras | null> {
  const extension = await pingExtension();
  if (!extension || !extensionAtLeast(extension.version, ARCADE_PLAN_VERSION)) return null;
  // About 100 questions to Sorare: kept 6 hours in this browser, so reloading the page does not ask them again (Sorare answered
  // 429 on 21 Oct after a few reads in a row).
  const key = `sofix-arcade-extras:2:${arcade.set.slug}`; // :2 adds L5/L10/L40, so a read saved before that is asked again
  try {
    const kept = JSON.parse(localStorage.getItem(key) ?? "null") as { at: number; extras: ArcadeExtras } | null;
    if (kept && now.getTime() - kept.at < EXTRAS_KEEP_MS && !kept.extras.unread.length) return kept.extras;
  } catch { /* no storage: read */ }
  let slowed = false;
  const ask = async (step: string, extra: Record<string, unknown>) => {
    if (slowed) return undefined;
    const answer = Answer.safeParse(await askExtension({ type: "sorare", step, ...extra }, 25_000));
    if (answer.success && answer.data.status === 429) slowed = true; // stop at once: Sorare asked to slow down
    return answer.success && answer.data.state === "ok" ? answer.data.data : undefined;
  };
  const unread: string[] = [];
  const chunks = <T,>(list: T[], size: number) => Array.from({ length: Math.ceil(list.length / size) }, (_, i) => list.slice(i * size, (i + 1) * size));

  // The club bonus is the club's (seen 21 Oct: every card of a club had the same), so one card per club is asked.
  const perClub = new Map<string, string>();
  for (const card of arcade.cards) if (card.teamSlug && !perClub.has(card.teamSlug)) perClub.set(card.teamSlug, card.slug);
  const club: Record<string, number> = {};
  for (const batch of chunks([...perClub.entries()], 50)) {
    const read = parseBonuses(await ask("arcade-bonuses", { cards: batch.map(([, c]) => c) }), batch.map(([, c]) => c));
    for (const [team, card] of batch) if (read[card] !== undefined) club[team] = read[card]!;
  }
  if (Object.keys(club).length < perClub.size) unread.push(`club bonus for ${perClub.size - Object.keys(club).length} clubs`);

  const past: Record<string, number[]> = {};
  const status: Record<string, PlayerStatus> = {};
  const form: Record<string, PlayerForm> = {};
  const players = [...new Set(arcade.cards.map((c) => c.player))];
  let pastMissing = 0;
  for (const batch of chunks(players, 50)) {
    const answer = await ask("arcade-past", { players: batch });
    Object.assign(status, parseStatus(answer));
    Object.assign(form, parseForm(answer));
    const read = parsePast(answer);
    pastMissing += batch.filter((p) => !read[p]).length;
    Object.assign(past, read);
  }
  if (pastMissing) unread.push(`past scores of ${pastMissing} players`);

  const projections: Record<string, Record<string, number>> = {};
  const horizon = now.getTime() + PROJECTION_DAYS * 86_400_000;
  const near = (arcade.games ?? []).filter((g) => Date.parse(g.kickoff) > now.getTime() && Date.parse(g.kickoff) < horizon
    && (perClub.has(g.home?.slug ?? "") || perClub.has(g.away?.slug ?? ""))).slice(0, MAX_PROJECTION_GAMES);
  for (const game of near) {
    const read = parseProjections(await ask("arcade-projections", { game: game.id }));
    if (read) projections[game.id] = read;
  }
  if (Object.keys(projections).length < near.length) unread.push(`projections of ${near.length - Object.keys(projections).length} games`);
  if (slowed) unread.unshift("Sorare asked Sofix to slow down, so read again in a few minutes");
  const extras = { club, past, status, form, projections, unread };
  try { localStorage.setItem(key, JSON.stringify({ at: now.getTime(), extras })); } catch { /* full or blocked: fine */ }
  return extras;
}

/**
 * A card's outlook in one game. An official eleven overrides every forecast. Otherwise start % uses Sofix's number (when its game is this one),
 * else Sorare's as saved. Score if he plays: Sofix's xScore for that game (each league's model passed its own check), else Sorare's
 * projection, else his own average of the games he played. Nothing is filled in where no source has a number.
 */
export function outlookOf(card: ArcadeCard, game: ArcadeGame, extras: ArcadeExtras | null, chances: ArcadeChances | null, laliga: ArcadeLaLiga, elevens: ArcadeChances | null = null): Outlook {
  const past = extras?.past[card.player] ?? [];
  const projection = extras?.projections[game.id]?.[card.player];
  const form = past.length ? past.reduce((a, b) => a + b, 0) / past.length : null;
  const sofix = laliga[`${card.player}:${Date.parse(game.kickoff)}`] ?? laliga[card.player];
  const sameGame = sofix && sofix.kickoff && Date.parse(sofix.kickoff) === Date.parse(game.kickoff);
  const saved = chanceOf(chances, game.id, card.player);
  const confirmed = chanceOf(elevens, game.id, card.player);
  const [start, startSource]: [number | null, StartSource | null] = confirmed ? [confirmed.percent / 100, "sorare"] : sameGame && sofix.p !== null && sofix.source
    ? [sofix.p, sofix.source]
    : saved ? [saved.percent / 100, "sorare"] : [null, null];
  const club = card.teamSlug ? extras?.club[card.teamSlug] ?? null : null;
  const xscore = sameGame && sofix.mu != null ? sofix.mu : null;
  return {
    card,
    game,
    score: xscore ?? projection ?? form,
    decisive: sameGame ? sofix.decisive ?? null : null,
    xd: sameGame ? sofix.xd ?? null : null,
    scoreSource: xscore !== null ? "sofix" : projection !== undefined ? "sorare" : form !== null ? "form" : null,
    start,
    startSource,
    confirmed: confirmed !== null,
    startUrl: sameGame && startSource === "futbolfantasy" ? sofix.ffMatch?.url ?? null : null,
    past,
    bonus: (card.bonus !== null && card.bonus > 1 ? card.bonus - 1 : 0) + (club ?? 0),
    club,
  };
}

/** Arcade step 5 reads the published pack odds through this extension. */
export const ARCADE_PACKS_VERSION = "0.4.14";
const PackOddsAnswer = z.object({ currentUser: z.object({ setBoard: z.object({ myCurrentStep: z.object({ cardPacks: z.array(z.record(s, z.unknown())).nullish() }).nullable() }).nullable() }).nullable() });
const SlotOdds = z.array(z.object({ playerOdds: z.array(z.object({ probabilityBasisPoint: n, player: z.object({ slug: s }) })) }));

/** Merges Sorare's answers (two slots each) into each pack's slots: player → chance. Exported for the tests. */
export function parsePackOdds(answers: unknown[]): PackOdds {
  const out: PackOdds = {};
  for (const answer of answers) {
    const parsed = PackOddsAnswer.safeParse(answer);
    for (const pack of (parsed.success ? parsed.data.currentUser?.setBoard?.myCurrentStep?.cardPacks : null) ?? []) {
      const slug = typeof pack.slug === "string" ? pack.slug : null;
      if (!slug) continue;
      for (const [key, value] of Object.entries(pack)) {
        const index = /^s(\d)$/.exec(key)?.[1];
        const tiers = SlotOdds.safeParse(value);
        if (index === undefined || !tiers.success || !tiers.data.length) continue;
        const slot: Record<string, number> = {};
        for (const tier of tiers.data) for (const o of tier.playerOdds) slot[o.player.slug] = (slot[o.player.slug] ?? 0) + o.probabilityBasisPoint / 10_000;
        (out[slug] ??= [])[Number(index)] = slot;
      }
    }
  }
  for (const slug of Object.keys(out)) out[slug] = out[slug]!.filter(Boolean);
  return out;
}

/** Pack odds with each slot's tiers and each player's club (Icon and Star chances, mission maths): extension 0.4.18. */
export const ARCADE_TIERS_VERSION = "0.4.18";

/** "Work out the packs": the current step's packs' odds, a few large answers (about 2 MB each), on a click only. */
export async function readPackOdds(slots: number): Promise<{ odds: PackOdds; tiers: TierOdds } | "outdated" | null> {
  const extension = await pingExtension();
  if (!extension) return null;
  if (!extensionAtLeast(extension.version, ARCADE_PACKS_VERSION)) return "outdated";
  const answers: unknown[] = [];
  for (let i = 0; i < Math.min(slots, 10); i += 2) {
    const answer = Answer.safeParse(await askExtension({ type: "sorare", step: "arcade-pack-odds", slots: i + 1 < slots ? [i, i + 1] : [i] }, 60_000));
    if (!answer.success || answer.data.state !== "ok") break;
    answers.push(answer.data.data);
  }
  return answers.length ? { odds: parsePackOdds(answers), tiers: parseTierOdds(answers) } : null;
}

/** A collection mission: what it counts (players, clubs or leagues; none named means any card of the set) and how far you are. */
export type ArcadeCollection = { id: string; kind: string; title: string; description: string; progress: number; target: number; expired: boolean; done: boolean; rewards: string[]; players: string[]; teams: { slug: string; name: string }[]; leagues: string[] };
const CollectTask = z.object({
  __typename: s, id: s, title: opt(s), description: opt(s), progress: opt(n), target: opt(n), expired: opt(z.boolean()), aasmState: opt(s),
  rewardConfigs: opt(z.array(Reward)), players: opt(z.array(z.object({ slug: s }))), specifiedTeams: opt(z.array(z.object({ slug: opt(s), name: opt(s) }))), competitions: opt(z.array(z.object({ slug: s }))),
});
const CollectionAnswer = z.object({ currentUser: z.object({ tracks: opt(z.array(z.unknown())), setBoard: opt(z.object({ myCollectionTasks: opt(z.array(z.unknown())) })) }).nullable() });

/** Sorare's collection missions, each once, open ones first. */
export function parseCollection(answer: unknown): ArcadeCollection[] {
  const parsed = CollectionAnswer.safeParse(answer);
  if (!parsed.success || !parsed.data.currentUser) return [];
  const all = [...(parsed.data.currentUser.tracks ?? []), ...(parsed.data.currentUser.setBoard?.myCollectionTasks ?? [])];
  const out = new Map<string, ArcadeCollection>();
  for (const raw of all) {
    const t = CollectTask.safeParse(raw);
    if (!t.success || out.has(t.data.id) || t.data.target == null) continue;
    out.set(t.data.id, {
      id: t.data.id, kind: t.data.__typename, title: t.data.title ?? t.data.__typename, description: t.data.description ?? "", progress: t.data.progress ?? 0, target: t.data.target,
      expired: Boolean(t.data.expired), done: (t.data.progress ?? 0) >= t.data.target || /claim|complete/i.test(t.data.aasmState ?? ""), rewards: (t.data.rewardConfigs ?? []).map(rewardLabel),
      players: (t.data.players ?? []).map((p) => p.slug), teams: (t.data.specifiedTeams ?? []).flatMap((x) => (x.slug ? [{ slug: x.slug, name: x.name ?? x.slug }] : [])), leagues: (t.data.competitions ?? []).map((c) => c.slug),
    });
  }
  return [...out.values()].sort((a, b) => Number(a.done || a.expired) - Number(b.done || b.expired));
}

/** Your collection missions, from your Sorare tab (one question). Null when the extension is older or Sorare did not answer. */
export async function readArcadeCollection(): Promise<ArcadeCollection[] | "outdated" | null> {
  const extension = await pingExtension();
  if (!extension) return null;
  if (!extensionAtLeast(extension.version, ARCADE_TIERS_VERSION)) return "outdated";
  const answer = Answer.safeParse(await askExtension({ type: "sorare", step: "arcade-collection" }, 25_000));
  return answer.success && answer.data.state === "ok" ? parseCollection(answer.data.data) : null;
}

/** Live: your lineups again, from your Sorare tab (one small question). Null when Sorare did not answer. */
export async function readArcadeLineups(): Promise<Map<string, ArcadeLineup[]> | null> {
  const answer = Answer.safeParse(await askExtension({ type: "sorare", step: "arcade-lineups" }, 25_000));
  return answer.success && answer.data.state === "ok" ? parseLineups(answer.data.data) : null;
}

export type DecisiveGame = { mins: number; stats: string[] | null; date?: string; started?: boolean | null };
const DecisiveScore = z.object({
  scoreStatus: opt(s), anyGame: opt(z.object({ date: s })),
  anyPlayerGameStats: opt(z.object({ minsPlayed: opt(n), gameStarted: opt(z.union([z.boolean(), n])) })), detailedScore: opt(z.array(z.object({ stat: s, statValue: n }))),
}).nullable();
const DecisiveAnswer = z.object({ players: z.array(z.object({ slug: s, playerGameScores: z.array(DecisiveScore).nullish(), allPlayerGameScores: z.object({ nodes: z.array(DecisiveScore), pageInfo: z.object({ hasNextPage: z.boolean(), endCursor: s.nullable() }).optional() }).nullish() })) });

function decisiveResponse(answer: unknown) {
  const root = answer && typeof answer === "object" ? answer as Record<string, unknown> : {};
  return DecisiveAnswer.safeParse(Array.isArray(root.players) ? root : { players: Object.values(root).filter((v) => v && typeof v === "object" && "slug" in v) });
}

/** Unknown detailed stats stay unknown, rather than becoming a failed target. */
export function parseDecisive(answer: unknown): Record<string, DecisiveGame[]> {
  const parsed = decisiveResponse(answer);
  if (!parsed.success) return {};
  return Object.fromEntries(parsed.data.players.map((p) => [p.slug, (p.allPlayerGameScores?.nodes ?? p.playerGameScores ?? []).flatMap((g) => (g && (!g.scoreStatus || g.scoreStatus === "FINAL") ? [{
    mins: g.anyPlayerGameStats?.minsPlayed ?? 0, date: g.anyGame?.date,
    started: g.anyPlayerGameStats?.gameStarted == null ? null : Boolean(g.anyPlayerGameStats.gameStarted),
    stats: g.detailedScore == null ? null : g.detailedScore.filter((d) => d.statValue > 0).map((d) => d.stat),
  }] : []))]));
}

/** Shared, cached history: queued named-player requests, with pagination until forty appearances or source exhaustion. */
export async function readDecisive(players: string[], before = new Date().toISOString(), signal?: AbortSignal, progress?: (rows: Record<string, DecisiveGame[]>, done: number, total: number) => void): Promise<Record<string, DecisiveGame[]> | null> {
  const key = `sofix-mission-history-v3:${before}:${[...players].sort().join(",")}`;
  try {
    const kept = JSON.parse(localStorage.getItem(key) ?? "null") as { at: number; rows: Record<string, DecisiveGame[]> } | null;
    if (kept && Date.now() - kept.at < 6 * 3_600_000) return kept.rows;
  } catch { /* Browser storage is optional. */ }
  const extension = await pingExtension();
  if (!extension || !extensionAtLeast(extension.version, "0.4.17")) return null;
  const out: Record<string, DecisiveGame[]> = {};
  const after: Record<string, string> = {};
  const pending: string[] = [];
  let done = 0;
  const playerKey = (player: string) => `sofix-mission-player-v1:${before}:${player}`;
  for (const player of players) {
    try {
      const kept = JSON.parse(localStorage.getItem(playerKey(player)) ?? "null") as { at: number; rows: DecisiveGame[]; cursor?: string; complete: boolean } | null;
      if (kept && Date.now() - kept.at < 6 * 3_600_000) {
        out[player] = kept.rows;
        if (kept.complete) { done += 1; continue; }
        if (kept.cursor) after[player] = kept.cursor;
      }
    } catch { /* Optional cache. */ }
    pending.push(player);
  }
  progress?.({ ...out }, done, players.length);
  while (pending.length) {
    if (signal?.aborted) return null;
    const batch = pending.splice(0, 1);
    if (typeof document !== "undefined") await new Promise((done) => setTimeout(done, 350));
    if (signal?.aborted) return null;
    const answer = Answer.safeParse(await askExtension({ type: "sorare", step: "arcade-decisive", players: batch, before, after }, 25_000));
    if (!answer.success || answer.data.state !== "ok") return null;
    const parsed = decisiveResponse(answer.data.data);
    if (!parsed.success || batch.some((p) => !parsed.data.players.some((r) => r.slug === p))) return null;
    const rows = parseDecisive(answer.data.data);
    for (const p of batch) {
      out[p] = [...out[p] ?? [], ...rows[p] ?? []];
      const page = parsed.data.players.find((r) => r.slug === p)?.allPlayerGameScores?.pageInfo;
      if (out[p].filter((g) => g.mins > 0).length < 40 && page?.hasNextPage) {
        if (!page.endCursor || after[p] === page.endCursor) return null;
        after[p] = page.endCursor;
        pending.push(p);
      } else { done += 1; }
      try {
        localStorage.setItem(playerKey(p), JSON.stringify({ at: Date.now(), rows: out[p], cursor: after[p], complete: !pending.includes(p) }));
      } catch { /* A full cache never stops the read. */ }
    }
    progress?.({ ...out }, done, players.length);
  }
  try { localStorage.setItem(key, JSON.stringify({ at: Date.now(), rows: out })); } catch { /* Storage unavailable. */ }
  return out;
}
