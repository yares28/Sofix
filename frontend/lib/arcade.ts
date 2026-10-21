import { z } from "zod";
import { askExtension, extensionAtLeast, pingExtension } from "./extension";
import { REFRESH_HEADER } from "./refresh";

/**
 * Arcade, step 1 (plans/set.md): your set board, common cards, gems, essence and common missions, read from your signed-in
 * Sorare tab through the extension. Read only, on demand, never polled and never saved: nothing here touches the database.
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
export type ArcadeAppearance = { slug: string | null; player: string | null; name: string | null; captain: boolean; score: number | null; locked: boolean; kickoff: string | null };
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
};
/** A game the set board can be played on (`CareerBoard.pickableGames`). */
export type ArcadeGame = {
  id: string;
  kickoff: string;
  status: string;
  competition: { slug: string; name: string };
  home: { slug: string; name: string } | null;
  away: { slug: string; name: string } | null;
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
  game: opt(z.object({ date: opt(s) })),
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

const MissionsData = z.object({
  currentUser: z.object({
    taskGroup: z.object({
      myTasks: z.array(z.object({
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
      })),
    }).nullable(),
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
    }),
  }).nullable(),
});
type CardsPage = z.infer<typeof CardsPage>;

/** Sorare's edition multiplier as a bonus: 1.05 → "+5%". Standard (1) and unknown give null. */
export const bonusLabel = (bonus: number | null) => (bonus !== null && bonus > 1 ? `+${Math.round((bonus - 1) * 100)}%` : null);

const Team = z.object({ slug: s, name: s }).nullish();
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
        home: game.homeTeam ? { slug: game.homeTeam.slug, name: game.homeTeam.name } : null,
        away: game.awayTeam ? { slug: game.awayTeam.slug, name: game.awayTeam.name } : null,
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

/** Sorare's four answers turned into one model. Null when the main read is not usable (signed out, or a shape we do not know). */
export function parseArcade(arcade: unknown, lineups: unknown, missions: unknown, cardPages: unknown[], gamePages: unknown[] = []): Arcade | null {
  const main = ArcadeData.safeParse(arcade);
  if (!main.success || !main.data.currentUser || !main.data.cardSet.currentSet) return null;
  const set = main.data.cardSet.currentSet;
  const user = main.data.currentUser;

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
      })),
    })));
  }

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
  const missionList: ArcadeMission[] = (readMissions.success ? readMissions.data.currentUser?.taskGroup?.myTasks ?? [] : [])
    .filter((t) => t.id)
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
  | { state: "no-extension" | "signed-out" | "no-tab" | "unreadable" }
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
  const pages: unknown[] = [];
  let after: string | null = null;
  for (let i = 0; i < MAX_CARD_PAGES; i++) {
    const page = await ask("arcade-cards", { after });
    if ("failed" in page) return { state: "failed", detail: `cards: ${page.failed}` };
    pages.push(page.data);
    const info = CardsPage.safeParse(page.data);
    if (!info.success || !info.data.currentUser) break;
    const { hasNextPage, endCursor } = info.data.currentUser.cards.pageInfo;
    if (!hasNextPage || !endCursor) break;
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
  if (!arcade) return { state: "unreadable" };
  // A part Sorare refused is said, never shown as "none".
  const unread = [["your lineups", lineups], ["today's missions", missions]].flatMap(([label, part]) => (typeof part === "object" && "failed" in part ? [`${label} (${part.failed})`] : []));
  if (gamesFailed) unread.push(`the board's games (${gamesFailed})`);
  return { state: "ok", arcade, unread: unread as string[] };
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
