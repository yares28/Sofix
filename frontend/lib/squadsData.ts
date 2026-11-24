import { cache } from "./cache";
import { published, readModel } from "./db";
import { SORARE_TAG } from "./play";
import { LEAGUES, readable, SQUADS_PREFIX, tile, type LeagueCode, type SquadsBlock, type SquadsPage } from "./squads";

// Local development and the browser tests have no blocks: they ask the FastAPI stand-in instead.
const API_BASE = process.env.API_BASE_URL ?? "http://127.0.0.1:8000";

const cached = cache(
  async (code: LeagueCode): Promise<unknown> => {
    if (published()) return (await readModel(`${SQUADS_PREFIX}${code}`))?.payload ?? null;
    const response = await fetch(`${API_BASE}/api/squads/${code}`, { cache: "no-store", signal: AbortSignal.timeout(8000) });
    if (!response.ok) return null;
    const body = (await response.json()) as { success?: boolean; data?: unknown };
    return body.success ? body.data : null;
  },
  ["squads-v1"],
  { tags: [SORARE_TAG], revalidate: 3600 },
);

/** Null until the first refresh writes the league, or when it cannot be read. Checked after the cache: an entry outlives a deploy. */
export async function loadSquads(code: LeagueCode, pick: (tiles: SquadsPage["tiles"]) => string | undefined): Promise<SquadsPage | null> {
  let block: SquadsBlock | null = null;
  try {
    block = readable(await cached(code));
  } catch {
    block = null;
  }
  if (!block) return null;
  const tiles = block.clubs.map(tile);
  const name = pick(tiles);
  const picked = block.clubs.find((c) => c.club === name) ?? null;
  return {
    code,
    name: LEAGUES.find((l) => l.code === code)?.label ?? block.name,
    generatedAt: block.generatedAt,
    captain: block.captain,
    board: block.board,
    arenaLines: block.arenaLines,
    tiles,
    club: picked,
  };
}
