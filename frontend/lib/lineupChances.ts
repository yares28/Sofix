import type { LineupMatch, LineupPlayer } from "./lineups";
import { sourceChances } from "./nextGame";
import type { MarketPlayer, PlayingPlayer, StartSource } from "./play";

export type ChancePlayer = Pick<PlayingPlayer, "player" | "club" | "games" | "sources" | "pStart" | "startSource">;
export type MatchChances = Record<string, Partial<Record<StartSource, number>>>;
export type LineupChances = Record<string, MatchChances>;
export const CHANCE_SOURCES: Record<StartSource, string> = { futbolfantasy: "Futbol Fantasy", sorare: "Sorare", sofix: "Sofix" };

/** Join cached forecasts to this match only; then every other LaLiga player through his Futbol Fantasy link (`market`), so
 * Sofix's and Sorare's views have a number for players you don't own too. Your own cards' numbers come first. The source breakdown belongs to the first game of a week;
 * later games can only contribute their own published source. FF always comes from the lineup reading. */
export function lineupChances(matches: LineupMatch[], players: ChancePlayer[], market: MarketPlayer[] = []): LineupChances {
  const result: LineupChances = {};
  for (const forecast of players) {
    const games = [...forecast.games].sort((a, b) => a.kickoff.localeCompare(b.kickoff));
    games.forEach((game, index) => {
      const chances = sourceChances(index === 0 ? forecast : game).list.filter((one) => one.source !== "futbolfantasy");
      if (!chances.length) return;
      for (const match of matches) {
        for (const [side, venue] of [[match.home, "H"], [match.away, "A"]] as const) {
          const sameMatch = game.ffMatch
            ? game.ffMatch.id === match.id
            : match.competition === "laliga" && game.competition === "laliga-es" && side.club !== null &&
              forecast.club === side.club && game.venue === venue && match.kickoff !== null &&
              new Date(game.kickoff).getTime() === new Date(match.kickoff).getTime();
          if (!sameMatch) continue;
          for (const player of [...side.rows.flatMap((row) => row.players), ...side.alternatives]) {
            if (game.ffPlayer ? game.ffPlayer !== player.id : !player.yours || player.yours !== forecast.player) continue;
            const values = (result[match.id] ??= {})[player.id] ??= {};
            for (const { source, percent } of chances) values[source] ??= percent / 100;
          }
        }
      }
    });
  }
  for (const row of market) {
    if (!row.ffMatch || !row.ffPlayer || !row.sources) continue;
    const values = (result[row.ffMatch.id] ??= {})[row.ffPlayer] ??= {};
    for (const [source, p] of Object.entries(row.sources) as [StartSource, number][]) {
      if (source !== "futbolfantasy") values[source] ??= p;
    }
  }
  return result;
}

export type ChanceView = { source: StartSource; values: MatchChances; url: string };

export function chanceFor(player: LineupPlayer, view: ChanceView): number | null {
  return view.source === "futbolfantasy" ? player.p : view.values[player.id]?.[view.source] ?? null;
}

export const chancePercent = (p: number | null) => p === null ? "—" : `${Math.round(p * 100)}%`;
