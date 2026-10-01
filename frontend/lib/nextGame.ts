import { SOURCE_SHORT, type GameweekPlan, type PlayerGame, type PlayingPlayer, type StartSource } from "./play";

/** The three sources of a chance to start, in the order the app trusts them. */
const ORDER: StartSource[] = ["futbolfantasy", "sorare", "sofix"];

export type SourceChances = { list: { source: StartSource; percent: number }[]; used: StartSource | null };

/**
 * What each source says of his chance to start his first game of a week, and which one the app uses. A payload with no split
 * ("sources") has his one chance; one with nothing has none.
 */
export function sourceChances(player: Pick<PlayingPlayer, "sources" | "pStart" | "startSource">): SourceChances {
  const said = player.sources ?? (player.pStart !== undefined && player.startSource ? { [player.startSource]: player.pStart } : {});
  const list = ORDER.flatMap((source) => (said[source] === undefined ? [] : [{ source, percent: Math.round(said[source]! * 100) }]));
  return { list, used: player.startSource ?? null };
}

export type NextGame = {
  /** The Sorare gameweek it is in. */
  week: number;
  kickoff: string;
  game: PlayerGame;
  chances: SourceChances;
};

/**
 * The game each player of yours plays next and his chance to start it, from every week the payload holds: the earliest game still to
 * come, whichever week it is in. A week's numbers are for his first game of it; for a later game only its own number, when Futbol
 * Fantasy gave one, stands. Keyed by his Sorare slug (his name where an older payload has none).
 */
export function nextGames(weeks: GameweekPlan[], now: Date): Map<string, NextGame> {
  const next = new Map<string, NextGame>();
  for (const week of weeks) {
    for (const player of week.playing.players) {
      const games = [...player.games].sort((a, b) => a.kickoff.localeCompare(b.kickoff));
      const index = games.findIndex((game) => new Date(game.kickoff).getTime() > now.getTime());
      if (index < 0) continue;
      const game = games[index]!;
      const key = player.player ?? player.name;
      const held = next.get(key);
      if (held && held.kickoff <= game.kickoff) continue;
      const chances =
        index === 0
          ? sourceChances(player)
          : game.pStart !== undefined && game.startSource
            ? { list: [{ source: game.startSource, percent: Math.round(game.pStart * 100) }], used: game.startSource }
            : { list: [], used: null };
      next.set(key, { week: week.gameweek.number, kickoff: game.kickoff, game, chances });
    }
  }
  return next;
}

const when = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Madrid", weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });

/** "v Getafe CF · Sat 18:30": the opponent (v home, @ away) and the kickoff in Madrid time. */
export function gameLine(game: Pick<PlayerGame, "venue" | "opponent" | "kickoff">): string {
  return `${game.venue === "H" ? "v" : "@"} ${game.opponent} · ${when.format(new Date(game.kickoff)).replace(",", "")}`;
}

/** The two letters each source is written with, as everywhere on screen. */
export const shortSource = (source: StartSource) => SOURCE_SHORT[source];
