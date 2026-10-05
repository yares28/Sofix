import { gameweekMatches } from "./matches";
import type { PlayingPlayer } from "./play";
import type { FixtureGrid, GridTeam } from "./types";

/**
 * This week · LaLiga (plans/restructure.md, R4; canvas board "3 · This week · LaLiga"): the round from the board's own
 * forecast and the bookmakers' prices, reshaped only. Nothing here re-derives a backend number.
 */

const madridDay = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Madrid", weekday: "short" });

export type RoundSide = { team: GridTeam; win: number | null; xg: number | null; cleanSheet: number | null; market: number | null };
export type RoundGame = { fixtureId: number; kickoff: string; confirmed: boolean; score: string | null; home: RoundSide; away: RoundSide; draw: number | null; marketDraw: number | null };
export type RoundPick = { team: GridTeam; opponent: GridTeam; venue: "H" | "A"; value: number; win: number | null };

export type LaLigaRound = {
  /** How many of the owner's players have a game in this round, and how many on each day (Madrid time). */
  playing: number;
  days: { day: string; players: number }[];
  /** The five clubs with the most points to expect, and the five likeliest clean sheets. */
  kindest: RoundPick[];
  cleanSheets: RoundPick[];
  games: RoundGame[];
};

export function laligaRound(grid: FixtureGrid, column: number, players: PlayingPlayer[]): LaLigaRound {
  const md = grid.matchdays[column];
  const { matches } = gameweekMatches(grid, column);

  const games: RoundGame[] = matches.map((match) => {
    const h = match.homeCell.prediction;
    const a = match.awayCell.prediction;
    const m = match.homeCell.market ?? null;
    const result = match.homeCell.status === "finished" ? match.homeCell.result : null;
    return {
      fixtureId: match.fixtureId,
      kickoff: match.kickoff,
      confirmed: match.homeCell.date_confirmed,
      score: result ? `${result.goals_for}–${result.goals_against}` : null,
      home: { team: match.home, win: h?.probabilities.win ?? null, xg: h?.xg_for ?? null, cleanSheet: h?.clean_sheet ?? null, market: m?.win ?? null },
      away: { team: match.away, win: a?.probabilities.win ?? null, xg: a?.xg_for ?? null, cleanSheet: a?.clean_sheet ?? null, market: m?.loss ?? null },
      draw: h?.probabilities.draw ?? null,
      marketDraw: m?.draw ?? null,
    };
  });

  const sides = matches.flatMap((match) => [
    { team: match.home, opponent: match.away, venue: "H" as const, p: match.homeCell.prediction },
    { team: match.away, opponent: match.home, venue: "A" as const, p: match.awayCell.prediction },
  ]);
  const top = (value: (p: NonNullable<(typeof sides)[number]["p"]>) => number | null) =>
    sides
      .flatMap((side) => {
        const v = side.p ? value(side.p) : null;
        return v === null ? [] : [{ team: side.team, opponent: side.opponent, venue: side.venue, value: v, win: side.p?.probabilities.win ?? null }];
      })
      .sort((x, y) => y.value - x.value)
      .slice(0, 5);

  // The owner's players with a LaLiga game inside the round's dates.
  const from = md ? Date.parse(md.date_from) : 0;
  const to = md ? Date.parse(md.date_to) + 86_400_000 : 0;
  const byDay = new Map<string, number>();
  let playing = 0;
  for (const player of players) {
    const game = player.games.find((g) => /laliga/i.test(g.competition) && Date.parse(g.kickoff) >= from && Date.parse(g.kickoff) < to);
    if (!game) continue;
    playing += 1;
    const day = madridDay.format(new Date(game.kickoff));
    byDay.set(day, (byDay.get(day) ?? 0) + 1);
  }
  const order = [...new Set(games.map((g) => madridDay.format(new Date(g.kickoff))))];
  const days = [...byDay.entries()].sort(([a], [b]) => order.indexOf(a) - order.indexOf(b)).map(([day, n]) => ({ day, players: n }));

  return {
    playing,
    days,
    kindest: top((p) => p.expected_points),
    cleanSheets: top((p) => p.clean_sheet),
    games,
  };
}
