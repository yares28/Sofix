import { describe, expect, it } from "vitest";
import { cardAnchor, cardHref, matchHref, matchOfCard, matchOfPlayer } from "./links";
import type { PlayerGame } from "./play";

const game = (kickoff: string, ffMatch?: { id: number; url: string }) => ({ kickoff, ffMatch }) as unknown as PlayerGame;
const player = (name: string, games: PlayerGame[], slug?: string) => ({ name, player: slug, games });

describe("where a link goes", () => {
  it("opens a player's tile on Cards and a match on Lineups", () => {
    expect(cardAnchor("pau-cubarsi")).toBe("p-pau-cubarsi");
    expect(cardHref("pau-cubarsi")).toBe("/cards#p-pau-cubarsi");
    expect(matchHref(22495)).toBe("/lineups?m=22495");
  });
});

describe("the match a card's game is", () => {
  const players = [
    player("Pau Cubarsí", [game("2026-10-10T16:30:00Z", { id: 22495, url: "u" }), game("2026-10-14T19:00:00Z", { id: 22510, url: "v" })], "pau-cubarsi"),
    player("Unai Simón", [game("2026-10-10T14:15:00Z")]),
    player("Oihan Sancet", [game("2026-10-11T14:15:00Z", { id: 22498, url: "w" })]),
  ];

  it("takes the game the card plays, by his player slug", () => {
    expect(matchOfCard({ player: "pau-cubarsi", name: "x", fixture: { kickoff: "2026-10-14T19:00:00Z" } }, players)).toBe(22510);
  });

  it("falls back to the first game it can name when the kickoff does not match", () => {
    expect(matchOfCard({ player: "pau-cubarsi", name: "x", fixture: { kickoff: null } }, players)).toBe(22495);
    expect(matchOfPlayer(players[0]!)).toBe(22495);
  });

  it("finds an older payload's player by his name", () => {
    expect(matchOfCard({ name: "Oihan Sancet", fixture: { kickoff: "2026-10-11T14:15:00Z" } }, players)).toBe(22498);
  });

  it("is null when Futbol Fantasy has no match page for his game (a national team, another league)", () => {
    expect(matchOfCard({ name: "Unai Simón", fixture: { kickoff: "2026-10-10T14:15:00Z" } }, players)).toBeNull();
    expect(matchOfCard({ name: "Nobody", fixture: null }, players)).toBeNull();
  });
});
