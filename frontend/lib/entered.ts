import { z } from "zod";
import { EXTENSION_ID, extensionAtLeast, pingExtension } from "./extension";
import { cashLabel, essenceLabel } from "./play";

export type EnteredCard = {
  slug: string;
  name: string;
  picture: string | null;
  rarity: string | null;
  /** What he scored for this lineup, once Sorare has scored him. */
  score: number | null;
  captain: boolean;
};
/** What Sorare says a lineup made: its score, where it ranked, and what it was paid. Rank and rewards come after the games. */
export type LineupResult = { score: number; rank: number | null; cash: number; essence: number; card: boolean };
export type GameweekLineup = {
  id: string;
  name: string | null;
  draft: boolean;
  confirmable: boolean;
  board: string | null;
  competition: string;
  result: LineupResult | null;
  cards: EnteredCard[];
};

type FailureState = "no-extension" | "no-tab" | "no-bridge" | "signed-out" | "timeout" | "error";
export type WeekLineupsAnswer =
  | { state: "ok"; lineups: GameweekLineup[] }
  | { state: "rejected"; errors: string[] }
  | { state: "outdated"; version: string }
  | { state: FailureState };

const AppearanceSchema = z.object({
  anyCard: z.object({ slug: z.string() }).nullable().optional(),
  // Compatibility with a response from the previous bridge while an already-open tab is being upgraded.
  card: z.object({ slug: z.string() }).nullable().optional(),
  pictureUrl: z.string().nullable().optional(),
  player: z.object({ displayName: z.string() }).nullable().optional(),
  rarity: z.string().nullable().optional(),
  // Absent from an extension older than 0.2.2, which did not ask for them.
  score: z.number().nullable().optional(),
  captain: z.boolean().nullable().optional(),
});

const RewardConfigSchema = z.object({
  __typename: z.string().optional(),
  amount: z.object({ usdCents: z.number().nullable().optional() }).nullable().optional(),
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
  so5Leaderboard: z.object({ slug: z.string(), displayName: z.string() }).nullable().optional(),
  so5Rankings: z.array(RankingSchema).optional().default([]),
  so5Appearances: z.array(AppearanceSchema).optional().default([]),
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
      if (config.__typename === "MonetaryRewardConfig") result.cash += (config.amount?.usdCents ?? 0) / 100;
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
          .object({ so5Fixture: z.object({ mySo5Lineups: z.array(LineupSchema).optional().default([]) }).nullable() })
          .optional(),
      })
      .nullable(),
  }),
  z.object({ state: z.literal("rejected"), errors: z.array(z.string()) }),
  z.object({ state: z.enum(["no-tab", "no-bridge", "signed-out", "refused", "unknown", "timeout", "error"]) }),
]);

/** Turn the gameweek-level response into the small, display-only shape the UI needs. */
export function readWeekLineups(response: unknown): WeekLineupsAnswer {
  const parsed = ReplySchema.safeParse(response);
  if (!parsed.success) return { state: "error" };
  const reply = parsed.data;
  if (reply.state === "rejected") return { state: "rejected", errors: reply.errors };
  if (reply.state !== "ok") {
    if (reply.state === "unknown") return { state: "no-bridge" };
    if (reply.state === "refused") return { state: "error" };
    return { state: reply.state };
  }

  const lineups = reply.data?.so5?.so5Fixture?.mySo5Lineups ?? [];
  return {
    state: "ok",
    lineups: lineups.map((lineup) => ({
      id: lineup.id,
      name: lineup.name,
      draft: lineup.draft,
      confirmable: lineup.confirmable,
      board: lineup.so5Leaderboard?.slug ?? null,
      competition: lineup.so5Leaderboard?.displayName ?? "Sorare competition",
      result: resultOf(lineup),
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
          },
        ];
      }),
    })),
  };
}

/** "Rank 1,204 · $2.50 · 250 essence · a card": where it ranked and what it was paid. Before it has a rank, it is still scoring. */
export function resultLine(result: LineupResult): string {
  if (result.rank === null) return "Still scoring";
  const paid = [
    result.cash ? cashLabel(result.cash) : null,
    result.essence ? `${essenceLabel(result.essence)} essence` : null,
    result.card ? "a card" : null,
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
  return new Promise((resolve) => {
    let done = false;
    const finish = (answer: WeekLineupsAnswer) => {
      if (done) return;
      done = true;
      resolve(answer);
    };
    const timer = setTimeout(() => finish({ state: "timeout" }), timeoutMs);
    try {
      send.call(runtime, EXTENSION_ID, { type: "sorare", step: "week-entered", slug }, (response) => {
        clearTimeout(timer);
        void runtime.lastError;
        finish(response === undefined ? { state: "no-extension" } : readWeekLineups(response));
      });
    } catch {
      clearTimeout(timer);
      finish({ state: "no-extension" });
    }
  });
}
