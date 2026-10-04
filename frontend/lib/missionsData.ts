import { unstable_cache } from "next/cache";
import { database, readModel } from "./db";
import { MISSIONS_TAG, type MissionsModel } from "./missions";

// Local development and the browser tests have no Neon: they ask the stand-in API instead.
const API_BASE = process.env.API_BASE_URL ?? "http://127.0.0.1:8000";

/** The daily missions the extension last read from the Missions page of Sorare, per rarity (`read_models` key `missions`), or null when it never has. */
const cached = unstable_cache(
  async (): Promise<MissionsModel | null> => {
    if (database()) {
      const row = await readModel<MissionsModel>("missions");
      return row?.payload ?? null;
    }
    const response = await fetch(`${API_BASE}/api/missions`, { cache: "no-store", signal: AbortSignal.timeout(8000) });
    if (!response.ok) return null;
    const body = (await response.json()) as { data?: MissionsModel };
    return body?.data ?? null;
  },
  ["missions-v1"],
  { tags: [MISSIONS_TAG], revalidate: 600 },
);

export async function loadMissions(): Promise<MissionsModel | null> {
  try {
    return await cached();
  } catch (error) {
    console.error(`[missions] could not be read: ${error instanceof Error ? error.message : "unknown"}`);
    return null;
  }
}
