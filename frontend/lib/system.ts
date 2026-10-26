import { cache } from "./cache";
import { published, readModel } from "./db";
import { isDatabasePaused, type ExtensionStatus, type LeagueHistoryStatus, type Limits, type RunSummary, type SystemStatus } from "./control";

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

/** Recent runs, the limits the job published and the extension's last check-in, all from published blocks. Cached like the grid. */
const cachedSystem = cache(
  async (): Promise<SystemStatus> => {
    const [recent, system, extension, league] = await Promise.all([
      readModel<{ runs: unknown[] }>("refresh_runs"), // the jobs' last step publishes it (backend player_blocks.recent_runs)
      readModel<SystemPayload>("system"),
      readModel<ExtensionPayload>("extension"),
      readModel<LeagueHistoryStatus>("league_history_status"),
    ]);
    const rows = (recent?.payload.runs ?? []) as {
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
    return { runs, limits, extension: ext, leagueHistory: league?.payload ?? null };
  },
  ["system-status"],
  { tags: [SYSTEM_TAG], revalidate: 3600 },
);

export async function loadSystem(): Promise<SystemStatus | null> {
  if (!published()) return null;
  try {
    return await cachedSystem();
  } catch (error) {
    console.error(`[system] could not load: ${error instanceof Error ? error.name : "unknown error"}`);
    // Failures aren't cached, so while Neon is paused each view tries again; a refused connection costs no compute.
    if (error instanceof Error && isDatabasePaused(error.message)) return { runs: [], limits: null, extension: null, paused: true };
    return null;
  }
}
