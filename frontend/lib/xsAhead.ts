import { z } from "zod";
import { cache } from "./cache";
import { published, readModel } from "./db";
import { SORARE_TAG } from "./play";
import { XsAheadSchema, type XsAhead } from "./xsAheadGames";

/** The server's reader of Sofix's xS ahead (shape and matching in lib/xsAheadGames.ts). */
const Block = z.object({ horizonDays: z.number(), players: XsAheadSchema });
const LEAGUES = ["LL", "PL", "BL1", "FL1", "EU"] as const;

/** The players asked for (one block per league, read once per write). Null before the job has written any. */
export async function loadXsAhead(players: string[]): Promise<XsAhead | null> {
  if (!published() || !players.length) return null;
  const read = (code: string) => cache(
    async (): Promise<XsAhead | null> => {
      const parsed = Block.safeParse((await readModel<unknown>(`xs_ahead:${code}`))?.payload);
      return parsed.success ? parsed.data.players : null;
    },
    ["xs-ahead-v1", code],
    { tags: [SORARE_TAG], revalidate: 3600 },
  )();
  try {
    const blocks = await Promise.all(LEAGUES.map(read));
    if (blocks.every((b) => b === null)) return null;
    const wanted = new Set(players);
    return Object.fromEntries(blocks.flatMap((b) => Object.entries(b ?? {}).filter(([slug]) => wanted.has(slug))));
  } catch (error) {
    console.error(`[xs ahead] could not be read: ${error instanceof Error ? error.message : "unknown"}`);
    return null;
  }
}
