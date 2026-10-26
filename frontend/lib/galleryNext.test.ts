import { expect, it } from "vitest";
import { galleryDifficulty } from "./galleryNext";
import type { NextGame } from "./nextGame";
import type { FdrFixture } from "./arcadeFdr";

const kickoff = "2026-10-30T20:00:00Z";
const next: NextGame = { week: 27, kickoff, game: { kickoff, competition: "laliga-es", team: "Real Madrid", opponent: "Getafe CF", opponentCrest: null, venue: "A" }, chances: { list: [], used: null }, forecast: { x: 0, xd: 0 } };
const side = { code: "GET", name: "Getafe CF", difficulty: 0, bucket: 1 as const, label: "Very favourite", cleanSheet: null, xgFor: null, xgAgainst: null };
const fixture: FdrFixture = { league: "PD", kickoff, home: side, away: { ...side, name: "Real Madrid", code: "RMA", difficulty: 65 } };

it("uses the exact participating side's published FDR, preserving zero and forecast identity", () => {
  expect(galleryDifficulty(next, [fixture])).toEqual({ ...next, fdr: fixture.away });
  const home = { ...next, game: { ...next.game, team: "Getafe CF", opponent: "Real Madrid", venue: "H" as const } };
  expect(galleryDifficulty(home, [fixture]).fdr?.difficulty).toBe(0);
});
it("keeps missing, wrong competition, wrong clubs, national and wrong-time evidence unknown", () => {
  for (const game of [{ ...next.game, team: undefined }, { ...next.game, competition: "international" }, { ...next.game, team: "England" }, { ...next.game, kickoff: "2026-11-02T20:00:00Z" }]) {
    expect(galleryDifficulty({ ...next, game }, [fixture]).fdr).toBeUndefined();
  }
});
