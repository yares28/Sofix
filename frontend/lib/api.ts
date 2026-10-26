import { cache } from "./cache";
import { isDatabasePaused } from "./control";
import { published, readModel } from "./db";
import { GRID_TAG } from "./refresh";
import { GridResponseSchema } from "./schema";
import type { FixtureGrid, GridMeta } from "./types";
import type { Competition } from "./competitions";

// Server-only: pages fetch on the server, so the API address never needs to reach the browser.
// Used by the typed API fallback and deterministic browser tests.
const API_BASE = process.env.API_BASE_URL ?? "http://127.0.0.1:8000";

// What visitors see. Details (status codes, validation issues) go to the server log only.
export const MESSAGES = {
  unavailable: "Fixture data is temporarily unavailable. Try again in a minute.",
  empty: "No fixtures have been loaded yet. They will appear after the next data refresh.",
  malformed: "The fixture data could not be read. It will be fixed with the next data refresh.",
  paused: "The database is paused until the 1st: the free plan's monthly limit ran out. The board comes back by itself.",
} as const;

export type Loaded = { grid: FixtureGrid; meta: GridMeta | null; error: null } | { grid: null; meta: null; error: string };

class GridUnavailable extends Error {}

function toGrid(json: unknown): { grid: FixtureGrid; meta: GridMeta | null } {
  const parsed = GridResponseSchema.safeParse(json);
  if (!parsed.success) {
    const issues = parsed.error.issues.slice(0, 5).map((issue) => `${issue.path.join(".")}: ${issue.message}`);
    console.error(`[fixture-grid] payload failed validation: ${issues.join("; ")}`);
    throw new GridUnavailable(MESSAGES.malformed);
  }
  const body = parsed.data;
  if (!body.success || !body.data) {
    console.error(`[fixture-grid] no grid: ${body.error ?? "empty response"}`);
    throw new GridUnavailable(MESSAGES.empty);
  }
  return { grid: body.data, meta: body.meta ?? null };
}

/**
 * The grid only changes when a refresh runs. Pages read its published R2 blocks (a local copy in development),
 * with the same envelope as the API; without published blocks the typed API supplies it instead.
 * Cached for an hour under the fixture-grid tag; the job's revalidate call refreshes it when a run ends.
 * Failures throw, so they are never cached. Shared by every page, so browsing between them costs nothing.
 */
const readGrid = async (competition: Competition): Promise<{ grid: FixtureGrid; meta: GridMeta | null }> => {
    if (published()) {
      const row = await readModel<{ data?: object; team_blocks?: string[] }>(competition === "PD" ? "grid" : `grid:${competition}`);
      if (!row) throw new GridUnavailable(MESSAGES.empty);
      if (competition === "ALL" && row.payload.team_blocks) {
        const parts = await Promise.all(row.payload.team_blocks.map(key => readModel<{ teams: FixtureGrid["teams"] }>(key)));
        if (parts.some(p => !p)) throw new GridUnavailable(MESSAGES.unavailable);
        row.payload = { ...row.payload, data: { ...row.payload.data, teams: parts.flatMap(p => p!.payload.teams) } };
      }
      const result = toGrid(row.payload);
      if ((result.grid.competition ?? "PD") !== competition) throw new GridUnavailable(MESSAGES.malformed);
      return result;
    }
    const response = await fetch(`${API_BASE}/api/fixture-grid${competition === "PD" ? "" : `?competition=${competition}`}`, { cache: "no-store", signal: AbortSignal.timeout(8000) });
    if (!response.ok) {
      console.error(`[fixture-grid] API answered ${response.status}`);
      throw new GridUnavailable(MESSAGES.unavailable);
    }
    const result = toGrid(await response.json());
    if ((result.grid.competition ?? "PD") !== competition) throw new GridUnavailable(MESSAGES.malformed);
    return result;
  };
const cachedGrid = cache(
  readGrid,
  ["fixture-grid"],
  { tags: [GRID_TAG], revalidate: 3600 },
);

export async function loadGrid(competition: Competition = "PD"): Promise<Loaded> {
  try {
    // Each All block is cached by version; its assembled season exceeds the per-item cache ceiling.
    const { grid, meta } = await (competition === "ALL" ? readGrid(competition) : cachedGrid(competition));
    return { grid, meta, error: null };
  } catch (error) {
    if (!(error instanceof GridUnavailable)) {
      console.error(`[fixture-grid] request failed: ${error instanceof Error ? error.name : "unknown error"}`);
    }
    if (error instanceof Error && isDatabasePaused(error.message)) return { grid: null, meta: null, error: MESSAGES.paused };
    return { grid: null, meta: null, error: error instanceof GridUnavailable ? error.message : MESSAGES.unavailable };
  }
}
