import { afterEach, expect, it, vi } from "vitest";

const { blocks, read } = vi.hoisted(() => ({ blocks: new Map<string, unknown>(), read: vi.fn() }));
vi.mock("./cache", () => ({ cache: (fn: unknown) => fn }));
vi.mock("./db", () => ({ published: () => true, readModel: read }));
const { loadGrid, MESSAGES } = await import("./api");

function seed() {
  const scale = { cuts: [20, 40, 60, 80], higher_is_easier: false };
  const team = (code: string) => ({ code, name: code, color: "#ffffff", crest_url: null, cells: [] });
  blocks.set("grid:ALL", { payload: { success: true, team_blocks: ["grid:ALL:teams:0", "grid:ALL:teams:1"],
    data: { competition: "ALL", season: "2026/27", current_matchday: null, model_version: "combined", teams: [], matchdays: [],
      lens_scales: Object.fromEntries(["overall", "attack", "defence", "record", "market_record", "odds"].map(lens => [lens, scale])) } } });
  blocks.set("grid:ALL:teams:0", { payload: { teams: [team("AAA")] } });
  blocks.set("grid:ALL:teams:1", { payload: { teams: [team("BBB")] } });
  read.mockImplementation(async key => blocks.get(key) ?? null);
}
afterEach(() => { blocks.clear(); read.mockReset(); });

it("assembles every cached team block before validating the combined board", async () => {
  seed();
  const result = await loadGrid("ALL");
  expect(result.error).toBeNull();
  expect(result.grid?.teams.map(t => t.code)).toEqual(["AAA", "BBB"]);
  expect(read).toHaveBeenCalledTimes(3);
});

it("does not present a partial top forty when a published block is missing", async () => {
  seed();
  blocks.delete("grid:ALL:teams:1");
  expect(await loadGrid("ALL")).toEqual({ grid: null, meta: null, error: MESSAGES.unavailable });
});
