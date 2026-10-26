import { beforeEach, expect, it, vi } from "vitest";

const { version, block } = vi.hoisted(() => ({ version: vi.fn(), block: vi.fn() }));
vi.mock("next/cache", () => ({ unstable_cache: (fn: unknown) => fn }));
vi.mock("./cache", () => ({ cache: (fn: unknown) => fn }));
vi.mock("./db", () => ({ published: () => true, readModel: vi.fn() }));
vi.mock("./r2", () => ({ blockVersion: version, blockAt: block }));
import { loadSorare, loadSorareSummary } from "./playData";

beforeEach(() => {
  version.mockReset().mockResolvedValue("v1");
  block.mockReset().mockResolvedValue({ updatedAt: "2026-10-24", payload: {
    collection: [{ slug: "card", pic: "actual-card.png" }], timeline: [{ id: "gw" }], weeks: [{ id: 1 }, { id: 2 }], market: { marker: "full-model-part" },
  } });
});

it("keeps real card art and the timeline without reading weekly models or market payloads", async () => {
  const data = await loadSorareSummary();
  expect(data?.collection).toEqual([{ slug: "card", pic: "actual-card.png" }]);
  expect(data?.timeline).toEqual([{ id: "gw" }]);
  expect(data?.weeks).toEqual([]);
  expect(data?.market).toBeUndefined();
  expect(version).toHaveBeenCalledTimes(1);
  expect(block).toHaveBeenCalledTimes(1); // the head only, even with two published weeks
});

it("preserves the existing full-model read for pages that need plans and player fixtures", async () => {
  const data = await loadSorare();
  expect(data?.weeks).toHaveLength(2);
  expect(data?.market).toEqual({ marker: "full-model-part" });
  expect(block).toHaveBeenCalledTimes(4); // head, market and each week: one download in production (lib/r2.ts)
});
