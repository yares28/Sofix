import { unstable_cache } from "next/cache";
import { database, readModel } from "./db";
import type { ExtensionStatus, Limits, RunSummary, SystemStatus } from "./control";

/** Cache tag for the Control Center's data; revalidated with the grid when a refresh ends. */
export const SYSTEM_TAG = "system";

type SystemPayload = {
  odds_credits_remaining: number | null;
  odds_credits_at: string | null;
  database_bytes: number | null;
  database_limit_bytes: number;
};

type ExtensionPayload = { version: string; sorare_user: string | null; seen_at: string };

const iso = (value: string | Date | null) => (value instanceof Date ? value.toISOString() : value);

/** Recent runs, the limits the job published and the extension's last check-in. Cached like the grid. */
const cachedSystem = unstable_cache(
  async (): Promise<SystemStatus> => {
    const sql = database()!;
    const [result, system, extension] = await Promise.all([
      sql`SELECT id, trigger, status, started_at, finished_at FROM refresh_runs ORDER BY id DESC LIMIT 8`,
      readModel<SystemPayload>("system"),
      readModel<ExtensionPayload>("extension"),
    ]);
    const rows = result as {
      id: number;
      trigger: string;
      status: string;
      started_at: string | Date;
      finished_at: string | Date | null;
    }[];
    const runs: RunSummary[] = rows
      .map((row) => {
        const started = iso(row.started_at) as string;
        const finished = iso(row.finished_at);
        return {
          id: row.id,
          trigger: row.trigger,
          status: row.status,
          startedAt: started,
          finishedAt: finished,
          seconds: finished ? Math.round((Date.parse(finished) - Date.parse(started)) / 100) / 10 : null,
        };
      })
      .reverse();
    const limits: Limits | null = system
      ? {
          oddsCredits: system.payload.odds_credits_remaining,
          oddsCreditsAt: system.payload.odds_credits_at,
          databaseBytes: system.payload.database_bytes,
          databaseLimitBytes: system.payload.database_limit_bytes,
        }
      : null;
    const ext: ExtensionStatus | null = extension
      ? { version: extension.payload.version, sorareUser: extension.payload.sorare_user, seenAt: extension.payload.seen_at }
      : null;
    return { runs, limits, extension: ext };
  },
  ["system-status"],
  { tags: [SYSTEM_TAG], revalidate: 3600 },
);

export async function loadSystem(): Promise<SystemStatus | null> {
  if (!database()) return null;
  try {
    return await cachedSystem();
  } catch (error) {
    console.error(`[system] could not load: ${error instanceof Error ? error.name : "unknown error"}`);
    return null;
  }
}
