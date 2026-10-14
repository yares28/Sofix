import { describe, expect, it, vi } from "vitest";
import type { MonthLog } from "./missionLog";

// The index and rows as Neon holds them: two days of rows, the October month log and one edit.
const rows: Record<string, unknown> = {
  "missions_day:2026-10-14:limited": { days: { "2026-10-14": { limited: { loaded: true, cands: [], missions: [{ key: "a", title: "today" }] } } } },
  "missions_day:2026-10-13:limited": { days: { "2026-10-13": { limited: { loaded: true, cands: [], missions: [{ key: "b", title: "yesterday" }] } } } },
  "missions_log:2026-10": { days: { "2026-10-14": { rare: { loaded: true, cands: [], missions: [] } } } },
  "missions_edit:2026-10-14:limited": { day: "2026-10-14", rarity: "limited", edits: { a: { revision: 2 } } },
};
const read: string[] = [];
vi.mock("next/cache", () => ({ unstable_cache: (fn: unknown) => fn }));
vi.mock("./db", () => ({
  database: () => async () => Object.keys(rows).map((key) => ({ key, updated_at: "2026-10-14T00:00:00Z" })),
  readModelAt: async (key: string) => (read.push(key), rows[key]),
  stamp: (at: string) => at,
}));

describe("loadMissionLogDay", () => {
  it("reads only the rows that can hold the day, and gives that day what the whole log gives it", async () => {
    const { loadMissionLog, loadMissionLogDay } = await import("./missionLog");
    const day = await loadMissionLogDay("2026-10-14");
    expect(read.sort()).toEqual(["missions_day:2026-10-14:limited", "missions_edit:2026-10-14:limited", "missions_log:2026-10"]);

    const entry = (logs: MonthLog[]) => logs.reduce<unknown>((found, log) => log.days["2026-10-14"]?.limited ?? found, undefined);
    expect(entry(day)).toEqual(entry(await loadMissionLog()));
    expect(entry(day)).toMatchObject({ missions: [{ key: "a", editRevision: 2 }] });
  });
});
