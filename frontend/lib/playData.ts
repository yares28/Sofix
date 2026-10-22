import { unstable_cache } from "next/cache";
import { cache } from "./cache";
import { database, keptInDev, readModel, stamp } from "./db";
import { blockFromR2 } from "./r2";
import { SORARE_TAG, weekPlan, type GameweekPlan, type Lineup as PlayLineup, type MarketPlayer, type Sorare, type SorarePlans } from "./play";
import { restoreFrozenPlan } from "./frozenPlan";
import type { ChanceRecord } from "./lineupChances";
import type { SofixRecord } from "./matchScores";
import type { SavedStartRecord } from "./playerScoreViews";
import { marketForWeek, type ScoreRecord } from "./playerForecasts";

// Local development and the browser tests have no Neon: they ask the FastAPI stand-in instead.
const API_BASE = process.env.API_BASE_URL ?? "http://127.0.0.1:8000";

// The model is over Next's 2 MB cache limit in one piece (2.1 MB on 14 Oct 2026; Vercel has the same limit), which made every
// view of Home and Play download it from Neon again. Read as the model without weeks and market, the market, and each week,
// every piece kept under the model's write time (see readModelAt in lib/db.ts).
const sorarePart = unstable_cache(
  async (part: number, updatedAt: string): Promise<unknown> => keptInDev(`sorare#${part}@${updatedAt}`, async () => {
    const whole = (await blockFromR2("sorare", updatedAt)) as (Sorare & { market?: unknown }) | undefined;
    if (whole) {
      const { weeks, market, ...head } = whole;
      return part === -2 ? { head, weeks: weeks.length } : part === -1 ? (market ?? null) : (weeks[part] ?? null);
    }
    const sql = database()!;
    const rows = (part === -2
      ? await sql`SELECT payload::jsonb - 'weeks' - 'market' AS part, json_array_length(payload->'weeks') AS weeks FROM read_models WHERE key = 'sorare'`
      : part === -1
        ? await sql`SELECT payload->'market' AS part FROM read_models WHERE key = 'sorare'`
        : await sql`SELECT payload->'weeks'->${part}::int AS part FROM read_models WHERE key = 'sorare'`) as { part: unknown; weeks?: number }[];
    const row = rows[0];
    return part === -2 ? (row ? { head: row.part, weeks: row.weeks ?? 0 } : null) : (row?.part ?? null);
  }),
  ["sorare-part-v1"],
  { revalidate: 86400 },
);

/** When the model was last written; an hour under the `sorare` tag, which a run's end drops (POST /api/revalidate). */
const sorareWrittenAt = cache(async (): Promise<string | null> => {
  const rows = (await database()!`SELECT updated_at FROM read_models WHERE key = 'sorare'`) as { updated_at: string | Date }[];
  return rows[0] ? stamp(rows[0].updated_at) : null;
}, ["sorare-written-v1"], { tags: [SORARE_TAG], revalidate: 3600 });

/**
 * The Sorare gameweek the job published (`read_models` key `sorare`). Everything on the page — the plans,
 * the chances, the reasons — is computed by the job, so this only reads it, downloaded once per write.
 */
async function readSorare(includeMarket = true): Promise<Sorare | null> {
  if (database()) {
    const at = await sorareWrittenAt();
    if (!at) return null;
    const top = (await sorarePart(-2, at)) as { head: Omit<Sorare, "weeks" | "market">; weeks: number } | null;
    if (!top) return null;
    const parts = await Promise.all([...(includeMarket ? [-1] : []), ...Array.from({ length: top.weeks }, (_, i) => i)].map((part) => sorarePart(part, at)));
    const market = includeMarket ? parts.shift() : undefined;
    return { ...top.head, market: market ?? undefined, weeks: parts } as Sorare;
  }
  const response = await fetch(`${API_BASE}/api/sorare`, { cache: "no-store", signal: AbortSignal.timeout(8000) });
  if (!response.ok) return null;
  const body = (await response.json()) as { success?: boolean; data?: Sorare };
  return body?.data ?? null;
}

/**
 * Sofix's numbers for every Premier League or Bundesliga player (`read_models` key `players:<code>`, about 0.6 MB): start % and xScore for
 * his next game. Downloaded once per write (readModel); empty without a database or before the job has written it.
 */
export async function loadLeagueMarket(code: "PL" | "BL1" | "FL1"): Promise<MarketPlayer[]> {
  if (!database()) return [];
  // Cached until the job publishes again (the overlay asks many times a minute while a Sorare page scrolls).
  const read = cache(
    async (): Promise<MarketPlayer[]> => (await readModel<{ market?: MarketPlayer[] }>(`players:${code}`))?.payload.market ?? [],
    ["league-market-v1", code],
    { tags: [SORARE_TAG], revalidate: 3600 },
  );
  try {
    return await read();
  } catch (error) {
    console.error(`[sorare] ${code} players could not be read: ${error instanceof Error ? error.message : "unknown"}`);
    return [];
  }
}

/** Null while Sorare has never been synced (no key yet, or the first run hasn't happened). */
export async function loadSorare(options: { market?: boolean } = {}): Promise<Sorare | null> {
  try {
    return await readSorare(options.market !== false);
  } catch (error) {
    console.error(`[sorare] could not be read: ${error instanceof Error ? error.message : "unknown"}`);
    return null;
  }
}

/**
 * The early plan the job made for a LaLiga round Sorare has not opened (`read_models` key `sorare_ahead:<round>`), or null
 * when there is none. It is rewritten every run, so it is cached for as long as the page is and dropped with it.
 */
export async function loadProjectedWeek(round: number): Promise<GameweekPlan | null> {
  if (!Number.isInteger(round) || round < 1 || round > 60) return null;
  const read = cache(
    async (): Promise<GameweekPlan | null> => {
      if (database()) {
        const row = await readModel<GameweekPlan>(`sorare_ahead:${round}`);
        return row?.payload ?? null;
      }
      const response = await fetch(`${API_BASE}/api/sorare/ahead/${round}`, { cache: "no-store", signal: AbortSignal.timeout(8000) });
      if (!response.ok) return null;
      const body = (await response.json()) as { success?: boolean; data?: GameweekPlan };
      return body?.success ? (body.data ?? null) : null;
    },
    ["sorare-ahead-v1", String(round)],
    { tags: [SORARE_TAG], revalidate: 3600 },
  );
  try {
    return await read();
  } catch (error) {
    console.error(`[sorare] early plan for round ${round} could not be read: ${error instanceof Error ? error.message : "unknown"}`);
    return null;
  }
}

/** A slug from Sorare's own list ("football-25-29-sep-2026"): nothing else is a key the job wrote a week under. */
const WEEK_SLUG = /^[a-z0-9][a-z0-9-]{0,80}$/;

/** Small supporting records, independently retained when a locked week leaves the optimizer's payload. */
async function supportingRecord<T>(kind: "plan" | "record", slug: string): Promise<T | null> {
  if (!WEEK_SLUG.test(slug)) return null;
  const read = cache(async () => {
    if (database()) return (await readModel<T>(`${kind === "plan" ? "sorare_plan" : "score_record"}:${slug}`))?.payload ?? null;
    const response = await fetch(`${API_BASE}/api/sorare/${kind}/${slug}`, { cache: "no-store", signal: AbortSignal.timeout(8000) });
    if (!response.ok) return null;
    const body = await response.json() as { success?: boolean; data?: T };
    return body.success ? body.data ?? null : null;
  }, [`sorare-${kind}-v1`, slug], { tags: [SORARE_TAG], revalidate: 3600 });
  try { return await read(); } catch { return null; }
}
export async function loadFrozenPlan(slug: string, data: Sorare): Promise<GameweekPlan | null> {
  const week = await supportingRecord<GameweekPlan>("plan", slug);
  return week?.playing?.players && Array.isArray(week.plans) ? restoreFrozenPlan(week, data) : null;
}
export const loadChanceRecord = (slug: string) => supportingRecord<ChanceRecord>("record", slug);
export const loadSofixRecord = (slug: string) => supportingRecord<SofixRecord>("record", slug);
export const loadAuditStartRecord = (slug: string) => supportingRecord<SavedStartRecord>("record", slug);

/** Restore the selected GW's numbers after it leaves the optimizer. No later week's estimates fill gaps. */
export async function loadPlayerForecasts(data: Sorare, id: string) {
  const week = data.timeline.find(w => w.id === id);
  if (!week) return { plan: null, record: null, market: marketForWeek(data.market ?? [], data.nextId, { id, slug: "" }, null, null) };
  const [plan, record] = await Promise.all([
    weekPlan(data, id) ?? (week.kept ? loadSorareWeek(week.slug) : loadFrozenPlan(week.slug, data)),
    supportingRecord<ScoreRecord>("record", week.slug),
  ]);
  return { plan, record, market: marketForWeek(data.market ?? [], data.nextId, week, plan, record) };
}

/**
 * One finished gameweek the job kept whole (`read_models` key `sorare_week:<slug>`), or null when it did not keep
 * that one. Weeks before the job started keeping them are not here; the page says so and shows what Sorare holds.
 * A finished week never changes, so this is the same read as the page's, cached under the same tag.
 */
export async function loadSorareWeek(slug: string): Promise<GameweekPlan | null> {
  if (!WEEK_SLUG.test(slug)) return null;
  const read = cache(
    async (): Promise<GameweekPlan | null> => {
      if (database()) {
        const row = await readModel<GameweekPlan>(`sorare_week:${slug}`);
        return row?.payload ?? null;
      }
      const response = await fetch(`${API_BASE}/api/sorare/week/${slug}`, { cache: "no-store", signal: AbortSignal.timeout(8000) });
      if (!response.ok) return null;
      const body = (await response.json()) as { success?: boolean; data?: GameweekPlan };
      return body?.success ? (body.data ?? null) : null;
    },
    ["sorare-week-v1", slug],
    { tags: [SORARE_TAG], revalidate: 3600 },
  );
  try {
    return await read();
  } catch (error) {
    console.error(`[sorare] week ${slug} could not be read: ${error instanceof Error ? error.message : "unknown"}`);
    return null;
  }
}

/**
 * The week being planned again on Sorare's own projections (`read_models` key `sorare_alt:<slug>`), or null when the job has not
 * written one. Rewritten every run until the lock, so cached as long as the page is and dropped with it.
 */
export async function loadSorareAlt(slug: string): Promise<SorarePlans | null> {
  if (!WEEK_SLUG.test(slug)) return null;
  const read = cache(
    async (): Promise<SorarePlans | null> => {
      if (database()) {
        const row = await readModel<SorarePlans>(`sorare_alt:${slug}`);
        return row?.payload ?? null;
      }
      const response = await fetch(`${API_BASE}/api/sorare/alt/${slug}`, { cache: "no-store", signal: AbortSignal.timeout(8000) });
      if (!response.ok) return null;
      const body = (await response.json()) as { success?: boolean; data?: SorarePlans };
      return body?.success ? (body.data ?? null) : null;
    },
    ["sorare-alt-v1", slug],
    { tags: [SORARE_TAG], revalidate: 3600 },
  );
  try {
    const alt = await read();
    // a cached entry from before a field existed must not break the page (next-cache-survives-deploys)
    return alt && Array.isArray(alt.plans) ? alt : null;
  } catch (error) {
    console.error(`[sorare] Sorare plans for ${slug} could not be read: ${error instanceof Error ? error.message : "unknown"}`);
    return null;
  }
}

/**
 * The week planned again a strategy's way (`read_models` key `sorare_lens:<slug>:<strategy>`), or null when the job has not written one.
 * Rewritten every run until the lock, so cached as long as the page is.
 */
export async function loadSorareLens(slug: string, key: string): Promise<SorarePlans | null> {
  if (!WEEK_SLUG.test(slug) || !/^[a-z-]+$/.test(key)) return null;
  const read = cache(
    async (): Promise<SorarePlans | null> => {
      if (database()) {
        const row = await readModel<SorarePlans>(`sorare_lens:${slug}:${key}`);
        return row?.payload ?? null;
      }
      const response = await fetch(`${API_BASE}/api/sorare/lens/${slug}/${key}`, { cache: "no-store", signal: AbortSignal.timeout(8000) });
      if (!response.ok) return null;
      const body = (await response.json()) as { success?: boolean; data?: SorarePlans };
      return body?.success ? (body.data ?? null) : null;
    },
    ["sorare-lens-v1", slug, key],
    { tags: [SORARE_TAG], revalidate: 3600 },
  );
  try {
    const lens = await read();
    return lens && Array.isArray(lens.plans) ? lens : null;
  } catch (error) {
    console.error(`[sorare] ${key} plans for ${slug} could not be read: ${error instanceof Error ? error.message : "unknown"}`);
    return null;
  }
}

/** Pro lineups rebuilt on the announced elevens (`read_models` key `pro_rebuild`, written by pro-rebuild.yml), or null. */
export type ProRebuild = {
  week: string;
  plan: number;
  at: string;
  lineups: (PlayLineup & { swaps: { out: string; in: string; why: string }[] })[];
  missing: { comp: string; why: string }[];
};
export async function loadProRebuild(slug: string): Promise<ProRebuild | null> {
  if (!database()) return null;
  try {
    const read = cache(async () => (await readModel<ProRebuild>("pro_rebuild"))?.payload ?? null, ["pro-rebuild-v1"], { tags: [SORARE_TAG], revalidate: 3600 });
    const got = await read();
    return got && got.week === slug && Array.isArray(got.lineups) ? got : null;
  } catch {
    return null;
  }
}
