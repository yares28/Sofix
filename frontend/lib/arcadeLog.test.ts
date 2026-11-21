import { describe, expect, it } from "vitest";
import { logBatch, mergeLog, type LogBatch } from "./arcadeLog";

const KICK = Date.parse("2026-11-28T17:30:00Z");
const lineup = (over: Partial<LogBatch["lineups"][number]> = {}): LogBatch["lineups"][number] => ({
  id: "L1", step: 4, target: 400, state: "pending", score: null, cancelled: false,
  cards: [{ slug: "c1", player: "p1", game: "Game:1", captain: true, score: null }],
  firstKickoff: new Date(KICK).toISOString(), lastKickoff: new Date(KICK).toISOString(), chance: 0.39, ...over,
});
const batch = (over: Partial<LogBatch> = {}): LogBatch => ({
  set: "divination", board: "b1", readAt: KICK - 3_600_000,
  steps: [{ number: 4, target: 400, state: "PLAYABLE", remaining: 2, max: 4 }], lineups: [lineup()], ...over,
});

describe("the Arcade lineup log (plans/arcade-trust.md step 8)", () => {
  it("keeps the chance Sofix gave a lineup when first seen before its first kick-off, never changed afterwards", () => {
    const first = mergeLog(null, batch(), KICK - 3_600_000);
    expect(first.lineups.L1).toMatchObject({ chance: 0.39, chanceAt: new Date(KICK - 3_600_000).toISOString(), step: 4, target: 400 });
    const again = mergeLog(first, batch({ readAt: KICK - 1_800_000, lineups: [lineup({ chance: 0.6 })] }), KICK - 1_800_000);
    expect(again.lineups.L1!.chance).toBe(0.39);
  });

  it("never records a chance first seen after kick-off", () => {
    const late = mergeLog(null, batch({ readAt: KICK + 60_000 }), KICK + 60_000);
    expect(late.lineups.L1!.chance).toBeNull();
    expect(late.lineups.L1).toMatchObject({ step: 4, target: 400 });
  });

  it("records the result once the lineup settles: cleared, missed or cancelled, from the newest read only", () => {
    const first = mergeLog(null, batch(), KICK - 3_600_000);
    const settled = KICK + 3 * 3_600_000;
    const won = mergeLog(first, batch({ readAt: settled, lineups: [lineup({ score: 412.5, state: "settled" })] }), settled);
    expect(won.lineups.L1).toMatchObject({ score: 412.5, result: "cleared" });
    const missed = mergeLog(first, batch({ readAt: settled, lineups: [lineup({ score: 310, state: "settled" })] }), settled);
    expect(missed.lineups.L1!.result).toBe("missed");
    const cancelled = mergeLog(first, batch({ readAt: settled, lineups: [lineup({ cancelled: true })] }), settled);
    expect(cancelled.lineups.L1!.result).toBe("cancelled");
    // An older read sent late does not undo a newer one.
    const stale = mergeLog(won, batch({ readAt: KICK - 7_200_000, lineups: [lineup({ score: 100 })] }), settled + 60_000);
    expect(stale.lineups.L1).toMatchObject({ score: 412.5, result: "cleared" });
  });

  it("keeps the board's steps and lives as last read, and each lineup apart by id", () => {
    const first = mergeLog(null, batch(), KICK - 3_600_000);
    const two = mergeLog(first, batch({ readAt: KICK - 1_000, steps: [{ number: 4, target: 400, state: "PLAYABLE", remaining: 1, max: 4 }], lineups: [lineup({ id: "L2" })] }), KICK - 1_000);
    expect(Object.keys(two.lineups).sort()).toEqual(["L1", "L2"]);
    expect(two.steps[0]!.remaining).toBe(1);
    expect(two.readAt).toBe(KICK - 1_000);
  });
});

describe("a read of the board for the log", () => {
  it("lists every entered lineup but drafts, with its kick-offs and the chance it is priced at", () => {
    const card = (kickoff: string) => ({ slug: "c", player: "p", game: "Game:1", captain: false, score: null, kickoff });
    const steps = [{ id: "s4", number: 4, target: 400, state: "PLAYABLE", lineups: { remaining: 2, max: 4 } }];
    const entered = new Map([["s4", [
      { id: "L1", state: "pending", score: null, cancelled: false, draft: false, cards: [card("2026-11-28T20:00:00Z"), card("2026-11-28T17:30:00Z")] },
      { id: "D1", state: "draft", score: null, cancelled: false, draft: true, cards: [] },
    ]]]);
    const read = logBatch("divination", "b1", steps, entered, () => 0.39, 1);
    expect(read.lineups).toHaveLength(1);
    expect(read.lineups[0]).toMatchObject({ id: "L1", step: 4, target: 400, chance: 0.39, firstKickoff: "2026-11-28T17:30:00Z", lastKickoff: "2026-11-28T20:00:00Z" });
    expect(read.steps).toEqual([{ number: 4, target: 400, state: "PLAYABLE", remaining: 2, max: 4 }]);
  });
});
