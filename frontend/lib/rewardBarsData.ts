import { cache } from "./cache";
import { published, readModel } from "./db";
import { SORARE_TAG } from "./play";
import { readable, REWARD_BARS_KEY, type RewardBars } from "./rewardBars";

// Local development and the browser tests have no blocks: they ask the FastAPI stand-in instead.
const API_BASE = process.env.API_BASE_URL ?? "http://127.0.0.1:8000";

/** One read, cached for an hour under the `sorare` tag and refreshed when a run ends, so a finished gameweek shows up. */
const cached = cache(
  async (): Promise<unknown> => {
    if (published()) return (await readModel(REWARD_BARS_KEY))?.payload ?? null;
    const response = await fetch(`${API_BASE}/api/reward-bars`, { cache: "no-store", signal: AbortSignal.timeout(8000) });
    if (!response.ok) return null;
    const body = (await response.json()) as { success?: boolean; data?: unknown };
    return body.success ? body.data : null;
  },
  ["reward-bars-v1"],
  { tags: [SORARE_TAG], revalidate: 3600 },
);

/** Null until the first refresh writes it, or when it cannot be read. Checked after the cache: an entry outlives a deploy. */
export async function loadRewardBars(): Promise<RewardBars | null> {
  try {
    return readable(await cached());
  } catch {
    return null;
  }
}
