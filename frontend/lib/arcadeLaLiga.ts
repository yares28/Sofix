import type { ArcadeLaLiga } from "./arcade";
import { ArcadeRecordsSchema, type ArcadeRecords } from "./arcadeRecords";
import { cache } from "./cache";
import { published, readModel } from "./db";
import { SORARE_TAG } from "./play";
import { loadLeagueMarket, loadSorare } from "./playData";
import { loadXsAhead } from "./xsAhead";

const KEY = "arcade_outlook";

/**
 * Sofix's start % and xScore for each LaLiga, Premier League, Bundesliga, Ligue 1, Champions, Europa and Conference League player's
 * next game, keyed `player:kickoff` (cached per write, like Lineups). The Arcade page and the extension's dock (/api/ext/arcade) read it.
 */
export async function loadArcadeLaLiga(): Promise<ArcadeLaLiga> {
  const [sorare, ...leagues] = await Promise.all([loadSorare(), ...(["PL", "BL1", "FL1", "CL", "EL", "CONF"] as const).map((code) => loadLeagueMarket(code))]);
  return Object.fromEntries([...(sorare?.market ?? []), ...leagues.flat()].filter((p) => p.fixture?.kickoff).map((p) => [`${p.slug}:${Date.parse(p.fixture!.kickoff!)}`, {
    kickoff: p.fixture?.kickoff ?? null, p: p.pStart ?? null, source: p.startSource ?? null, sources: p.sources ?? {}, ffMatch: p.ffMatch, mu: p.mu ?? null, decisive: p.decisive ?? null, xd: p.xd ?? null,
  }]));
}

/**
 * Your cards' players' start records and the sources' ranking (read model `arcade_outlook`, about 0.4 MB for every player, read once
 * per write): only the players asked for go to the browser (plans/arcade-trust.md §4). Null before the job has written it.
 */
export async function loadArcadeRecords(players: string[]): Promise<ArcadeRecords | null> {
  if (!published() || !players.length) return null;
  const read = cache(
    async (): Promise<ArcadeRecords | null> => {
      const parsed = ArcadeRecordsSchema.safeParse((await readModel<unknown>(KEY))?.payload);
      return parsed.success ? parsed.data : null;
    },
    ["arcade-records-v1"],
    { tags: [SORARE_TAG], revalidate: 3600 },
  );
  try {
    const [all, ahead] = await Promise.all([read(), loadXsAhead(players)]);
    if (!all) return null;
    const wanted = new Set(players);
    // The calibration goes too (it was left out until 24 Nov 2026, so step 9's corrections never reached a card), and Sofix's xS for
    // each player's games ahead (plans/xs-ahead.md).
    return {
      ranking: all.ranking,
      players: Object.fromEntries(Object.entries(all.players).filter(([slug]) => wanted.has(slug))),
      ...(all.calibration ? { calibration: all.calibration } : {}),
      ...(ahead ? { ahead } : {}),
    };
  } catch (error) {
    console.error(`[arcade] records could not be read: ${error instanceof Error ? error.message : "unknown"}`);
    return null;
  }
}
