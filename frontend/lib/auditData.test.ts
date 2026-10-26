import { beforeEach, expect, it, vi } from "vitest";
import fixture from "../e2e/fixtures/audit-response.json";

vi.mock("./cache", () => ({ cache: (fn: unknown) => fn }));
vi.mock("./db", () => ({ published: () => true, readModel: vi.fn() }));
vi.mock("./missionLog", () => ({ loadMissionLog: vi.fn(), missionHistory: vi.fn(() => []) }));
import { readModel } from "./db";
import { loadMissionLog, missionHistory } from "./missionLog";
import { loadAudit } from "./auditData";

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(readModel).mockResolvedValue({ payload: structuredClone(fixture.data), updatedAt: "2026-10-24" });
  vi.mocked(loadMissionLog).mockResolvedValue([]);
  vi.mocked(missionHistory).mockReturnValue([]);
});

it("Who starts reads its published numbers without downloading mission history", async () => {
  expect(await loadAudit(false)).not.toBeNull();
  expect(loadMissionLog).not.toHaveBeenCalled();
});

it("the default loader retains the mission result adjustment", async () => {
  expect(await loadAudit()).not.toBeNull();
  expect(loadMissionLog).toHaveBeenCalledOnce();
});

it("a saved correction updates the full chart record even outside its legacy thirty-row window", async () => {
  const payload = structuredClone(fixture.data);
  Object.assign(payload.missions, { overview: { rows: [{ id: "2026-09-01:limited:task", day: "2026-09-01", rarity: "limited", mission: "Goals", state: "checked", sofix: 0, best: 2, yours: 0, corrected: false }], emptyDays: 0 } });
  vi.mocked(readModel).mockResolvedValue({ payload, updatedAt: "2026-10-25" });
  vi.mocked(loadMissionLog).mockResolvedValue([{ days: { "2026-09-01": { limited: { missions: [], cands: [], loaded: true } } } }]);
  vi.mocked(missionHistory).mockReturnValue([{ day: "2026-09-01", key: "task", mission: "Goals", loaded: true, corrected: true, score: null, sofix: [], missed: [], yours: [{ slug: "a", name: "A", pic: "", state: "did" }] }]);
  const data = await loadAudit();
  expect(data?.missions.overview?.rows[0]).toMatchObject({ yours: 1, corrected: true, sofix: 0, best: 2 });
});
