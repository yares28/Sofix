import type { ArcadeLaLiga } from "./arcade";
import { loadLeagueMarket, loadSorare } from "./playData";

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
