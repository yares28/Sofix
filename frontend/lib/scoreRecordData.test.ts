import { beforeEach, expect, it, vi } from "vitest";
vi.mock("./cache", () => ({ cache: (fn: unknown) => fn }));
const query = vi.hoisted(() => vi.fn());
vi.mock("./db", () => ({ database: () => query, stamp: (at: string) => at, readModelAt: vi.fn() }));
import { readModelAt } from "./db";
import { scoreRecordPart } from "./scoreRecordParts";
import { loadScoreRecord } from "./scoreRecordData";

beforeEach(() => { query.mockReset(); vi.mocked(readModelAt).mockReset(); });

it("keeps a whole multi-league GW below the cache limit per piece without dropping identities or zero", async () => {
  const record = { gameweek: { slug: "football-current" }, scoreModels: { FL1: "validated" }, players: Object.fromEntries(Array.from({ length: 2300 }, (_, i) => [`player-${i}`, { mu: i === 0 ? 0 : null, games: [{ team: "Actual side", opponent: "Actual opponent", sofix: 0, evidence: "x".repeat(850) }] }])) };
  expect(JSON.stringify(record).length).toBeGreaterThan(2_000_000);
  query.mockResolvedValue([{ updated_at: "2026-10-22T18:00:00Z" }]);
  vi.mocked(readModelAt).mockImplementation(async (_key, _at, part) => scoreRecordPart(record, part!) as never);
  expect(await loadScoreRecord("football-current")).toEqual(record);
  expect(vi.mocked(readModelAt).mock.calls.map(c => c[2])).toEqual([-1, 0, 1, 2, 3]);
  for (const part of [-1, 0, 1, 2, 3]) expect(JSON.stringify(scoreRecordPart(record, part)).length).toBeLessThan(1_600_000);
});

it("does not turn a missing or partial selected-GW record into an empty or another week's score", async () => {
  query.mockResolvedValue([]);
  expect(await loadScoreRecord("football-missing")).toBeNull();
  expect(readModelAt).not.toHaveBeenCalled();
  query.mockResolvedValue([{ updated_at: "now" }]);
  vi.mocked(readModelAt).mockImplementation(async (_key, _at, part) => part === -1 ? { gameweek: { slug: "football-current" } } : part === 2 ? null : {});
  expect(await loadScoreRecord("football-current")).toBeNull();
  vi.mocked(readModelAt).mockClear();
  expect(await loadScoreRecord("../wrong")).toBeNull();
  expect(readModelAt).not.toHaveBeenCalled();
});
