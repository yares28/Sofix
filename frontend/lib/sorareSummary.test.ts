import { beforeEach, expect, it, vi } from "vitest";

const { sql } = vi.hoisted(() => ({ sql: vi.fn() }));
vi.mock("next/cache", () => ({ unstable_cache: (fn: unknown) => fn }));
vi.mock("./cache", () => ({ cache: (fn: unknown) => fn }));
vi.mock("./db", () => ({ database: () => sql, stamp: (at: unknown) => at, keptInDev: (_key: string, fn: () => unknown) => fn(), readModel: vi.fn() }));
vi.mock("./r2", () => ({ blockFromR2: async () => undefined }));
import { loadSorare, loadSorareSummary } from "./playData";

beforeEach(() => {
  sql.mockReset();
  sql.mockImplementation(async (query: TemplateStringsArray) => {
    if (query.join("").includes("SELECT updated_at")) return [{ updated_at: "2026-10-24" }];
    if (query.join("").includes("json_array_length")) return [{ part: { collection: [{ slug: "card", pic: "actual-card.png" }], timeline: [{ id: "gw" }] }, weeks: 2 }];
    return [{ part: { marker: "full-model-part" } }];
  });
});

it("keeps real card art and the timeline without reading weekly models or market payloads", async () => {
  const data = await loadSorareSummary();
  expect(data?.collection).toEqual([{ slug: "card", pic: "actual-card.png" }]);
  expect(data?.timeline).toEqual([{ id: "gw" }]);
  expect(data?.weeks).toEqual([]);
  expect(data?.market).toBeUndefined();
  expect(sql).toHaveBeenCalledTimes(2); // timestamp and head only, even with two published weeks
});

it("preserves the existing full-model read for pages that need plans and player fixtures", async () => {
  const data = await loadSorare();
  expect(data?.weeks).toHaveLength(2);
  expect(data?.market).toEqual({ marker: "full-model-part" });
  expect(sql).toHaveBeenCalledTimes(5);
});
