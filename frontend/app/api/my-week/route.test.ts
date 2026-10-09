import { NextRequest } from "next/server";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const saved = new Map<string, unknown>();
const end = "2026-10-06T14:00:00Z";
const sql = vi.fn(async (strings: TemplateStringsArray, ...values: unknown[]) => {
  const query = strings.join("?");
  if (query.includes("INSERT")) {
    const key = String(values[0]);
    if (!saved.has(key)) saved.set(key, JSON.parse(String(values[1])));
    return [];
  }
  return [...saved.values()].map((payload) => ({ payload }));
});
vi.mock("../../../lib/db", () => ({ database: () => sql }));
vi.mock("../../../lib/playData", () => ({ loadSorare: async () => ({
  timeline: [{ slug: "gw-old", number: 20, start: "2026-10-02T14:00:00Z", end }, { slug: "gw-live", number: 21, start: end, end: "2026-10-10T14:00:00Z" }],
  collection: [{ slug: "card-a", player: "player-a" }],
}) }));
vi.mock("next/cache", () => ({ revalidateTag: vi.fn(), unstable_cache: (fn: unknown) => fn }));
const { POST, GET } = await import("./route");
const lineup = { id: "lineup-1", name: "Mine", draft: false, confirmable: false, board: "board-1", competition: "LaLiga",
  result: { score: 300, rank: 3, cash: 2.5, essence: 250, card: false, xp: 100 },
  cards: [{ slug: "card-a", name: "Player A", picture: null, rarity: "limited", score: 70, captain: true, player: "untrusted-player" }] };
const call = (body: unknown = { slug: "gw-old", lineups: [lineup] }, same = true) => POST(new NextRequest("http://localhost/api/my-week", {
  method: "POST", headers: same ? { "x-fdr-refresh": "1", "sec-fetch-site": "same-origin" } : {}, body: JSON.stringify(body),
}));
beforeEach(() => { saved.clear(); sql.mockClear(); vi.useFakeTimers(); vi.setSystemTime(new Date("2026-10-08T14:00:00Z")); });
afterEach(() => vi.useRealTimers());

it("rejects cross-origin requests and invalid bodies before any write", async () => {
  expect((await call(undefined, false)).status).toBe(403);
  expect((await call({ slug: "../other", lineups: [] })).status).toBe(400);
  expect(saved.size).toBe(0);
});
it("waits for a known week to end more than a day ago and every entered lineup to rank", async () => {
  vi.setSystemTime(new Date("2026-10-07T14:00:00Z"));
  expect((await call()).status).toBe(409);
  vi.setSystemTime(new Date("2026-10-08T14:00:00Z"));
  expect((await call({ slug: "gw-live", lineups: [lineup] })).status).toBe(409);
  expect((await call({ slug: "unknown", lineups: [lineup] })).status).toBe(400);
  expect((await call({ slug: "gw-old", lineups: [{ ...lineup, result: { ...lineup.result, rank: null } }] })).status).toBe(409);
  expect(saved.size).toBe(0);
});
it("keeps complete lineups once, resolves player identity from the published collection and leaves drafts out", async () => {
  expect((await call({ slug: "gw-old", lineups: [lineup, { ...lineup, id: "draft", draft: true, result: null }] })).status).toBe(200);
  const first = saved.get("my_week:gw-old") as { lineups: typeof lineup[] };
  expect(first.lineups).toHaveLength(1);
  expect(first.lineups[0]!.cards[0]!.player).toBe("player-a");
  expect(first.lineups[0]!.result).toEqual(lineup.result);
  expect((await call({ slug: "gw-old", lineups: [{ ...lineup, result: { ...lineup.result, essence: 999 } }] })).status).toBe(200);
  expect(saved.get("my_week:gw-old")).toEqual(first);
  expect(sql.mock.calls.some(([parts]) => parts.join("").includes("ON CONFLICT (key) DO NOTHING"))).toBe(true);
});
it("lists unsaved finished weeks and accepts a complete read of a week with no entries", async () => {
  expect((await (await GET()).json()).pending.map((w: { slug: string }) => w.slug)).toEqual(["gw-old"]);
  expect((await call({ slug: "gw-old", lineups: [] })).status).toBe(200);
  const body = await (await GET()).json();
  expect(body.pending).toEqual([]);
  expect(body.weeks).toHaveLength(1);
});
