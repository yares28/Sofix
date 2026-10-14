import { cache } from "./cache";
import { database, readModelAt, stamp } from "./db";
import { ENTERED_WEEK_PREFIX, MY_WEEK_PREFIX, MY_WEEKS_TAG, type SavedWeek } from "./myWeeks";

/** The saved weeks under a prefix, newest first: their write times from Neon, each payload once per change (readModelAt). */
async function savedWeeks(prefix: string): Promise<SavedWeek[]> {
  const rows = (await database()!`SELECT key, updated_at FROM read_models WHERE key LIKE ${`${prefix}%`}`) as { key: string; updated_at: string | Date }[];
  const weeks = (await Promise.all(rows.map((row) => readModelAt(row.key, stamp(row.updated_at))))) as (SavedWeek | null)[];
  return weeks.filter((week): week is SavedWeek => week !== null).sort((a, b) => String(b.end).localeCompare(String(a.end)));
}

const readWeeks = cache(async (): Promise<SavedWeek[]> => {
  const sql = database();
  if (sql) {
    return savedWeeks(MY_WEEK_PREFIX);
  }
  const response = await fetch(`${process.env.API_BASE_URL ?? "http://127.0.0.1:8000"}/api/my-weeks`, { cache: "no-store", signal: AbortSignal.timeout(8000) });
  if (!response.ok) throw new Error("Week storage is unavailable");
  return ((await response.json()) as { data?: SavedWeek[] }).data ?? [];
}, ["my-weeks-v1"], { tags: [MY_WEEKS_TAG], revalidate: 3600 });

export async function loadMyWeeks(): Promise<SavedWeek[]> {
  return readWeeks();
}
const readSnapshots = cache(async (): Promise<SavedWeek[]> => {
  const sql = database();
  if (!sql) return [];
  return savedWeeks(ENTERED_WEEK_PREFIX);
}, ["entered-weeks-v1"], { tags: [MY_WEEKS_TAG], revalidate: 3600 });

export async function loadEnteredSnapshots(): Promise<SavedWeek[]> { return readSnapshots(); }
/** Page reads retain their other content when storage is temporarily unavailable. */
export async function myWeeksQuietly(): Promise<SavedWeek[] | null> {
  try { return await loadMyWeeks(); } catch { return null; }
}
