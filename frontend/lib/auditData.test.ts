import { beforeEach, expect, it, vi } from "vitest";
import fixture from "../e2e/fixtures/audit-response.json";

vi.mock("./cache", () => ({ cache: (fn: unknown) => fn }));
vi.mock("./db", () => ({ database: () => ({}), readModel: vi.fn() }));
vi.mock("./missionLog", () => ({ loadMissionLog: vi.fn(), missionHistory: vi.fn(() => []) }));
import { readModel } from "./db";
import { loadMissionLog } from "./missionLog";
import { loadAudit } from "./auditData";

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(readModel).mockResolvedValue({ payload: structuredClone(fixture.data), updatedAt: "2026-10-24" });
  vi.mocked(loadMissionLog).mockResolvedValue([]);
});

it("Who starts reads its published numbers without downloading mission history", async () => {
  expect(await loadAudit(false)).not.toBeNull();
  expect(loadMissionLog).not.toHaveBeenCalled();
});

it("the default loader retains the mission result adjustment", async () => {
  expect(await loadAudit()).not.toBeNull();
  expect(loadMissionLog).toHaveBeenCalledOnce();
});
