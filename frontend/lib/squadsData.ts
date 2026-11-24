import { cache } from "./cache";
import { published, readModel } from "./db";
import { SORARE_TAG } from "./play";
import { LEAGUES, readable, readableClub, SQUADS_PREFIX, tile, type LeagueCode, type SquadClub, type SquadsBlock, type SquadsPage } from "./squads";

// Local development and the browser tests have no blocks: they ask the FastAPI stand-in instead.
const API_BASE = process.env.API_BASE_URL ?? "http://127.0.0.1:8000";

async function block(code: LeagueCode): Promise<SquadsBlock | null> {
  try {
    if (published()) return readable((await readModel(`${SQUADS_PREFIX}${code}`))?.payload ?? null);
    const response = await fetch(`${API_BASE}/api/squads/${code}`, { cache: "no-store", signal: AbortSignal.timeout(8000) });
    if (!response.ok) return null;
    const body = (await response.json()) as { success?: boolean; data?: unknown };
    return body.success ? readable(body.data) : null;
  } catch {
    return null;
  }
}

// A league's block passes 1.5 MB (and grows with a season's rounds) while Next caches nothing over 2 MB: the club list and each
// club are cached apart, so every cached item stays small.
const league = cache(
  async (code: LeagueCode): Promise<Omit<SquadsPage, "club"> | null> => {
    const b = await block(code);
    if (!b) return null;
    return {
      code,
      name: LEAGUES.find((l) => l.code === code)?.label ?? b.name,
      generatedAt: b.generatedAt,
      captain: b.captain,
      board: b.board,
      arenaLines: b.arenaLines,
      tiles: b.clubs.map(tile),
    };
  },
  ["squads-league-v2"],
  { tags: [SORARE_TAG], revalidate: 3600 },
);

const club = cache(
  async (code: LeagueCode, name: string): Promise<SquadClub | null> => (await block(code))?.clubs.find((c) => c.club === name) ?? null,
  ["squads-club-v2"],
  { tags: [SORARE_TAG], revalidate: 3600 },
);

/** Null until the first refresh writes the league, or when it cannot be read. Checked after the cache: an entry outlives a deploy. */
export async function loadSquads(code: LeagueCode, pick: (tiles: SquadsPage["tiles"]) => string | undefined): Promise<SquadsPage | null> {
  const page = await league(code);
  if (!page?.tiles) return null;
  const name = pick(page.tiles);
  return { ...page, club: name ? readableClub(await club(code, name)) : null };
}
