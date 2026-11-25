import { cache } from "./cache";
import { published, readModel } from "./db";
import { SORARE_TAG } from "./play";
import {
  LEAGUES, pairTile, readable, readableClub, readablePairs, SQUADS_PAIR_PREFIX, SQUADS_PAIR_START_PREFIX, SQUADS_PAIRS_PREFIX,
  SQUADS_PAIRS_START_PREFIX, SQUADS_PREFIX, SQUADS_START_PREFIX, tile,
  type LeagueCode, type PairsBlock, type Season, type SquadClub, type SquadsBlock, type SquadsPage, type TeamMode, type Tile,
} from "./squads";

// Local development and the browser tests have no blocks: they ask the FastAPI stand-in instead.
const API_BASE = process.env.API_BASE_URL ?? "http://127.0.0.1:8000";

/** A published block, or the stand-in's answer for `path` locally. */
async function raw(key: string, path: string): Promise<unknown> {
  try {
    if (published()) return (await readModel(key))?.payload ?? null;
    const response = await fetch(`${API_BASE}/api/${path}`, { cache: "no-store", signal: AbortSignal.timeout(8000) });
    if (!response.ok) return null;
    const body = (await response.json()) as { success?: boolean; data?: unknown };
    return body.success ? body.data : null;
  } catch {
    return null;
  }
}

const block = async (code: LeagueCode, season: Season): Promise<SquadsBlock | null> =>
  readable(await raw(`${season === "start" ? SQUADS_START_PREFIX : SQUADS_PREFIX}${code}`, `squads/${code}${season === "start" ? "?season=start" : ""}`));

// A league's block passes 1.5 MB (the start of season's 38 rounds, 1.8 MB) while Next caches nothing over 2 MB: the club list
// and each club are cached apart, so every cached item stays small.
const league = cache(
  async (code: LeagueCode, season: Season): Promise<Omit<SquadsPage, "club" | "team"> | null> => {
    const b = await block(code, season);
    if (!b) return null;
    return {
      code,
      season,
      record: b.record,
      rounds: b.rounds,
      cardsOut: b.cardsOut,
      logo: b.logo,
      name: LEAGUES.find((l) => l.code === code)?.label ?? b.name,
      generatedAt: b.generatedAt,
      captain: b.captain,
      board: b.board,
      arenaLines: b.arenaLines,
      tiles: b.clubs.map(tile),
    };
  },
  ["squads-league-v3"],
  { tags: [SORARE_TAG], revalidate: 3600 },
);

const club = cache(
  async (code: LeagueCode, season: Season, name: string): Promise<SquadClub | null> =>
    (await block(code, season))?.clubs.find((c) => c.club === name) ?? null,
  ["squads-club-v3"],
  { tags: [SORARE_TAG], revalidate: 3600 },
);

// Two clubs: the pair list stays in its packed rows in the cache (1.5 MB for 190 pairs) and becomes tiles per request.
const pairs = cache(
  async (code: LeagueCode, season: Season): Promise<PairsBlock | null> =>
    readablePairs(await raw(`${season === "start" ? SQUADS_PAIRS_START_PREFIX : SQUADS_PAIRS_PREFIX}${code}`, `squads/${code}/pairs${season === "start" ? "?season=start" : ""}`)),
  ["squads-pairs-v2"],
  { tags: [SORARE_TAG], revalidate: 3600 },
);

const pair = cache(
  async (code: LeagueCode, season: Season, id: string): Promise<SquadClub | null> => {
    const key = `${season === "start" ? SQUADS_PAIR_START_PREFIX : SQUADS_PAIR_PREFIX}${code}:${id}`;
    const b = readable(await raw(key, `squads/${code}/pairs/${encodeURIComponent(id)}${season === "start" ? "?season=start" : ""}`));
    return b?.clubs[0] ?? null;
  },
  ["squads-pair-v2"],
  { tags: [SORARE_TAG], revalidate: 3600 },
);

/** Null until the first refresh (two clubs: the first night) writes the league, or when it cannot be read. Checked after the
 *  cache: an entry outlives a deploy. `pick` names the tile (club, or "A + B" for a pair) to open. */
export async function loadSquads(
  code: LeagueCode,
  season: Season,
  team: TeamMode,
  pick: (tiles: Tile[]) => string | undefined,
): Promise<SquadsPage | null> {
  if (team === "two") {
    const b = await pairs(code, season);
    if (!b) return null;
    const tiles = b.pairs.map(pairTile);
    const name = pick(tiles);
    const picked = tiles.find((t) => t.club === name);
    const id = picked?.pair?.id;
    const single = await league(code, season);
    return {
      alone: picked?.pair ? (single?.tiles ?? []).filter((t) => picked.pair!.clubs.includes(t.club)) : [],
      code, season, team, record: null, rounds: null, cardsOut: true, logo: b.logo,
      name: LEAGUES.find((l) => l.code === code)?.label ?? b.name,
      generatedAt: b.generatedAt, captain: b.captain, board: b.board, arenaLines: b.arenaLines, tiles,
      club: id ? readableClub(await pair(code, season, id)) : null,
    };
  }
  const page = await league(code, season);
  if (!page?.tiles) return null;
  const name = pick(page.tiles);
  return { ...page, team, club: name ? readableClub(await club(code, season, name)) : null };
}
