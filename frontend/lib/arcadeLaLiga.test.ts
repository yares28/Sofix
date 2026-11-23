import { describe, expect, it, vi } from "vitest";

const outlook = {
  ranking: { start: {}, score: {} },
  players: { a: { n: 10, s: 0.9, o: 0.05, x: 50, b: 40 }, z: { n: 10, s: 0.5, o: 0.1, x: 40, b: 40 } },
  calibration: { "laliga-es": { sorare: { points: [[0.1, 0.05], [0.9, 0.8]] } } },
};
const ahead = { a: [["2026-12-06T15:00:00Z", "laliga-es", "H", "Sevilla", 57.4, 44.1, 0.3]] };
vi.mock("./db", () => ({ published: () => true, readModel: async () => ({ payload: outlook }) }));
vi.mock("./cache", () => ({ cache: (fn: () => unknown) => fn }));
vi.mock("./playData", () => ({ loadSorare: async () => null, loadLeagueMarket: async () => [] }));
vi.mock("./xsAhead", () => ({ loadXsAhead: async (players: string[]) => Object.fromEntries(Object.entries(ahead).filter(([p]) => players.includes(p))) }));

describe("Arcade's records for the players asked", () => {
  it("carry the start calibration and Sofix's xS for their games ahead (24 Nov 2026: the calibration never reached a card)", async () => {
    const { loadArcadeRecords } = await import("./arcadeLaLiga");
    const records = await loadArcadeRecords(["a"]);
    expect(Object.keys(records!.players)).toEqual(["a"]);
    expect(records!.calibration).toEqual(outlook.calibration);
    expect(records!.ahead).toEqual(ahead);
  });
});
