import { z } from "zod";
import { EXTENSION_ID, extensionAtLeast, pingExtension } from "./extension";
import { cashLabel, essenceLabel, spanLabel, timeUntil } from "./play";
import { BoardMetadata, scoringRules, type EnteredScoring } from "./lineupMetadata";

export type EnteredCard = {
  slug: string;
  name: string;
  picture: string | null;
  rarity: string | null;
  /** What he scored for this lineup, once Sorare has scored him. */
  score: number | null;
  captain: boolean;
  index?: number;
  player?: string | null;
  positions?: string[];
  level?: number;
  inSeason?: boolean;
  average?: number | null;
  club?: string | null;
};
/** What Sorare says a lineup made: its score, where it ranked, and what it was paid. Rank and rewards come after the games. */
export type LineupResult = { score: number; rank: number | null; cash: number; essence: number; card: boolean; xp?: number };
export type GameweekLineup = {
  id: string;
  name: string | null;
  draft: boolean;
  confirmable: boolean;
  board: string | null;
  competition: string;
  result: LineupResult | null;
  cards: EnteredCard[];
  scoring?: EnteredScoring;
  /** A Pro lineup: the step it plays for and the score that step needs. */
  pro?: { level: number; target: number; state?: string };
};

type FailureState = "no-extension" | "no-tab" | "no-bridge" | "signed-out" | "timeout" | "error";
export type WeekLineupsAnswer =
  | { state: "ok"; lineups: GameweekLineup[]; proNote?: string }
  | { state: "rejected"; errors: string[] }
  | { state: "outdated"; version: string }
  | { state: FailureState };

const AppearanceSchema = z.object({
  anyCard: z.object({ slug: z.string(), inSeasonEligible: z.boolean().optional(), anyTeam: z.object({ name: z.string() }).nullish() }).nullable().optional(),
  // Compatibility with a response from the previous bridge while an already-open tab is being upgraded.
  card: z.object({ slug: z.string() }).nullable().optional(),
  pictureUrl: z.string().nullable().optional(),
  player: z.object({ displayName: z.string(), slug: z.string().optional() }).nullable().optional(),
  index: z.number().int().nullish(),
  grade: z.number().int().nullish(),
  positions: z.array(z.string()).nullish(),
  averageScore: z.number().nullable().optional(),
  rarity: z.string().nullable().optional(),
  // Absent from an extension older than 0.2.2, which did not ask for them.
  score: z.number().nullable().optional(),
  captain: z.boolean().nullable().optional(),
});

const RewardConfigSchema = z.object({
  __typename: z.string().optional(),
  // a number (InGameCurrencyRewardConfig: XP) or an object (MonetaryRewardConfig: cents)
  amount: z.union([z.number(), z.object({ usdCents: z.number().nullable().optional() })]).nullable().optional(),
  currency: z.string().nullable().optional(),
  rarity: z.string().nullable().optional(),
  quantity: z.number().nullable().optional(),
});

const RankingSchema = z.object({
  ranking: z.number().nullable().optional(),
  score: z.number().nullable().optional(),
  so5Leaderboard: z.object({ slug: z.string() }).nullable().optional(),
  so5Rewards: z
    .array(z.object({ rewardConfigs: z.array(RewardConfigSchema).nullable().optional() }))
    .nullable()
    .optional(),
});

const LineupSchema = z.object({
  id: z.string(),
  name: z.string().nullable().default(null),
  draft: z.boolean(),
  confirmable: z.boolean().default(false),
  so5Leaderboard: z.object({ slug: z.string(), displayName: z.string(), ...BoardMetadata }).nullable().optional(),
  // Sorare answers null rather than [] for some lineups (one not yet ranked): read as none, never as a broken answer.
  so5Rankings: z.array(RankingSchema).nullish().transform((rows) => rows ?? []),
  so5Appearances: z.array(AppearanceSchema).nullish().transform((rows) => rows ?? []),
});

type Lineup = z.infer<typeof LineupSchema>;

/**
 * What Sorare says the lineup made, from the ranking of the competition it is in: the score, the rank once there is
 * one, and what was paid. Money is what Sorare paid in dollars, essence only the Limited kind (as the plans count it),
 * and a card is a card reward of any kind. Null when Sorare has not ranked the lineup.
 */
function resultOf(lineup: Lineup): LineupResult | null {
  const board = lineup.so5Leaderboard?.slug;
  const ranking = lineup.so5Rankings.find((r) => r.so5Leaderboard?.slug === board) ?? lineup.so5Rankings[0];
  if (!ranking || typeof ranking.score !== "number") return null;
  const result: LineupResult = { score: ranking.score, rank: ranking.ranking ?? null, cash: 0, essence: 0, card: false };
  for (const reward of ranking.so5Rewards ?? []) {
    for (const config of reward.rewardConfigs ?? []) {
      const amount = config.amount;
      if (config.__typename === "MonetaryRewardConfig" && typeof amount === "object") result.cash += (amount?.usdCents ?? 0) / 100;
      else if (config.__typename === "InGameCurrencyRewardConfig" && typeof amount === "number" && config.currency?.endsWith("_XP")) result.xp = (result.xp ?? 0) + amount;
      else if (config.__typename === "CardShardRewardConfig" && config.rarity === "limited") result.essence += config.quantity ?? 0;
      else if (config.__typename === "CardRewardConfig") result.card = true;
    }
  }
  return result;
}

const ReplySchema = z.discriminatedUnion("state", [
  z.object({
    state: z.literal("ok"),
    data: z
      .object({
        so5: z
          .object({ so5Fixture: z.object({
            startDate: z.string().optional(), endDate: z.string().optional(),
            mySo5Lineups: z.array(LineupSchema).nullish().transform((rows) => rows ?? []),
          }).nullable() })
          .nullish(),
      })
      .nullable(),
  }),
  z.object({ state: z.literal("rejected"), errors: z.array(z.string()) }),
  z.object({ state: z.enum(["no-tab", "no-bridge", "signed-out", "refused", "unknown", "timeout", "error"]) }),
]);

const ProReplySchema = z.object({
  state: z.literal("ok"),
  data: z.object({ currentUser: z.object({ boards: z.array(z.object({
    title: z.string().nullish(),
    configSlug: z.string().nullish(),
    so5Competition: z.object({ displayName: z.string() }).nullish(),
    steps: z.array(z.object({
      __typename: z.string(), level: z.number(), target: z.number(),
      myLineups: z.array(z.unknown()),
    })),
  })) }) }),
});
// A Pro lineup as Sorare keeps it: a task lineup, whose cards each carry their own game.
const TaskLineupSchema = z.object({
  __typename: z.literal("TaskLineup"),
  id: z.string(),
  draft: z.boolean(),
  confirmable: z.boolean().default(false),
  aasmState: z.string(),
  score: z.number().nullish(),
  taskAppearances: z.array(z.object({
    index: z.number().int().nullish(),
    captain: z.boolean().nullish(),
    rarity: z.string().nullish(),
    positions: z.array(z.string()).nullish(),
    score: z.number().nullish(),
    pictureUrl: z.string().nullish(),
    averageScore: z.number().nullish(),
    anyCard: z.object({ slug: z.string(), inSeasonEligible: z.boolean().optional(), anyTeam: z.object({ name: z.string() }).nullish() }).nullish(),
    player: z.object({ slug: z.string(), displayName: z.string() }).nullish(),
    game: z.object({ date: z.string() }).nullish(),
  })),
});
// read one by one: a lineup that is not a plain one (Sorare answers {}) or reads oddly is left out, not the whole list
const ProLineupSchema = LineupSchema.extend({ so5Fixture: z.object({ startDate: z.string() }) });

/** Why no Pro lineup shows, in a sentence, from the extension's answer. */
function proUnread(response: unknown): string {
  const state = (response as { state?: unknown } | null)?.state;
  if (response == null) return "Pro lineups need the Sofix extension 0.3.18: press Reload in chrome://extensions.";
  if (state === "refused" || state === "unknown") return "Pro lineups not read: reload your sorare.com tab once.";
  const errors = (response as { errors?: unknown }).errors;
  if (state === "rejected" && Array.isArray(errors) && errors.length) return `Pro lineups not read: Sorare says "${String(errors[0]).slice(0, 160)}".`;
  return "Pro lineups could not be read this time.";
}

/**
 * Your Pro lineups whose matchday starts inside the gameweek [start, end): Pro plays per league matchday, outside the gameweek's
 * own fixture. A failed read never hides the gameweek's other lineups; `note` says why none shows.
 */
export function readProLineups(response: unknown, start: string, end: string): { lineups: GameweekLineup[]; note: string | null } {
  const parsed = ProReplySchema.safeParse(response);
  if (!parsed.success) return { lineups: [], note: proUnread(response) };
  const from = Date.parse(start);
  const to = Date.parse(end);
  let found = 0;
  const boards = parsed.data.data.currentUser.boards.filter((board) => board.steps.some((step) => step.__typename === "CareerProStep"));
  const lineups = boards.flatMap((board): GameweekLineup[] => {
    const name = board.so5Competition?.displayName ?? board.title ?? "Pro";
    const competition = /\bpro\b/i.test(name) ? name : `Pro · ${name}`;
    return board.steps.filter((step) => step.__typename === "CareerProStep").flatMap((step) => step.myLineups.flatMap((raw): GameweekLineup[] => {
      const pro = { level: step.level, target: step.target };
      const task = TaskLineupSchema.safeParse(raw);
      if (task.success) {
        found += 1;
        const lineup = task.data;
        const dates = lineup.taskAppearances.flatMap((a) => (a.game ? [Date.parse(a.game.date)] : [])).filter(Number.isFinite);
        const at = dates.length ? Math.min(...dates) : NaN;
        if (!(at >= from && at < to)) return [];
        const scored = typeof lineup.score === "number" && (lineup.score > 0 || ["SUCCESSFUL", "FAILED"].includes(lineup.aasmState));
        return [{
          id: lineup.id, name: null, draft: lineup.draft, confirmable: lineup.confirmable, board: board.configSlug ?? null, competition,
          result: scored ? { score: lineup.score!, rank: null, cash: 0, essence: 0, card: false } : null,
          pro: { ...pro, state: lineup.aasmState },
          cards: lineup.taskAppearances.flatMap((a) => a.anyCard ? [{
            slug: a.anyCard.slug, name: a.player?.displayName ?? a.anyCard.slug, picture: a.pictureUrl ?? null, rarity: a.rarity ?? null,
            score: a.score ?? null, captain: a.captain === true,
            ...(a.index != null ? { index: a.index, player: a.player?.slug, positions: a.positions ?? undefined, average: a.averageScore,
              inSeason: a.anyCard.inSeasonEligible, club: a.anyCard.anyTeam?.name ?? null } : {}),
          }] : []),
        }];
      }
      const read = ProLineupSchema.safeParse(raw);
      if (!read.success) return [];
      found += 1;
      const at = Date.parse(read.data.so5Fixture.startDate);
      if (!(at >= from && at < to)) return [];
      return [{ ...toLineup(read.data), competition, pro }];
    }));
  });
  const names = boards.map((board) => board.so5Competition?.displayName ?? board.title ?? "Pro").join(", ");
  const note = lineups.length ? null
    : found ? `No Pro lineup in this GW (${found} on your Pro boards in other weeks).`
    : boards.length ? `No Pro lineup on your Pro boards (${names}).` : "Sorare lists no Pro board for you.";
  return { lineups, note };
}

function toLineup(lineup: Lineup): GameweekLineup {
  return {
    id: lineup.id,
    name: lineup.name,
    draft: lineup.draft,
    confirmable: lineup.confirmable,
    board: lineup.so5Leaderboard?.slug ?? null,
    competition: lineup.so5Leaderboard?.displayName ?? "Sorare competition",
    result: resultOf(lineup),
    ...(scoringRules(lineup.so5Leaderboard) ? { scoring: scoringRules(lineup.so5Leaderboard) } : {}),
    cards: lineup.so5Appearances.flatMap((appearance) => {
      const slug = (appearance.anyCard ?? appearance.card)?.slug;
      if (!slug) return [];
      return [
        {
          slug,
          name: appearance.player?.displayName ?? slug,
          picture: appearance.pictureUrl ?? null,
          rarity: appearance.rarity ?? null,
          score: appearance.score ?? null,
          captain: appearance.captain === true,
          ...(appearance.index != null ? {
            index: appearance.index, player: appearance.player?.slug,
            level: appearance.grade ?? undefined, positions: appearance.positions ?? undefined,
            average: appearance.averageScore, inSeason: appearance.anyCard?.inSeasonEligible,
            club: appearance.anyCard?.anyTeam?.name ?? null,
          } : {}),
        },
      ];
    }),
  };
}

/** Turn the gameweek-level response into the small, display-only shape the UI needs. */
export function readWeekLineups(response: unknown): WeekLineupsAnswer & { span?: { start: string; end: string } } {
  const parsed = ReplySchema.safeParse(response);
  if (!parsed.success) return { state: "error" };
  const reply = parsed.data;
  if (reply.state === "rejected") return { state: "rejected", errors: reply.errors };
  if (reply.state !== "ok") {
    if (reply.state === "unknown") return { state: "no-bridge" };
    if (reply.state === "refused") return { state: "error" };
    return { state: reply.state };
  }

  // A null fixture/list is an unreadable week, not evidence of zero entries. Only [] confirms an empty week.
  const original = response as { data?: { so5?: { so5Fixture?: { mySo5Lineups?: unknown } } } };
  if (!Array.isArray(original.data?.so5?.so5Fixture?.mySo5Lineups)) return { state: "error" };
  const fixture = reply.data!.so5!.so5Fixture!;
  return { state: "ok", lineups: fixture.mySo5Lineups.map(toLineup), ...(fixture.startDate && fixture.endDate ? { span: { start: fixture.startDate, end: fixture.endDate } } : {}) };
}

/** "Step 3 · needs 280", and "cleared" once Sorare's score reaches it. */
export function proLine(pro: { level: number; target: number; state?: string }, score: number | null): string {
  const cleared = pro.state === "SUCCESSFUL" || (pro.state !== "FAILED" && score !== null && score >= pro.target);
  return `Step ${pro.level} · needs ${pro.target}${cleared ? " · cleared" : pro.state === "FAILED" ? " · missed" : ""}`;
}

/**
 * What a lineup says while there is nothing to score yet: "Locks in 2 d 3 h" before the lock (the 0 under every card is not a
 * result), "Not started" after the lock until a card has scored. Null once a card has scored, and for a draft.
 */
/** What a week's entered lineups won (drafts left out), and whether that is final: every lineup ranked, so it will never change. */
export type WeekWon = { essence: number; cash: number; lineups: number; final: boolean };

export function weekWon(lineups: GameweekLineup[]): WeekWon {
  const entered = lineups.filter((lineup) => !lineup.draft);
  return {
    essence: entered.reduce((sum, lineup) => sum + (lineup.result?.essence ?? 0), 0),
    cash: Math.round(entered.reduce((sum, lineup) => sum + (lineup.result?.cash ?? 0), 0) * 100) / 100,
    lineups: entered.length,
    // a Pro lineup plays for a target, not a rank: it never holds the week open
    final: entered.every((lineup) => lineup.pro || (lineup.result !== null && lineup.result.rank !== null)),
  };
}

export function pendingLine(lineup: GameweekLineup, lock: string | undefined, now: Date): string | null {
  if (lineup.draft) return null;
  const scored = (lineup.result?.score ?? 0) > 0 || lineup.cards.some((card) => (card.score ?? 0) > 0) || (lineup.result?.rank ?? null) !== null;
  if (scored) return null;
  const left = lock ? timeUntil(lock, now) : null;
  return left && !left.past ? `Locks in ${spanLabel(left)}` : "Not started";
}

/** "Rank 1,204 · $2.50 · 250 essence · a card": where it ranked and what it was paid. Before it has a rank, it is still scoring. */
export function resultLine(result: LineupResult): string {
  if (result.rank === null) return "Still scoring";
  const paid = [
    result.cash ? cashLabel(result.cash) : null,
    result.essence ? `${essenceLabel(result.essence)} essence` : null,
    result.card ? "a card" : null,
    result.xp ? `${result.xp.toLocaleString("en-GB")} XP` : null,
  ].filter((part): part is string => part !== null);
  return [`Rank ${result.rank.toLocaleString("en-GB")}`, paid.length ? paid.join(" · ") : "no reward paid"].join(" · ");
}

type ChromeRuntime = {
  sendMessage?: (id: string, message: unknown, reply: (response: unknown) => void) => void;
  lastError?: unknown;
};

/** Read every lineup belonging to one exact Sorare fixture. This never writes to Sorare. */
export async function runWeekLineups(slug: string, timeoutMs = 25_000): Promise<WeekLineupsAnswer> {
  const extension = await pingExtension(Math.min(1500, timeoutMs));
  if (!extension) return { state: "no-extension" };
  if (!extensionAtLeast(extension.version)) return { state: "outdated", version: extension.version };

  const runtime = (globalThis as { chrome?: { runtime?: ChromeRuntime } }).chrome?.runtime;
  const send = runtime?.sendMessage;
  if (!runtime || !send) return { state: "no-extension" };
  const ask = (message: unknown) => new Promise<unknown>((resolve) => {
    let done = false;
    const finish = (response: unknown) => {
      if (done) return;
      done = true;
      resolve(response);
    };
    const timer = setTimeout(() => finish({ state: "timeout" }), timeoutMs);
    try {
      send.call(runtime, EXTENSION_ID, message, (response) => {
        clearTimeout(timer);
        void runtime.lastError;
        finish(response === undefined ? { state: "no-extension" } : response);
      });
    } catch {
      clearTimeout(timer);
      finish({ state: "no-extension" });
    }
  });
  const response = await ask({ type: "sorare", step: "week-entered", slug });
  const { span, ...answer } = readWeekLineups(response);
  if (answer.state !== "ok" || !span) return answer;
  // Pro is a separate read; an extension without it, or a refusal, leaves the gameweek's own lineups as they are.
  const pro = readProLineups(await ask({ type: "sorare", step: "pro-entered" }), span.start, span.end);
  return { state: "ok", lineups: [...answer.lineups, ...pro.lineups], ...(pro.note ? { proNote: pro.note } : {}) };
}
