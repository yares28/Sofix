import { NextRequest } from "next/server";
import { beforeEach, expect, it, vi } from "vitest";

const TOKEN = "t".repeat(48);
const RANKING = { start: { "*": [{ source: "sorare", error: 0.1, n: 500 }] }, score: {} };
vi.mock("../../../../lib/arcadeLaLiga", () => ({
  loadArcadeLaLiga: async () => ({ "ana:1": { p: 0.9 }, "bob:2": { p: 0.4 }, "ana-b:3": { p: 0.1 } }),
  loadArcadeRecords: async (players: string[]) => ({ ranking: RANKING, players: Object.fromEntries(players.map((p) => [p, { n: 10, s: 0.9, o: 0.05, x: 60, b: 40 }])) }),
}));
vi.mock("../../../../lib/sorareChances", () => ({ loadSavedChances: async (games: string[]) => Object.fromEntries(games.map((g) => [g, { ana: [9000, 1] }])) }));

const GAME = "Game:00000000-0000-0000-0000-000000000001";
const post = async (body: unknown, token = TOKEN) => {
  const { POST } = await import("./route");
  return POST(new NextRequest("http://localhost/api/ext/arcade", { method: "POST", headers: { authorization: `Bearer ${token}` }, body: JSON.stringify(body) }));
};
beforeEach(() => { process.env.EXTENSION_TOKEN = TOKEN; });

it("gives Sofix's numbers and start records for your cards' players only, and the saved start % of the board's games", async () => {
  const response = await post({ games: [GAME], players: ["ana"] });
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({
    ok: true, laliga: { "ana:1": { p: 0.9 } }, chances: { [GAME]: { ana: [9000, 1] } },
    records: { ranking: RANKING, players: { ana: { n: 10, s: 0.9, o: 0.05, x: 60, b: 40 } } },
  });
});

it("refuses a caller without the extension's token", async () => {
  expect((await post({ games: [], players: [] }, "x".repeat(48))).status).toBe(401);
});

it("refuses a body that is not games and player slugs", async () => {
  expect((await post({ games: ["nope"], players: [] })).status).toBe(400);
});
