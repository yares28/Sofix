import { NextRequest } from "next/server";
import { beforeEach, expect, it, vi } from "vitest";
import type { MissionEdits } from "../../../../lib/missionEdits";
import type { MonthLog } from "../../../../lib/missionLog";
let edits: MissionEdits | null = null;
let ledger: MonthLog | null = null;
const merge = vi.fn(async (key: string, fn: (x: never) => unknown) => key.startsWith("missions_day:") ? (ledger = fn(ledger as never) as MonthLog) : (edits = fn(edits as never) as MissionEdits));
vi.mock("../../../../lib/missionStore", () => ({ mergeMissionRecord: (...args: [string, (x: MissionEdits | null) => MissionEdits]) => merge(...args) }));
vi.mock("../../../../lib/db", () => ({ database: () => async () => [{ key: "missions_day:2026-10-06:limited", payload: { days: { "2026-10-06": { limited: { missions: [{ key: "picker", picks: 1 }] } } } } }] }));
vi.mock("next/cache", () => ({ revalidateTag: vi.fn(), unstable_cache: (fn: unknown) => fn }));
const { POST } = await import("./route");
const body = { day: "2026-10-06", rarity: "limited", mission: "picker", picks: [{ player: "jan-oblak", card: "oblak-1", game: "g", rarity: "limited", status: "SUCCESS" }], revision: 0, restore: false, note: "My selection" };
const call = (input: unknown = body, same = true) => POST(new NextRequest("http://localhost/api/missions/history", { method: "POST", headers: same ? { "x-fdr-refresh": "1", "sec-fetch-site": "same-origin" } : {}, body: JSON.stringify(input) }));
beforeEach(() => { edits = null; ledger = null; merge.mockClear(); });
it("materializes a displayed missing day before saving its correction", async () => {
  vi.useFakeTimers(); vi.setSystemTime(new Date("2026-10-08T12:00:00Z"));
  try {
    expect((await call({ ...body, day: "2026-10-07", mission: "daily-decisive-picker" })).status).toBe(200);
    expect(ledger!.days["2026-10-07"]!.limited!.missions[0]!.key).toBe("daily-decisive-picker");
    expect(edits!.edits["daily-decisive-picker"]!.picks).toHaveLength(1);
  } finally { vi.useRealTimers(); }
});
it("rejects cross-origin writes before touching storage", async () => { expect((await call(body, false)).status).toBe(403); expect(merge).not.toHaveBeenCalled(); });
it("stores a user report separately and refuses a stale revision", async () => {
  expect((await call()).status).toBe(200);
  expect(edits!.edits.picker!.picks[0]!.status).toBeNull();
  expect((await call()).status).toBe(409);
});
it("validates mission capacity and rarity", async () => {
  expect((await call({ ...body, picks: [body.picks[0], body.picks[0]] })).status).toBe(400);
  expect((await call({ ...body, mission: "unknown" })).status).toBe(400);
  expect((await call({ ...body, picks: [{ ...body.picks[0], rarity: "rare" }] })).status).toBe(400);
});
