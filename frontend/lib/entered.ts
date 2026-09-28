import { z } from "zod";
import { EXTENSION_ID, extensionAtLeast, pingExtension } from "./extension";

export type EnteredCard = { slug: string; name: string; picture: string | null; rarity: string | null };
export type GameweekLineup = {
  id: string;
  name: string | null;
  draft: boolean;
  confirmable: boolean;
  board: string | null;
  competition: string;
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
});

const LineupSchema = z.object({
  id: z.string(),
  name: z.string().nullable().default(null),
  draft: z.boolean(),
  confirmable: z.boolean().default(false),
  so5Leaderboard: z.object({ slug: z.string(), displayName: z.string() }).nullable().optional(),
  so5Appearances: z.array(AppearanceSchema).optional().default([]),
});

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
      cards: lineup.so5Appearances.flatMap((appearance) => {
        const slug = (appearance.anyCard ?? appearance.card)?.slug;
        if (!slug) return [];
        return [
          {
            slug,
            name: appearance.player?.displayName ?? slug,
            picture: appearance.pictureUrl ?? null,
            rarity: appearance.rarity ?? null,
          },
        ];
      }),
    })),
  };
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
