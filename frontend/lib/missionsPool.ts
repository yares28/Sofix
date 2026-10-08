import { cache } from "./cache";
import { database, readModel } from "./db";
import { MISSIONS_TAG } from "./missions";
import type { PlayingPlayer } from "./play";
import type { Sheets } from "./playerSheet";

export type MissionPlayer = PlayingPlayer & { card?: string; eligibility?: string | null };
export type MissionPool = { generatedAt: string; players: MissionPlayer[]; sheets: Sheets; complete: boolean; statsWindow: string };
const cached = cache(async (): Promise<MissionPool | null> => {
  if (database()) return (await readModel<MissionPool>("missions_pool"))?.payload ?? null;
  const response = await fetch(`${process.env.API_BASE_URL ?? "http://127.0.0.1:8000"}/api/missions/pool`, { cache: "no-store", signal: AbortSignal.timeout(8000) });
  return response.ok ? ((await response.json()) as { data: MissionPool }).data : null;
}, ["mission-pool-v1"], { tags: [MISSIONS_TAG, "sorare"], revalidate: 300 });
export async function loadMissionPool(): Promise<MissionPool | null> {
  try { return await cached(); } catch { return null; }
}
