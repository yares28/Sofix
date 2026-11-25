import { cache } from "./cache";
import { published, readModel } from "./db";
import { SORARE_TAG } from "./play";
import { PRO_KEY, readable, type ProBlock } from "./proWeek";

// The browser tests have no blocks: they ask the mock API instead (e2e/mock-api.mjs serves the fixture).
const API_BASE = process.env.API_BASE_URL ?? "http://127.0.0.1:8000";

/** One read, cached for an hour under the `sorare` tag and refreshed when a run ends. */
const cached = cache(
  async (): Promise<unknown> => {
    if (published()) return (await readModel(PRO_KEY))?.payload ?? null;
    const response = await fetch(`${API_BASE}/api/pro`, { cache: "no-store", signal: AbortSignal.timeout(8000) });
    if (!response.ok) return null;
    const body = (await response.json()) as { success?: boolean; data?: unknown };
    return body.success ? body.data : null;
  },
  ["sorare-pro-v1"],
  { tags: [SORARE_TAG], revalidate: 3600 },
);

/** Null until the first refresh writes it, or when it cannot be read. Checked after the cache: an entry outlives a deploy. */
export async function loadProWeek(): Promise<ProBlock | null> {
  try {
    return readable(await cached());
  } catch {
    return null;
  }
}
