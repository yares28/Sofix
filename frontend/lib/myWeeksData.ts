import { cache } from "./cache";
import { published, readModelAt } from "./db";
import { blockVersions } from "./r2";
import { ENTERED_WEEK_PREFIX, MY_WEEK_PREFIX, MY_WEEKS_TAG, type SavedWeek } from "./myWeeks";

/** The saved weeks under a prefix, newest first: their versions from one R2 listing, each payload once per change (readModelAt). */
async function savedWeeks(prefix: string): Promise<SavedWeek[]> {
  const versions = await blockVersions(prefix);
  const weeks = (await Promise.all([...versions].map(([key, version]) => readModelAt(key, version)))) as (SavedWeek | null)[];
  return weeks.filter((week): week is SavedWeek => week !== null).sort((a, b) => String(b.end).localeCompare(String(a.end)));
}

const readWeeks = cache(async (): Promise<SavedWeek[]> => {
  if (published()) {
    return savedWeeks(MY_WEEK_PREFIX);
  }
  const response = await fetch(`${process.env.API_BASE_URL ?? "http://127.0.0.1:8000"}/api/my-weeks`, { cache: "no-store", signal: AbortSignal.timeout(8000) });
  if (!response.ok) throw new Error("Week storage is unavailable");
  return ((await response.json()) as { data?: SavedWeek[] }).data ?? [];
}, ["my-weeks-v2"], { tags: [MY_WEEKS_TAG], revalidate: 3600 });

export async function loadMyWeeks(): Promise<SavedWeek[]> {
  return readWeeks();
}
const readSnapshots = cache(async (): Promise<SavedWeek[]> => {
  if (!published()) return [];
  return savedWeeks(ENTERED_WEEK_PREFIX);
}, ["entered-weeks-v2"], { tags: [MY_WEEKS_TAG], revalidate: 3600 });

export async function loadEnteredSnapshots(): Promise<SavedWeek[]> { return readSnapshots(); }
/** Page reads retain their other content when storage is temporarily unavailable. */
export async function myWeeksQuietly(): Promise<SavedWeek[] | null> {
  try { return await loadMyWeeks(); } catch { return null; }
}
