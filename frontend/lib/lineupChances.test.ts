import { describe, expect, it } from "vitest";
import recorded from "../e2e/fixtures/lineups-response.json";
import { lineupChances, type ChancePlayer } from "./lineupChances";
import { readable } from "./lineups";
import type { PlayerGame } from "./play";

const match = readable(recorded.data)!.matches.find((one) => one.id === 22502)!;
const owned = match.home.rows.flatMap((row) => row.players).find((one) => one.yours)!;
const game = (extra: Partial<PlayerGame> = {}): PlayerGame => ({
  kickoff: match.kickoff!, competition: "laliga-es", team: match.home.name,
  opponent: match.away.name, opponentCrest: null, venue: "H", ...extra,
});
const player = (extra: Partial<ChancePlayer> = {}): ChancePlayer => ({
  player: owned.yours, club: match.home.club, games: [game()],
  sources: { futbolfantasy: 0.9, sorare: 0, sofix: 0.64 }, ...extra,
});
const chances = (players: ChancePlayer[]) => lineupChances([match], players)[match.id]?.[owned.id];

describe("Lineups' source percentages", () => {
  it("gives every LaLiga player you don't own Sofix's and Sorare's chance through his FF link, after your own cards", () => {
    const stranger = match.away.rows.flatMap((row) => row.players)[0]!;
    const market = [
      { slug: "x", name: "X", pos: "FWD" as const, club: null, crest: null, average: 0, projection: null, eur: null, pic: "",
        sources: { futbolfantasy: 0.9, sofix: 0.55 }, ffMatch: { id: match.id, url: match.url }, ffPlayer: stranger.id },
      { slug: "y", name: "Y", pos: "FWD" as const, club: null, crest: null, average: 0, projection: null, eur: null, pic: "",
        sources: { sofix: 0.1 }, ffMatch: { id: match.id, url: match.url }, ffPlayer: owned.id },
    ];
    const all = lineupChances([match], [player()], market)[match.id];
    expect(all?.[stranger.id]).toEqual({ sofix: 0.55 });
    expect(all?.[owned.id]).toEqual({ sorare: 0, sofix: 0.64 });
  });

  it("joins the owner's exact LaLiga game, keeps zero and leaves Futbol Fantasy to its own reading", () => {
    expect(chances([player()])).toEqual({ sorare: 0, sofix: 0.64 });
  });

  it("uses the explicit FF match/player identity even when kickoff is TBC or the player is not owned", () => {
    const one = player({ player: undefined, games: [game({ ffMatch: { id: match.id, url: match.url }, ffPlayer: owned.id })] });
    expect(lineupChances([{ ...match, kickoff: null }], [one])[match.id]?.[owned.id]).toEqual({ sorare: 0, sofix: 0.64 });
  });

  it("does not borrow numbers from a national game, another kickoff, side, club or FF match", () => {
    for (const extra of [
      { competition: "nations-league", team: "Spain" },
      { kickoff: "2025-10-09T19:00:00Z" },
      { venue: "A" as const },
      { ffMatch: { id: 999, url: "https://www.futbolfantasy.com/partidos/999" } },
    ]) expect(chances([player({ games: [game(extra)] })])).toBeUndefined();
    expect(chances([player({ club: "BAR" })])).toBeUndefined();
    expect(lineupChances([{ ...match, kickoff: null }], [player()])[match.id]).toBeUndefined();
  });

  it("keeps a later game's own source and never copies the first game's source breakdown to it", () => {
    const earlier = game({ kickoff: "2026-01-01T19:00:00Z" });
    expect(chances([player({ games: [game({ pStart: 0.42, startSource: "sofix" }), earlier] })])).toEqual({ sofix: 0.42 });
    expect(chances([player({ games: [earlier, game()] })])).toBeUndefined();
  });

  it("accepts older single-source forecasts without inventing missing sources", () => {
    expect(chances([player({ sources: undefined, pStart: 0.3, startSource: "sorare" })])).toEqual({ sorare: 0.3 });
    expect(chances([player({ sources: undefined })])).toBeUndefined();
    expect(chances([])).toBeUndefined();
  });
});
