import { createHash } from "node:crypto";
import { unstable_cache } from "next/cache";
import { cache } from "./cache";
import { database, keptInDev, stamp } from "./db";
import { blockFromR2 } from "./r2";
import { MISSIONS_TAG } from "./missions";
import type { PlayingPlayer } from "./play";
import type { Sheet, Sheets } from "./playerSheet";

export type MissionPlayer = PlayingPlayer & { card?: string; eligibility?: string | null };
export type MissionPool = { generatedAt: string; players: MissionPlayer[]; sheets: Sheets; complete: boolean; statsWindow: string };

// The pool is over Next's 2 MB cache limit in one piece (2.3 MB on 12 Oct 2026), which made every view of Home, Play and
// Missions download it from Neon again. Read as the pool without its sheets plus the sheets in SHEET_PARTS groups, each kept
// under the pool's write time (see readModelAt in lib/db.ts). A player's group is the first character code of the md5 of his
// key, the same in SQL and here, so pieces read from R2 (lib/r2.ts) and pieces read from Neon always fit together.
const SHEET_PARTS = 4;
export const sheetGroup = (key: string) => createHash("md5").update(key).digest("hex").charCodeAt(0) % SHEET_PARTS;
const poolPart = unstable_cache(
  async (part: number, updatedAt: string): Promise<unknown> => keptInDev(`missions_pool#${part}@${updatedAt}`, async () => {
    const whole = (await blockFromR2("missions_pool", updatedAt)) as MissionPool | undefined;
    if (whole) {
      const { players, ...rest } = whole.sheets;
      if (part < 0) return { ...whole, sheets: rest };
      return Object.fromEntries(Object.entries(players ?? {}).filter(([key]) => sheetGroup(key) === part));
    }
    const sql = database()!;
    const rows = (part < 0
      ? await sql`SELECT payload::jsonb #- '{sheets,players}' AS part FROM read_models WHERE key = 'missions_pool'`
      : await sql`SELECT COALESCE(jsonb_object_agg(e.key, e.value), '{}'::jsonb) AS part FROM read_models, jsonb_each(payload::jsonb #> '{sheets,players}') AS e
          WHERE read_models.key = 'missions_pool' AND ascii(md5(e.key)) % ${SHEET_PARTS} = ${part}`) as { part: unknown }[];
    return rows[0]?.part ?? null;
  }),
  ["mission-pool-part-v2"],
  { revalidate: 86400 },
);

/** When the pool was last written; five minutes, so a page view does not wake Neon each time. */
const writtenAt = cache(async (): Promise<string | null> => {
  const rows = (await database()!`SELECT updated_at FROM read_models WHERE key = 'missions_pool'`) as { updated_at: string | Date }[];
  return rows[0] ? stamp(rows[0].updated_at) : null;
}, ["mission-pool-written-v1"], { tags: [MISSIONS_TAG, "sorare"], revalidate: 300 });

async function read(): Promise<MissionPool | null> {
  if (database()) {
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
