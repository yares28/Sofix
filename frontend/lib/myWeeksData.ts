import { cache } from "./cache";
import { database } from "./db";
import { MY_WEEK_PREFIX, MY_WEEKS_TAG, type SavedWeek } from "./myWeeks";

const readWeeks = cache(async (): Promise<SavedWeek[]> => {
  const sql = database();
  if (sql) {
    const rows = await sql`SELECT payload FROM read_models WHERE key LIKE ${`${MY_WEEK_PREFIX}%`} ORDER BY payload->>'end' DESC` as { payload: SavedWeek }[];
    return rows.map((row) => row.payload);
  }
  const response = await fetch(`${process.env.API_BASE_URL ?? "http://127.0.0.1:8000"}/api/my-weeks`, { cache: "no-store", signal: AbortSignal.timeout(8000) });
  if (!response.ok) throw new Error("Week storage is unavailable");
  return ((await response.json()) as { data?: SavedWeek[] }).data ?? [];
}, ["my-weeks-v1"], { tags: [MY_WEEKS_TAG], revalidate: 3600 });

export async function loadMyWeeks(): Promise<SavedWeek[]> {
  return readWeeks();
}
/** Page reads retain their other content when storage is temporarily unavailable. */
export async function myWeeksQuietly(): Promise<SavedWeek[] | null> {
  try { return await loadMyWeeks(); } catch { return null; }
}
