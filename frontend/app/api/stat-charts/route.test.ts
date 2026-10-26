import { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("../../../lib/statChartsData", () => ({
  loadStatCharts: async () => ({
    asOf: "2026-10-25",
    keys: ["goals"],
    onSheet: {},
    players: [{ slug: "a", name: "A", pos: "FWD", league: "LaLiga", club: "Getafe", crest: null, card: "x.png", windows: { l5: { starts: 5, avg: 60, values: [1] }, cur: null } }],
  }),
}));
vi.mock("../../../lib/playData", () => ({ loadSorare: async () => ({ collection: [{ player: "a", pic: "mine.png", rarity: "limited", inSeason: true }] }) }));
const { GET } = await import("./route");
const get = (w: string) => GET(new NextRequest(`http://localhost/api/stat-charts?w=${w}`));

describe("GET /api/stat-charts", () => {
  it("hands out one window with your own card, cached for an hour", async () => {
    const res = await get("l5");
    expect(res.headers.get("cache-control")).toContain("s-maxage=3600");
    expect(await res.json()).toMatchObject({ window: "l5", players: [{ slug: "a", mine: true, card: "mine.png", starts: 5, values: [1] }] });
    expect((await (await get("cur")).json()).players).toEqual([]);
  });

  it("refuses an unknown window", async () => {
    expect((await get("l99")).status).toBe(400);
  });
});
