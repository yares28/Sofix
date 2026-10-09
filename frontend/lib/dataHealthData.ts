import { cache } from "./cache";
import { database, readModel } from "./db";
import { readHealth, type DataHealth } from "./dataHealth";
import { SYSTEM_TAG } from "./system";

const API_BASE = process.env.API_BASE_URL ?? "http://127.0.0.1:8000";
const savedHealth = cache(async (): Promise<DataHealth | null> => {
  if (database()) return readHealth((await readModel("data_health"))?.payload);
  const res = await fetch(`${API_BASE}/api/data-health`, { cache: "no-store", signal: AbortSignal.timeout(8000) });
  if (!res.ok) return null;
  const body = await res.json() as { success?: boolean; data?: unknown };
  return body.success ? readHealth(body.data) : null;
}, ["data-health-v1"], { tags: [SYSTEM_TAG], revalidate: 3600 });

export async function loadDataHealth(): Promise<DataHealth | null> {
  try { return await savedHealth(); } catch { return null; }
}
