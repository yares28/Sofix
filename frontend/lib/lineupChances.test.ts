import { describe, expect, it } from "vitest";
import recorded from "../e2e/fixtures/lineups-response.json";
import { lineupChances, recordedChances, recordedGames, sorareChanceRead, type ChancePlayer } from "./lineupChances";
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
  it("asks for the new extension when an older build answers with its empty custom query", () => {
    const link = { id: "Game:00000000-0000-0000-0000-000000000001", players: { mine: owned.id } };
    const legacy = { ok: true, state: "ok", native: undefined, data: { anyGame: { id: link.id, playerGameScores: [] } } };
    expect(sorareChanceRead(legacy, link)).toMatchObject({ state: "unavailable", values: {} });
  });
  it("keeps valid odds when another player is malformed and distinguishes an empty read from unmatched odds", () => {
    const link = { id: "Game:00000000-0000-0000-0000-000000000001", players: { mine: owned.id } };
    const row = (slug: string, n: number | null) => ({ anyPlayer: { slug }, anyPlayerGameStats: { footballPlayingStatusOdds: { starterOddsBasisPoints: n } } });
    const answer = (scores: unknown[], extra = {}) => ({ ok: true, state: "ok", native: true, data: { anyGame: { id: link.id, playerGameScores: scores } }, ...extra });
    expect(sorareChanceRead(answer([null, row("mine", 0)]), link)).toMatchObject({ state: "incomplete", values: { [owned.id]: { sorare: 0 } } });
    expect(sorareChanceRead(answer([row("mine", null)]), link)).toMatchObject({ state: "empty", checked: 1 });
    expect(sorareChanceRead(answer([]), link)).toMatchObject({ state: "no-players", checked: 0 });
    expect(sorareChanceRead(answer([row("other", 8000)]), link)).toMatchObject({ state: "unmatched" });
    expect(sorareChanceRead(answer([row("mine", 9000)], { incomplete: true }), link)).toMatchObject({ state: "incomplete", values: { [owned.id]: { sorare: 0.9 } } });
    expect(sorareChanceRead(answer([row("mine", 10001)]), link)).toMatchObject({ state: "incomplete" });
    expect(sorareChanceRead({ ok: true, state: "signed-out" }, link)).toMatchObject({ state: "signed-out" });
    expect(sorareChanceRead({ ok: true, state: "unseen" }, link)).toMatchObject({ state: "unseen", values: {} });
    expect(sorareChanceRead({ ok: true, state: "error", status: 429 }, link)).toMatchObject({ state: "rate-limited" });
    expect(sorareChanceRead({ ok: true, state: "rejected" }, link)).toMatchObject({ state: "error" });
    expect(sorareChanceRead(null, link)).toMatchObject({ state: "unavailable" });
  });
  it("links a signed-in source read to the exact recorded game and FF player", () => {
    const id = "Game:00000000-0000-0000-0000-000000000001";
    const records = [{ players: { [owned.yours!]: { games: [{ id, kickoff: match.kickoff!, ffMatch: { id: match.id }, ffPlayer: owned.id }] } } }];
    const linked = recordedGames([match], records)[match.id]!;
    expect(linked).toEqual({ id, players: { [owned.yours!]: owned.id } });
    const score = (slug: string, n: number | null) => ({ anyPlayer: { slug }, anyPlayerGameStats: { footballPlayingStatusOdds: n === null ? null : { starterOddsBasisPoints: n } } });
    const answer = { ok: true, state: "ok", native: true, data: { anyGame: { id, playerGameScores: [score(owned.yours!, 0), score("other-player", 9000)] } } };
    expect(sorareChanceRead(answer, linked)).toMatchObject({ state: "ready", values: { [owned.id]: { sorare: 0 } } });
    expect(sorareChanceRead({ ...answer, data: { anyGame: { id: "wrong", playerGameScores: [] } } }, linked)).toMatchObject({ state: "error", values: {} });
    expect(sorareChanceRead({ ...answer, data: { anyGame: { id, playerGameScores: [score(owned.yours!, null), score("other-player", 10001)] } } }, linked)).toMatchObject({ state: "incomplete", values: {} });
    expect(recordedGames([{ ...match, kickoff: "2000-01-01T00:00:00Z" }], records)).toEqual({});
  });
  it("keeps both captured sources after the optimizer moves to another GW, matching exact FF identities", () => {
    const games = [{ kickoff: match.kickoff!, ffMatch: { id: match.id }, ffPlayer: owned.id, sources: { sofix: 0.7, sorare: 0 } }];
    expect(recordedChances([match], [{ players: { x: { games } } }])[match.id]?.[owned.id]).toEqual({ sofix: 0.7, sorare: 0 });
    expect(recordedChances([{ ...match, id: 999 }], [{ players: { x: { games } } }])).toEqual({});
  });
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
