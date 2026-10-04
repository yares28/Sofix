// What the Players page needs about one player from the plans the job published (plans/xscore.md P9 X5b): who he is, his game and its numbers, and his next games.
import type { GameweekPlan, MarketPlayer, PlayerGame, PlayingPlayer, Sorare } from "./play";
import type { Position, Shape } from "./playerSheet";

export type Identity = { name: string; pos: Position | null; club: string | null; crest: string | null; pic: string | null };

/** "david-soria-solis" -> "David Soria Solis": only for a player nothing else names (accents are lost). */
export const nameFromSlug = (slug: string): string => slug.split("-").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");

/** The player in the plan being made, in any gameweek the job planned: the first one that has him with a game. */
export function planPlayer(data: Sorare, slug: string): PlayingPlayer | null {
  for (const week of data.weeks) {
    const found = week.playing.players.find((p) => p.player === slug);
    if (found && found.games.length) return found;
  }
  return null;
}

export function identityOf(slug: string, planned: PlayingPlayer | null, market: MarketPlayer | null): Identity {
  if (planned) return { name: planned.name, pos: planned.pos, club: planned.club, crest: planned.crest, pic: planned.pic };
  if (market) return { name: market.name, pos: market.pos, club: market.club, crest: market.crest, pic: market.pic };
  return { name: nameFromSlug(slug), pos: null, club: null, crest: null, pic: null };
}

export type NextGame = {
  gameweek: number;
  kickoff: string;
  opponent: string;
  crest: string | null;
  venue: "H" | "A";
  /** His score if he starts, and where he lands 8 times in 10 (the same for every game he has). */
  score: number;
  low: number | null;
  high: number | null;
  chance: number | null;
  game: PlayerGame;
};

/** His first game of a published week with the numbers the job made for it, or null when he has none in it. */
export function nextGameIn(plan: GameweekPlan, slug: string): NextGame | null {
  const p = plan.playing.players.find((one) => one.player === slug);
  const game = p?.games[0];
  if (!p || !game) return null;
  const shape: Shape | undefined = p.shape;
  return {
    gameweek: plan.gameweek.number,
    kickoff: game.kickoff,
    opponent: game.opponent,
    crest: game.opponentCrest,
    venue: game.venue,
    score: Math.round(typeof p.start === "number" ? p.start : p.x),
    low: shape ? shape.low : null,
    high: shape ? shape.high : null,
    chance: typeof p.pStart === "number" ? p.pStart : null,
    game,
  };
}
