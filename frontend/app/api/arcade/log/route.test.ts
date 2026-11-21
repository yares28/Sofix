import { NextRequest } from "next/server";
import { beforeEach, expect, it, vi } from "vitest";

const saved: unknown[] = [];
vi.mock("../../../../lib/db", () => ({ database: () => ({}) }));
vi.mock("../../../../lib/arcadeLogStore", () => ({ saveLog: async (batch: unknown) => { saved.push(batch); return 1; } }));

const body = {
  set: "divination", board: "b1", readAt: Date.parse("2026-11-28T16:00:00Z"),
  steps: [{ number: 4, target: 400, state: "PLAYABLE", remaining: 2, max: 4 }],
  lineups: [{ id: "L1", step: 4, target: 400, state: "pending", score: null, cancelled: false, cards: [], firstKickoff: "2026-11-28T17:30:00Z", lastKickoff: "2026-11-28T17:30:00Z", chance: 0.39 }],
};
const post = async (json: unknown, site = "same-origin") => {
  const { POST } = await import("./route");
  return POST(new NextRequest("http://localhost/api/arcade/log", { method: "POST", headers: { "x-fdr-refresh": "1", "sec-fetch-site": site }, body: JSON.stringify(json) }));
};
beforeEach(() => { saved.length = 0; });

it("keeps a read of your Arcade lineups sent by the Arcade page", async () => {
  const response = await post(body);
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ ok: true, lineups: 1 });
  expect(saved).toHaveLength(1);
});

it("refuses another site and a body that is not a lineup read", async () => {
  expect((await post(body, "cross-site")).status).toBe(403);
  expect((await post({ ...body, set: "../x" })).status).toBe(400);
  expect(saved).toHaveLength(0);
});
