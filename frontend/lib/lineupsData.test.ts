import { describe, expect, it, vi } from "vitest";

// What the previous deploy left in Next's data cache: the lineups as an older `readable` returned them (no `art`).
const left = { version: 1, cards: {}, failed: [], stopped: null, readAt: null, generatedAt: "", matches: [] };

vi.mock("next/cache", () => ({ unstable_cache: () => async () => left }));
vi.mock("./db", () => ({ database: () => null, readModel: async () => null }));

describe("loadLineups", () => {
  it("fills in what a cache entry written by an older deploy lacks, so a new field never reaches the page undefined", async () => {
    const { loadLineups } = await import("./lineupsData");
    const data = await loadLineups();

    expect(data?.art).toEqual({}); // the page reads art[id] for every player: the 1 Oct review's batch 4 took Lineups down with this
    expect(data?.matches).toEqual([]);
  });
});
