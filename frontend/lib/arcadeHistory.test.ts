import { afterEach, describe, expect, it, vi } from "vitest";
import { readDecisive, parseDecisive } from "./arcade";
import { askExtension, pingExtension } from "./extension";

vi.mock("./extension", () => ({ askExtension: vi.fn(), pingExtension: vi.fn(), extensionAtLeast: (a: string, b: string) => a >= b }));
const before = "2026-10-23T08:00:00.000Z";
const score = (i: number) => ({ scoreStatus: "FINAL", anyGame: { date: `2026-09-${String(i % 28 + 1).padStart(2, "0")}T12:00:00Z` }, anyPlayerGameStats: { minsPlayed: 90, gameStarted: 1 }, detailedScore: i % 2 ? [] : [{ stat: "goals", statValue: 1 }] });
const answer = (names: string[], more = false, n = 40) => ({ ok: true, state: "ok", data: Object.fromEntries(names.map((slug, i) => [`p${i}`, { slug, allPlayerGameScores: { nodes: Array.from({ length: n }, (_, j) => score(j)), pageInfo: { hasNextPage: more, endCursor: more ? "next-page" : null } } }])) });
afterEach(() => { vi.resetAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers(); });
function storage() {
  const kept = new Map<string, string>();
  vi.stubGlobal("localStorage", { getItem: (k: string) => kept.get(k) ?? null, setItem: (k: string, v: string) => kept.set(k, v) });
  vi.mocked(pingExtension).mockResolvedValue({ version: "0.4.17", sorareUser: "owner", appReachable: true });
}
describe("automatic mission history", () => {
  it("reads all 46 candidates in bounded named batches, pages short histories and reuses them until expiry", async () => {
    storage(); vi.useFakeTimers();
    const names = Array.from({ length: 46 }, (_, i) => `player-${i}`);
    vi.mocked(askExtension).mockImplementation(async (message) => {
      const m = message as { players: string[]; after: Record<string, string> };
      return m.players.includes("player-45") && !m.after["player-45"] ? answer(m.players, true, 10) : answer(m.players);
    });
    const rows = await readDecisive(names, before);
    expect(Object.keys(rows!)).toHaveLength(46);
    expect(rows!["player-45"]).toHaveLength(50);
    expect(vi.mocked(askExtension).mock.calls.every(([m]) => (m as { players: string[] }).players.length === 1)).toBe(true);
    const calls = vi.mocked(askExtension).mock.calls.length;
    await readDecisive(names, before); expect(askExtension).toHaveBeenCalledTimes(calls);
    vi.advanceTimersByTime(6 * 3600000 + 1);
    await readDecisive(names, before); expect(vi.mocked(askExtension).mock.calls.length).toBeGreaterThan(calls);
  });
  it("does not cache incomplete coverage and stops on navigation", async () => {
    storage();
    vi.mocked(askExtension).mockResolvedValue(answer([]));
    expect(await readDecisive(["a"], before)).toBeNull();
    const controller = new AbortController(); controller.abort();
    expect(await readDecisive(["a"], before, controller.signal)).toBeNull();
    expect(askExtension).toHaveBeenCalledTimes(1);
  });
  it("keeps missing actions unknown, ignores reviewing scores and normalizes numeric starts", () => {
    const x = score(1);
    const data = { p0: { slug: "a", allPlayerGameScores: { nodes: [x, { ...x, detailedScore: null }, { ...x, scoreStatus: "REVIEWING" }] } } };
    expect(parseDecisive(data).a).toMatchObject([{ stats: [], started: true }, { stats: null }]);
  });
});
