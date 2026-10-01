import type { PlayCard, PlayingPlayer } from "./play";

/** The id of a player's tile on the Cards page, which his link there names. */
export const cardAnchor = (player: string) => `p-${player}`;
export const cardHref = (player: string) => `/cards#${cardAnchor(player)}`;
export const matchHref = (match: number) => `/lineups?m=${match}`;

type Playing = Pick<PlayingPlayer, "name" | "games"> & { player?: string };

/** The Lineups match of the first game of his that Futbol Fantasy has a page for; null for a national team or another league. */
export function matchOfPlayer(player: Pick<PlayingPlayer, "games">): number | null {
  return player.games.find((game) => game.ffMatch)?.ffMatch?.id ?? null;
}

/**
 * The Lineups match a lineup card plays in. A card names his player by slug (an older payload does not: his name then), and the
 * week's playing players hold his games, so the game on the card's kickoff gives the match.
 */
export function matchOfCard(card: Pick<PlayCard, "name" | "player"> & { fixture: { kickoff: string | null } | null }, players: Playing[]): number | null {
  const found = players.find((one) => (card.player && one.player ? one.player === card.player : one.name === card.name));
  if (!found) return null;
  const kickoff = card.fixture?.kickoff;
  const same = kickoff ? found.games.find((game) => game.kickoff === kickoff && game.ffMatch) : undefined;
  return same?.ffMatch?.id ?? matchOfPlayer(found);
}
