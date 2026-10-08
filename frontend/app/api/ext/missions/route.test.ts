import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const TOKEN = "t".repeat(48);

type Call = { text: string; values: unknown[] };
const calls: Call[] = [];
let stored: unknown = null;
let configured = true;
let owner: string | null = null;
// A stand-in for Neon's tagged-template client: remembers what was written and answers the one SELECT.
const sql = async (strings: TemplateStringsArray, ...values: unknown[]) => {
  const text = strings.join("?");
  calls.push({ text, values });
  if (text.includes("key = 'sorare'")) return owner ? [{ payload: { user: owner } }] : [];
  if (text.includes("SELECT")) return stored ? [{ payload: stored }] : [];
  stored = JSON.parse(values.find((v) => typeof v === "string" && v.startsWith("{")) as string);
  return [{ key: "missions" }];
};
vi.mock("../../../../lib/db", () => ({ database: () => (configured ? sql : null) }));
vi.mock("next/cache", () => ({ revalidateTag: vi.fn() }));
vi.mock("../../../../lib/missionLog", () => ({ recordQuietly: vi.fn() }));
vi.mock("next/server", async (actual) => ({ ...(await actual<typeof import("next/server")>()), after: vi.fn() }));

const { POST } = await import("./route");

const mission = { id: "t1", title: "Decisive Picker", description: "Earn 200 XP for each player you select", mode: "DECISIVE", picks: 3, made: 0, period: "DAILY", state: "READY" };
const call = (body: unknown, headers: Record<string, string> = { authorization: `Bearer ${TOKEN}` }) =>
  POST(new NextRequest("http://localhost/api/ext/missions", { method: "POST", headers, body: JSON.stringify(body) }));

beforeEach(() => {
  process.env.EXTENSION_TOKEN = TOKEN;
  calls.length = 0;
  stored = null;
  configured = true;
  owner = null;
});

describe("POST /api/ext/missions", () => {
  const batch = () => ({ version: 2, requestedAt: new Date().toISOString(), user: "owner", outcomes: Object.fromEntries(["limited", "rare", "super_rare", "unique"].map((r) => [r, { complete: true, missions: [] as (typeof mission)[] }])) });
  it("accepts empty only with complete rarity scopes, and rejects the wrong signed-in owner", async () => {
    const incomplete = batch(); delete incomplete.outcomes.rare;
    expect((await call(incomplete)).status).toBe(400);
    expect(stored).toBeNull();
    owner = "another-owner";
    expect((await call(batch())).status).toBe(403);
    expect(stored).toBeNull();
    owner = "owner";
    expect((await call(batch())).status).toBe(200);
    expect(stored).toMatchObject({ limited: { missions: [], verified: true }, rare: { missions: [], verified: true } });
  });
  it("does not let an older completed request replace a newer source snapshot", async () => {
    const newer = batch(); newer.outcomes.limited!.missions = [mission];
    await call(newer);
    await call({ ...batch(), requestedAt: new Date(Date.now() - 30_000).toISOString() });
    expect(stored).toMatchObject({ limited: { missions: [{ id: "t1" }] } });
  });
  it("keeps the missions of the rarity the extension saw, beside the ones it saw before for another", async () => {
    stored = { rare: { missions: [], seen_at: "2026-10-03T10:00:00Z" } };
    const response = await call({ rarity: "limited", missions: [mission] });
    expect(response.status).toBe(200);
    const saved = stored as { rare: { seen_at: string }; limited: { missions: unknown[]; seen_at: string } };
    expect(saved.rare.seen_at).toBe("2026-10-03T10:00:00Z");
    expect(saved.limited.missions).toEqual([{ ...mission, stats: [] }]);
    expect(typeof saved.limited.seen_at).toBe("string");
  });

  it("keeps verdicts, refuses malformed names and does not accept an unverified empty load", async () => {
    const picks = [{ player: "jan-oblak", game: "Game:2", rarity: "limited", status: "SUCCESS" }];
    await call({ rarity: "limited", missions: [{ ...mission, stats: ["goals"], appearances: picks }] });
    const saved = stored as { limited: { missions: unknown[] } };
    expect(saved.limited.missions).toEqual([{ ...mission, stats: ["goals"], appearances: picks }]);

    calls.length = 0;
    expect((await call({ rarity: "rare", missions: [] })).status).toBe(400);
    expect((await call({ rarity: "limited", missions: [{ ...mission, title: "" }] })).status).toBe(400);

    calls.length = 0;
    const tooMany = Array.from({ length: 11 }, () => picks[0]);
    expect((await call({ rarity: "limited", missions: [{ ...mission, appearances: tooMany }] })).status).toBe(400);
    expect(calls).toEqual([]);
  });

  it("turns away anyone without the token before it reads or writes anything", async () => {
    for (const headers of [{}, { authorization: "Bearer wrong" }] as Record<string, string>[]) {
      expect((await call({ rarity: "limited", missions: [] }, headers)).status).toBe(401);
    }
    expect(calls).toEqual([]);
  });

  it("refuses a rarity it does not know, a mission that is not whole and an oversized list", async () => {
    expect((await call({ rarity: "mythic", missions: [] })).status).toBe(400);
    expect((await call({ rarity: "limited", missions: [{ ...mission, mode: "OTHER" }] })).status).toBe(400);
    expect((await call({ rarity: "limited", missions: Array.from({ length: 13 }, () => mission) })).status).toBe(400);
    expect(calls).toEqual([]);
  });

  it("says so when there is no database", async () => {
    configured = false;
    expect((await call({ rarity: "limited", missions: [mission] })).status).toBe(503);
  });
});
