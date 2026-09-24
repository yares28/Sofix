/**
 * Apply: entering one of our lineups on sorare.com, in three steps you press yourself.
 *
 * The API key Sofix syncs with is read-only, so entering a lineup can only happen through your own sorare.com
 * session — which lives in Chrome, inside the extension (`extension/bridge.js`). This module is the app's half:
 * it turns a lineup into the appearances Sorare takes, asks the extension for one step at a time, and reads its
 * answer. It never chains the steps: each one is a click (docs/sorare_plan.md, S6).
 *
 * - **check** — `previewSo5Lineup`: Sorare's verdict, before anything is written.
 * - **draft** — `createOrUpdateSo5Lineup(draft: true)`: saved on sorare.com, not entered, still deletable.
 * - **enter** — `confirmSo5Lineups`: the step that spends a lineup slot, and the only one that costs anything.
 */

import { z } from "zod";
import { EXTENSION_ID } from "./extension";
import type { Lineup } from "./play";

export type Step = "entered" | "check" | "draft" | "enter";

/** One slot of the lineup, the way Sorare's `So5AppearanceInput` wants it. */
export type Appearance = { cardSlug: string; captain: boolean; index: number; benchObjectId?: string };

/** A rule Sorare checked, in Sorare's own words. */
export type Rule = { ruleName: string; state: "VALID" | "INVALID" | "VALIDATABLE"; message: string | null };

/** A lineup Sorare already holds for this competition. */
export type Entered = { id: string; name: string | null; draft: boolean; confirmable: boolean; cards: string[] };

/** What Sorare said when a step went through. */
export type Verdict = {
  state: "ok";
  multiplier: number | null;
  rules: Rule[];
  lineupId: string | null;
  entered: Entered[];
  cap: number;
};

export type Answer =
  | Verdict
  /** Sorare refused, in its words. A disagreement with our own rules is a bug in Sofix, so it is shown. */
  | { state: "rejected"; errors: string[] }
  /** Chrome, the extension or a sorare.com tab is missing — everything else in Sofix carries on without them. */
  | { state: "no-extension" | "no-tab" | "no-bridge" | "signed-out" | "timeout" | "error" };

/** The lineup as Sorare takes it: starters in their slots, then the subs, one captain. */
export function appearances(lineup: Lineup): Appearance[] {
  const starters = lineup.starters.map((card, index) => ({
    cardSlug: card.slug,
    captain: Boolean(card.captain),
    index,
  }));
  const subs = lineup.subs.map((card, offset) => ({
    cardSlug: card.slug,
    captain: false,
    index: lineup.starters.length + offset,
  }));
  return [...starters, ...subs];
}

const RuleSchema = z.object({
  ruleName: z.string(),
  state: z.enum(["VALID", "INVALID", "VALIDATABLE"]),
  message: z.string().nullable().default(null),
});

const LineupSchema = z.object({
  id: z.string(),
  name: z.string().nullable().default(null),
  draft: z.boolean(),
  confirmable: z.boolean().default(false),
  so5Appearances: z
    .array(z.object({ card: z.object({ slug: z.string() }).nullable().default(null) }))
    .optional()
    .default([]),
});

const BoardSchema = z.object({
  id: z.string().optional(),
  teamsCap: z.number().optional(),
  mySo5Lineups: z.array(LineupSchema).optional(),
  previewSo5Lineup: z
    .object({ rewardMultiplier: z.number().nullable().default(null), feedbackRules: z.array(RuleSchema).nullable().default(null) })
    .optional(),
});

const ReplySchema = z.discriminatedUnion("state", [
  z.object({
    state: z.literal("ok"),
    data: z
      .object({
        so5: z.object({ so5Leaderboard: BoardSchema }).optional(),
        createOrUpdateSo5Lineup: z.object({ errors: z.array(z.object({ message: z.string() })), so5Lineup: LineupSchema.nullable() }).optional(),
        confirmSo5Lineups: z.object({ errors: z.array(z.object({ message: z.string() })), so5Lineups: z.array(LineupSchema).nullable() }).optional(),
      })
      .nullable(),
  }),
  z.object({ state: z.literal("rejected"), errors: z.array(z.string()) }),
  z.object({ state: z.enum(["no-tab", "no-bridge", "refused", "unknown", "timeout", "error"]) }),
]);

const entered = (lineups: z.infer<typeof LineupSchema>[]): Entered[] =>
  lineups.map((lineup) => ({
    id: lineup.id,
    name: lineup.name,
    draft: lineup.draft,
    confirmable: lineup.confirmable,
    cards: lineup.so5Appearances.flatMap((slot) => (slot.card ? [slot.card.slug] : [])),
  }));

const EMPTY: Verdict = { state: "ok", multiplier: null, rules: [], lineupId: null, entered: [], cap: 0 };

/** Read the extension's answer into one shape, whichever step asked. */
export function readAnswer(response: unknown): Answer {
  const parsed = ReplySchema.safeParse(response);
  if (!parsed.success) return { state: "error" };
  const reply = parsed.data;
  if (reply.state === "rejected") return { state: "rejected", errors: reply.errors };
  if (reply.state !== "ok") {
    // "unknown" is the bridge before Sorare's page has made a call of its own; "refused" can't happen from here.
    return { state: reply.state === "unknown" ? "no-bridge" : reply.state === "refused" ? "error" : reply.state };
  }

  const data = reply.data;
  const board = data?.so5?.so5Leaderboard;
  const write = data?.createOrUpdateSo5Lineup ?? data?.confirmSo5Lineups;
  if (write?.errors.length) return { state: "rejected", errors: write.errors.map((error) => error.message) };

  const saved = data?.createOrUpdateSo5Lineup?.so5Lineup ?? data?.confirmSo5Lineups?.so5Lineups?.[0] ?? null;
  return {
    ...EMPTY,
    multiplier: board?.previewSo5Lineup?.rewardMultiplier ?? null,
    rules: board?.previewSo5Lineup?.feedbackRules ?? [],
    lineupId: saved?.id ?? null,
    entered: entered(board?.mySo5Lineups ?? (saved ? [saved] : [])),
    cap: board?.teamsCap ?? 0,
  };
}

/** Sorare's rules that did not pass — the only ones worth a word. */
export const broken = (rules: Rule[]): Rule[] => rules.filter((rule) => rule.state === "INVALID");

/** What the sheet says when a step cannot run at all. */
export function cannot(state: Answer["state"]): { title: string; says: string; act: string | null } | null {
  switch (state) {
    case "no-extension":
      return {
        title: "Chrome doesn't have the extension",
        says: "Entering uses your own sorare.com session, which only the extension can reach.",
        act: "Set it up",
      };
    case "no-tab":
      return {
        title: "sorare.com isn't open",
        says: "Your session lives in that tab. Open it, sign in, and come back.",
        act: "Open sorare.com",
      };
    case "no-bridge":
      return { title: "The tab needs a reload", says: "Sorare's page hasn't spoken to its own API yet.", act: "Open sorare.com" };
    case "signed-out":
      return { title: "You're signed out of Sorare", says: "Sign in on sorare.com, then come back.", act: "Open sorare.com" };
    case "timeout":
      return { title: "Sorare didn't answer", says: "Nothing was saved. Try the step again.", act: null };
    case "error":
      return { title: "That didn't go through", says: "Nothing was saved. Try the step again.", act: null };
    default:
      return null;
  }
}

type ChromeRuntime = {
  sendMessage?: (id: string, message: unknown, reply: (response: unknown) => void) => void;
  lastError?: unknown;
};

/** Ask the extension for one step. Nothing here runs a second step on its own. */
export function runStep(step: Step, input: Record<string, unknown>, timeoutMs = 25_000): Promise<Answer> {
  const runtime = (globalThis as { chrome?: { runtime?: ChromeRuntime } }).chrome?.runtime;
  const send = runtime?.sendMessage;
  if (!runtime || !send) return Promise.resolve({ state: "no-extension" });
  return new Promise((resolve) => {
    let done = false;
    const finish = (answer: Answer) => {
      if (!done) {
        done = true;
        resolve(answer);
      }
    };
    const timer = setTimeout(() => finish({ state: "timeout" }), timeoutMs);
    try {
      send.call(runtime, EXTENSION_ID, { type: "sorare", step, ...input }, (response) => {
        clearTimeout(timer);
        void runtime.lastError; // reading it keeps Chrome quiet when the extension isn't installed
        finish(response === undefined ? { state: "no-extension" } : readAnswer(response));
      });
    } catch {
      clearTimeout(timer);
      finish({ state: "no-extension" });
    }
  });
}
