import { beforeEach, expect, it, vi } from "vitest";
import type { MonthLog } from "./missionLog";
const stored = new Map<string, MonthLog>();
let legacy: MonthLog = { days: {} };
vi.mock("./db", () => ({ database: () => async () => [{ key: "missions_log:2026-10", payload: legacy }] }));
vi.mock("./missionStore", () => ({ mergeMissionRecord: async (key: string, merge: (old: MonthLog | null) => MonthLog) => { const next = merge(stored.get(key) ?? null); stored.set(key, next); return next; } }));
vi.mock("./cache", () => ({ cache: (fn: unknown) => fn }));
const { DAILY_PICKER, recordHistoricalMissions } = await import("./missionLog");
beforeEach(() => { stored.clear(); legacy = { days: {} }; });
it("uses the source task's calendar date, keeps legacy forecasts and reconciles without duplicating the day", async () => {
  vi.useFakeTimers(); vi.setSystemTime(new Date("2026-10-09T12:00:00Z"));
  try {
    legacy = { days: { "2026-10-08": { limited: { loaded: false, cands: [{ s: "a", n: "A", pos: "MID", pic: "", g: "g", k: "2026-10-08T19:00:00Z", c: { [DAILY_PICKER.id]: 0.3 } }], missions: [{ key: DAILY_PICKER.id, title: DAILY_PICKER.title, description: "", mode: "DECISIVE", rule: { kind: "decisive", label: "" }, stats: [], picks: 3, sofix: ["a"], yours: [] }] } } } };
    const task = { ...DAILY_PICKER, id: "source-task", startDate: "2026-10-08T07:00:00Z", appearances: [{ player: "a", card: "sold-card", game: "g", rarity: "limited", status: "SUCCESS" }] };
    const outcomes = { limited: { missions: [task, { ...task, id: "undated", startDate: undefined }] } };
    expect(await recordHistoricalMissions(outcomes)).toBe(1);
    await recordHistoricalMissions(outcomes);
    const entry = stored.get("missions_day:2026-10-08:limited")!.days["2026-10-08"]!.limited!;
    expect(entry.missions).toHaveLength(1);
    expect(entry.missions[0]).toMatchObject({ key: "source-task", sofix: ["a"], aliases: [DAILY_PICKER.id], yours: [{ card: "sold-card", status: "SUCCESS" }] });
    expect(entry.cands[0]!.c["source-task"]).toBe(0.3);
    expect(stored.size).toBe(1);
  } finally { vi.useRealTimers(); }
});
