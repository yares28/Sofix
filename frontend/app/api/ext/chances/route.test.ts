import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { savedCoverage, savedLineupChances, type SavedChances } from "../../../../lib/sorareChances";

const TOKEN = "t".repeat(48);
const GAME = "Game:a313a797-15d2-4ab2-aa15-1285a9f6e986";
const OTHER = "Game:f4673b55-ea42-450e-aaa4-513e28971567";

type Call = { text: string; values: unknown[] };
const calls: Call[] = [];
let configured = true;
// A stand-in for Neon's tagged-template client: remembers each statement and its values.
const sql = async (strings: TemplateStringsArray, ...values: unknown[]) => {
  calls.push({ text: strings.join("?"), values });
  return [];
};
vi.mock("../../../../lib/db", () => ({ database: () => (configured ? sql : null) }));
const revalidateTag = vi.fn();
vi.mock("next/cache", () => ({ revalidateTag: (tag: string) => revalidateTag(tag), unstable_cache: (fn: unknown) => fn }));

const post = async (body: unknown, token = TOKEN) => {
  const { POST } = await import("./route");
  return POST(new NextRequest("http://localhost/api/ext/chances", { method: "POST", headers: { authorization: `Bearer ${token}` }, body: JSON.stringify(body) }));
};
const row = (player: string, basisPoints: number, game = GAME) => ({ game, player, basisPoints });

beforeEach(() => {
  calls.length = 0;
  configured = true;
  revalidateTag.mockClear();
  process.env.EXTENSION_TOKEN = TOKEN;
});

describe("POST /api/ext/chances", () => {
  it("saves one row per game, keeps a true zero, and never reads the row it adds to", async () => {
    const response = await post({ version: 1, rows: [row("a", 8000), row("b", 0), row("a", 2500, OTHER)] });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true, games: 2, players: 3 });
    expect(calls).toHaveLength(2);
    expect(calls.every((call) => call.text.includes("ON CONFLICT (key) DO UPDATE") && !/^\s*SELECT/.test(call.text))).toBe(true);
    expect(calls[0]?.values[0]).toBe(`sorare_chances:${GAME}`);
    const saved = JSON.parse(calls[0]?.values[1] as string) as { players: Record<string, [number, number]> };
    expect(saved.players.a?.[0]).toBe(8000);
    expect(saved.players.b?.[0]).toBe(0);
    expect(Math.abs((saved.players.a?.[1] ?? 0) - Date.now() / 1000)).toBeLessThan(5);
    expect(JSON.parse(calls[1]?.values[1] as string).players).toMatchObject({ a: [2500, expect.any(Number)] });
    expect(revalidateTag).toHaveBeenCalledWith("sorare-chances");
  });

  it("refuses a wrong token, a made-up game, a percentage over 100 and an empty list, and writes nothing", async () => {
    expect((await post({ version: 1, rows: [row("a", 8000)] }, "x".repeat(48))).status).toBe(401);
    expect((await post({ version: 1, rows: [row("a", 8000, "Game:nope")] })).status).toBe(400);
    expect((await post({ version: 1, rows: [row("a", 10001)] })).status).toBe(400);
    expect((await post({ version: 1, rows: [] })).status).toBe(400);
    expect((await post({ version: 1, rows: [{ game: GAME, player: "a", basisPoints: null }] })).status).toBe(400);
    expect(calls).toHaveLength(0);
  });

  it("says so when there is no database", async () => {
    configured = false;
    expect((await post({ version: 1, rows: [row("a", 8000)] })).status).toBe(503);
  });
});

describe("kept Sorare chances on Lineups", () => {
  const saved: SavedChances = { [GAME]: { oyarzabal: [8000, 1_800_000_000], kubo: [0, 1_800_000_100], stranger: [5000, 1_800_000_000] }, [OTHER]: { oyarzabal: [1000, 1_800_000_000] } };
  const links = { 77: { id: GAME, players: { oyarzabal: "ff-1", kubo: "ff-2" } }, 78: { id: "Game:00000000-0000-0000-0000-000000000000", players: { oyarzabal: "ff-1" } } };

  it("joins by exact game and player: zero stays zero, another game's number is never borrowed, an unlinked player is left out", () => {
    expect(savedLineupChances(saved, links)).toEqual({ 77: { "ff-1": { sorare: 0.8 }, "ff-2": { sorare: 0 } } });
  });

  it("counts what is kept for the matches on the page", () => {
    expect(savedCoverage(saved, links)).toEqual({ players: 3, games: 1, at: new Date(1_800_000_100_000).toISOString() });
    expect(savedCoverage({}, links)).toEqual({ players: 0, games: 0, at: null });
  });
});
