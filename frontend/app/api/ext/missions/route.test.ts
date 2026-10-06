import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const TOKEN = "t".repeat(48);

type Call = { text: string; values: unknown[] };
const calls: Call[] = [];
let stored: unknown = null;
let configured = true;
// A stand-in for Neon's tagged-template client: remembers what was written and answers the one SELECT.
const sql = async (strings: TemplateStringsArray, ...values: unknown[]) => {
  const text = strings.join("?");
  calls.push({ text, values });
  return text.includes("SELECT") ? (stored ? [{ payload: stored }] : []) : [];
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
});

describe("POST /api/ext/missions", () => {
  it("keeps the missions of the rarity the extension saw, beside the ones it saw before for another", async () => {
    stored = { rare: { missions: [], seen_at: "2026-10-03T10:00:00Z" } };
    const response = await call({ rarity: "limited", missions: [mission] });
    expect(response.status).toBe(200);
    const write = calls.find((c) => c.text.includes("INSERT"))!;
    const saved = JSON.parse(write.values[0] as string);
    expect(saved.rare.seen_at).toBe("2026-10-03T10:00:00Z");
    expect(saved.limited.missions).toEqual([{ ...mission, stats: [], appearances: [] }]); // an older build sends neither
    expect(typeof saved.limited.seen_at).toBe("string");
  });

  it("keeps the stats a mission counts and your picks with Sorare's verdict, drops a mission without a name, and keeps a day with none", async () => {
    const picks = [{ player: "jan-oblak", game: "Game:2", rarity: "limited", status: "SUCCESS" }];
    await call({ rarity: "limited", missions: [{ ...mission, stats: ["goals"], appearances: picks }, { ...mission, id: "t2", title: "" }] });
    const saved = JSON.parse(calls.find((c) => c.text.includes("INSERT"))!.values[0] as string);
    expect(saved.limited.missions).toEqual([{ ...mission, stats: ["goals"], appearances: picks }]);

    calls.length = 0;
    expect((await call({ rarity: "rare", missions: [] })).status).toBe(200);
    expect(JSON.parse(calls.find((c) => c.text.includes("INSERT"))!.values[0] as string).rare.missions).toEqual([]);

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
