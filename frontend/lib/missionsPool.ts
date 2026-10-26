import { createHash } from "node:crypto";
import { unstable_cache } from "next/cache";
import { cache } from "./cache";
import { published } from "./db";
import { blockAt, blockVersion } from "./r2";
import { MISSIONS_TAG } from "./missions";
import type { PlayingPlayer } from "./play";
import type { Sheet, Sheets } from "./playerSheet";

export type MissionPlayer = PlayingPlayer & { card?: string; eligibility?: string | null };
export type MissionPool = { generatedAt: string; players: MissionPlayer[]; sheets: Sheets; complete: boolean; statsWindow: string };

// The pool is over Next's 2 MB cache limit in one piece (2.3 MB on 12 Oct 2026). Read as the pool without its sheets plus
// the sheets in SHEET_PARTS groups, each kept under the pool's version (lib/r2.ts); the whole block is downloaded from R2
// once per change and per server, and split here. A player's group is the first character code of the md5 of his key.
const SHEET_PARTS = 4;
export const sheetGroup = (key: string) => createHash("md5").update(key).digest("hex").charCodeAt(0) % SHEET_PARTS;
const poolPart = unstable_cache(
  async (part: number, version: string): Promise<unknown> => {
    const whole = (await blockAt("missions_pool", version))?.payload as MissionPool | undefined;
    if (!whole) return null;
    const { players, ...rest } = whole.sheets;
    if (part < 0) return { ...whole, sheets: rest };
    return Object.fromEntries(Object.entries(players ?? {}).filter(([key]) => sheetGroup(key) === part));
  },
  ["mission-pool-part-v3"],
  { revalidate: 86400 },
);

/** The pool's current version; five minutes, so a page view does not ask R2 each time. */
const writtenAt = cache(async (): Promise<string | null> => blockVersion("missions_pool"), ["mission-pool-version-v1"], { tags: [MISSIONS_TAG, "sorare"], revalidate: 300 });

async function read(): Promise<MissionPool | null> {
  if (published()) {
    const at = await writtenAt();
    if (!at) return null;
    const [head, ...parts] = await Promise.all([-1, ...Array.from({ length: SHEET_PARTS }, (_, i) => i)].map((part) => poolPart(part, at)));
    const pool = head as MissionPool | null;
    return pool && { ...pool, sheets: { ...pool.sheets, players: Object.assign({}, ...(parts as Record<string, Sheet>[])) } };
  }
  const response = await fetch(`${process.env.API_BASE_URL ?? "http://127.0.0.1:8000"}/api/missions/pool`, { cache: "no-store", signal: AbortSignal.timeout(8000) });
  return response.ok ? ((await response.json()) as { data: MissionPool }).data : null;
}
export async function loadMissionPool(): Promise<MissionPool | null> {
  try { return await read(); } catch { return null; }
}
