import { z } from "zod";
import { REFRESH_HEADER } from "./refresh";

/**
 * Every Arcade lineup you enter and what became of it (plans/arcade-trust.md step 8, owner 29 Oct and 20 Nov 2026: Arcade keeps what
 * it needs to learn which lineups clear). One block per set, `arcade_log:<set slug>`: the board's steps and lives as last read, and
 * each lineup by its Sorare id with its cards, step, target, the chance Sofix gave it when first seen before its first kick-off
 * (never changed afterwards), and its result once settled. The Arcade page sends it only when something changed; never polled.
 */
export const LOG_PREFIX = "arcade_log:";
/** Sorare counts a lineup's score about two hours after its last kick-off (lib/arcadePlan.ts SETTLES_AFTER_MS). */
const SETTLED_MS = 120 * 60_000;

const slug = z.string().regex(/^[a-z0-9][a-z0-9-]{0,80}$/);
const iso = z.string().refine((v) => Number.isFinite(Date.parse(v)));
const Lineup = z.object({
  id: z.string().min(1).max(120),
  step: z.number().int().min(1).max(20),
  target: z.number().min(0).max(5000),
  state: z.string().max(40),
  score: z.number().nullable(),
  cancelled: z.boolean(),
  cards: z.array(z.object({ slug: z.string().max(200).nullable(), player: z.string().max(160).nullable(), game: z.string().max(80).nullable(), captain: z.boolean(), score: z.number().nullable() })).max(7),
  firstKickoff: iso.nullable(),
  lastKickoff: iso.nullable(),
  chance: z.number().min(0).max(1).nullable(),
});
export const LogBatch = z.object({
  set: slug,
  board: z.string().min(1).max(120),
  readAt: z.number().int().positive(),
  steps: z.array(z.object({ number: z.number().int(), target: z.number(), state: z.string().max(40), remaining: z.number().int().nullable(), max: z.number().int().nullable(), captain: z.number().nullable().optional() })).max(20),
  lineups: z.array(Lineup).max(80),
  /** The set's commons, sent only when they changed: the Arcade audit's hindsight is worked out from them (step 10). */
  cards: z.object({
    start: iso.nullable(),
    end: iso.nullable(),
    list: z.array(z.object({
      slug: z.string().max(200), player: z.string().max(160), name: z.string().max(160), team: z.string().max(160).nullable(), teamSlug: z.string().max(160).nullable(),
      teamPicture: z.string().url().max(500).nullable(), picture: z.string().url().max(500).nullable(), positions: z.array(z.string().max(40)).max(4), bonus: z.number().nullable(),
    })).max(3000),
  }).optional(),
});
export type LogBatch = z.infer<typeof LogBatch>;

type Kept = Omit<LogBatch["lineups"][number], "chance"> & { chance: number | null; chanceAt: string | null; readAt: number; result: "cleared" | "missed" | "cancelled" | null };
export type ArcadeLog = { set: string; board: string; readAt: number; steps: LogBatch["steps"]; lineups: Record<string, Kept> };

/** What is kept after a read: the chance frozen at its first sighting before kick-off, everything else from the newest read. */
export function mergeLog(old: ArcadeLog | null, batch: LogBatch, now: number): ArcadeLog {
  const lineups = { ...(old?.board === batch.board ? old.lineups : {}) };
  for (const read of batch.lineups) {
    const before = lineups[read.id];
    const first = read.firstKickoff ? Date.parse(read.firstKickoff) : null;
    const chanceKept = before?.chance != null;
    // Only the server's clock decides "before kick-off": a chance first seen afterwards would be hindsight.
    const chance = chanceKept ? before!.chance : read.chance !== null && first !== null && now < first ? read.chance : null;
    const chanceAt = chanceKept ? before!.chanceAt : chance !== null ? new Date(now).toISOString() : null;
    if (before && before.readAt > batch.readAt) { lineups[read.id] = { ...before, chance, chanceAt }; continue; } // a late, older read
    const last = read.lastKickoff ? Date.parse(read.lastKickoff) : null;
    const settled = last !== null && now >= last + SETTLED_MS;
    const result = read.cancelled ? "cancelled" : settled && read.score !== null ? (read.score >= read.target ? "cleared" : "missed") : null;
    lineups[read.id] = { ...read, chance, chanceAt, readAt: batch.readAt, result };
  }
  const newer = !old || old.board !== batch.board || batch.readAt >= old.readAt;
  return { set: batch.set, board: batch.board, readAt: newer ? batch.readAt : old!.readAt, steps: newer ? batch.steps : old!.steps, lineups };
}

type LineupRead = { id: string; state: string; score: number | null; cancelled: boolean; draft: boolean; cards: { slug: string | null; player: string | null; game: string | null; captain: boolean; score: number | null; kickoff: string | null }[] };
type StepRead = { id: string; number: number; target: number; state: string; lineups: { remaining: number; max: number } | null; captain?: number | null };

/** One read of the board for the log: every entered lineup (drafts left out), with the chance `price` gives it. */
export function logBatch<L extends LineupRead, S extends StepRead>(set: string, board: string, steps: S[], entered: Map<string, L[]>, price: (lineup: L, step: S) => number | null, readAt: number): LogBatch {
  const lineups = steps.flatMap((step) => (entered.get(step.id) ?? []).filter((l) => !l.draft).map((l) => {
    const kickoffs = l.cards.flatMap((c) => (c.kickoff ? [c.kickoff] : [])).sort();
    return {
      id: l.id, step: step.number, target: step.target, state: l.state, score: l.score, cancelled: l.cancelled,
      cards: l.cards.map(({ slug, player, game, captain, score }) => ({ slug, player, game, captain, score })),
      firstKickoff: kickoffs[0] ?? null, lastKickoff: kickoffs.at(-1) ?? null, chance: price(l, step),
    };
  }));
  return { set, board, readAt, steps: steps.map((s) => ({ number: s.number, target: s.target, state: s.state, remaining: s.lineups?.remaining ?? null, max: s.lineups?.max ?? null, captain: s.captain ?? null })), lineups };
}

/**
 * Sends a read when it differs from the last one this browser sent for the set (its chances aside: the first one is kept anyway),
 * so one change is one request (AGENTS.md "Limits", Vercel CPU). A failed send is simply sent again with the next read.
 */
export async function sendArcadeLog(batch: LogBatch): Promise<boolean> {
  const key = `sofix-arcade-log-sent:${batch.set}`;
  const cardsKey = `sofix-arcade-cards-sent:${batch.set}`;
  const { cards, ...read } = batch;
  const signature = JSON.stringify({ ...read, readAt: 0, lineups: read.lineups.map((l) => ({ ...l, chance: l.chance === null ? null : 1 })) });
  const cardsSignature = cards ? JSON.stringify(cards) : null;
  let sentRead = false, sentCards = false;
  try { sentRead = localStorage.getItem(key) === signature; sentCards = !cardsSignature || localStorage.getItem(cardsKey) === cardsSignature; } catch { /* storage blocked: send */ }
  if (sentRead && sentCards) return false;
  try {
    const body: LogBatch = sentCards ? read : { ...read, cards };
    const response = await fetch("/api/arcade/log", { method: "POST", headers: { "content-type": "application/json", [REFRESH_HEADER]: "1" }, body: JSON.stringify(body) });
    if (!response.ok) return false;
    try { localStorage.setItem(key, signature); if (cardsSignature) localStorage.setItem(cardsKey, cardsSignature); } catch { /* not remembered: sent again next read */ }
    return true;
  } catch {
    return false;
  }
}

/** The Audit's floor: under 100 lineups in a band, its share is "too few to tell" (AUDIT-EVIDENCE-001). */
const FLOOR = 100;
/** Nothing is said before this many priced lineups have settled (plans/arcade-trust.md step 9). */
const SHOW_FROM = 50;

export type ChanceCheck = { settled: number; bands: { lo: number; n: number; cleared: number }[] };

/** Settled, priced lineups by the chance Sofix gave them, in bands of 10 points: how many there were and how many cleared. */
export function chanceCheck(log: Pick<ArcadeLog, "lineups"> | null): ChanceCheck {
  const bands = new Map<number, { lo: number; n: number; cleared: number }>();
  let settled = 0;
  for (const l of Object.values(log?.lineups ?? {})) {
    if (l.chance === null || (l.result !== "cleared" && l.result !== "missed")) continue;
    const lo = Math.min(90, Math.floor(l.chance * 10) * 10);
    const band = bands.get(lo) ?? { lo, n: 0, cleared: 0 };
    band.n++;
    if (l.result === "cleared") band.cleared++;
    bands.set(lo, band);
    settled++;
  }
  return { settled, bands: [...bands.values()].sort((a, b) => a.lo - b.lo) };
}

/** The line beside a chance: how often lineups given the same band cleared. Null before 50 settled lineups. */
export function checkLine(check: ChanceCheck | null, chance: number): string | null {
  if (!check || check.settled < SHOW_FROM) return null;
  const lo = Math.min(90, Math.floor(chance * 10) * 10);
  const band = check.bands.find((b) => b.lo === lo);
  const label = `Lineups Sofix gave ${lo}–${lo + 10}%`;
  if (!band) return `${label}: none settled yet`;
  return `${label}: ${band.cleared} of ${band.n} cleared${band.n < FLOOR ? " · too few to tell" : ""}`;
}


const Pick5 = z.object({ slot: z.string(), card: z.string(), score: z.number(), captain: z.boolean() });
/** The Arcade audit, hindsight (`arcade_audit:<set>`, backend/app/sorare/arcade_audit.py; plans/arcade-trust.md step 10). */
export const ArcadeAuditSchema = z.object({
  set: z.string(),
  at: z.string(),
  windows: z.number(),
  targets: z.array(z.number()),
  hindsight: z.object({
    tops: z.number(),
    clears: z.record(z.string(), z.number()),
    moves: z.array(z.object({ window: z.number(), step: z.number(), total: z.number(), target: z.number(), at: z.string(), picks: z.array(Pick5) })),
  }),
  best: z.array(z.object({ at: z.string(), total: z.number(), picks: z.array(Pick5) })),
  clubs: z.array(z.object({ slug: z.string(), name: z.string(), crest: z.string().nullable(), count: z.number() })),
  players: z.array(z.object({ card: z.string(), name: z.string(), picture: z.string().nullable(), count: z.number() })),
  actual: z.object({ lineups: z.number(), clears: z.record(z.string(), z.number()), misses: z.record(z.string(), z.number()), tops: z.number(), since: z.string().nullable() }),
});
export type ArcadeAudit = z.infer<typeof ArcadeAuditSchema>;
