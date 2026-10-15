import type { GameweekPlan } from "./play";
import type { Week } from "./weeks";

/** The three UEFA club competitions Season → Fixtures lists beside LaLiga. */
export const EUROPE: Record<string, string> = {
  "uefa-champions-league": "Champions League",
  "uefa-europa-league": "Europa League",
  "uefa-europa-conference-league": "Conference League",
};

export type Side = { name: string; crest: string | null };
export type EuropeGame = { key: string; competition: string; kickoff: string; home: Side; away: Side; players: number };

const at = (iso: string) => new Date(iso).getTime();

/**
 * The European games of a week, one row per match: only games one of your players plays in (the week's Sorare plan
 * lists exactly those), so a club with none of your players never shows. Two weeks can share one Sorare game week
 * (two LaLiga rounds); a game then belongs to the later of them that has started by its kickoff, so it shows once.
 */
export function europeGames(plan: GameweekPlan | null, week: Week, weeks: Week[]): EuropeGame[] {
  if (!plan || !week.gw) return [];
  const sharing = weeks.filter((other) => other.gw === week.gw).sort((a, b) => at(a.from) - at(b.from));
  const owner = (kickoff: string) => [...sharing].reverse().find((other) => at(other.from) <= at(kickoff)) ?? sharing[0];
  const games = new Map<string, EuropeGame & { who: Set<string> }>();
  for (const player of plan.playing.players) {
    for (const game of player.games) {
      if (!EUROPE[game.competition] || owner(game.kickoff)?.id !== week.id) continue;
      const mine: Side = { name: game.team ?? player.club ?? "", crest: game.teamCrest ?? player.crest };
      const theirs: Side = { name: game.opponent, crest: game.opponentCrest };
      const [home, away] = game.venue === "H" ? [mine, theirs] : [theirs, mine];
      const key = `${game.kickoff}|${[home.name, away.name].sort().join("|")}`;
      const seen = games.get(key);
      if (!seen) {
        games.set(key, { key, competition: EUROPE[game.competition]!, kickoff: game.kickoff, home, away, players: 0, who: new Set([player.player ?? player.name]) });
        continue;
      }
      // Both clubs hold one of your players: keep whichever crest each side reported.
      seen.home = { name: seen.home.name, crest: seen.home.crest ?? home.crest };
      seen.away = { name: seen.away.name, crest: seen.away.crest ?? away.crest };
      seen.who.add(player.player ?? player.name);
    }
  }
  return [...games.values()]
    .map(({ who, ...game }) => ({ ...game, players: who.size }))
    .sort((a, b) => a.kickoff.localeCompare(b.kickoff) || a.home.name.localeCompare(b.home.name));
}
