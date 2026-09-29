import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PlayingPlayer, Sorare } from "../../../../lib/play";

const TOKEN = "t".repeat(48);

const loadSorare = vi.fn<() => Promise<Sorare | null>>();
vi.mock("../../../../lib/playData", () => ({ loadSorare: () => loadSorare() }));
vi.mock("../../../../lib/api", () => ({ loadGrid: async () => ({ grid: null, meta: null, error: "no grid" }) }));

const { POST } = await import("./route");

const simon = {
  player: "unai-simon", name: "Unai Simón", pos: "GK", avatar: "", pic: "", crest: null, rarity: "limited", club: "Athletic Club",
  inSeason: true, cards: 1, p: 0.94, x: 54.5, average: 55, start: 56.1, bench: 0.8, pStart: 0.93, pOn: 0.01,
  games: [{ kickoff: "2026-10-10T19:00:00+00:00", competition: "laliga-es", opponent: "Getafe CF", opponentCrest: null, venue: "H" }],
} satisfies PlayingPlayer;

// Jan Oblak on 29 Sep: Slovenia at home to North Macedonia, priced by Sorare.
const oblak = {
  ...simon, player: "jan-oblak", name: "Jan Oblak", club: "Atlético Madrid",
  games: [{
    kickoff: "2026-10-10T18:45:00+00:00", competition: "uefa-nations-league", team: "Slovenia", opponent: "North Macedonia", opponentCrest: null, venue: "H",
    odds: { win: 0.56, draw: 0.27, loss: 0.17, cleanSheet: 0.556, difficulty: 35, label: "Very favourite", bucket: 1, source: "sorare" },
  }],
} satisfies PlayingPlayer;

const payload = {
  weeks: [{ gameweek: { id: "17", number: 17 }, playing: { players: [simon, oblak] } }],
  nextId: "17",
  collection: [{ slug: "unai-simon-2026-limited-12", player: "unai-simon" }],
} as unknown as Sorare;

const call = (body: unknown, headers: Record<string, string> = { authorization: `Bearer ${TOKEN}` }) =>
  POST(new NextRequest("http://localhost/api/ext/overlay", { method: "POST", headers, body: JSON.stringify(body) }));

beforeEach(() => {
  process.env.EXTENSION_TOKEN = TOKEN;
  loadSorare.mockReset().mockResolvedValue(payload);
});

describe("POST /api/ext/overlay", () => {
  it("answers the extension with the numbers for what it asked about, and never stores them", async () => {
    const response = await call({ cards: ["unai-simon-2026-limited-12"], players: [] });
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    const body = await response.json();
    expect(body).toMatchObject({
      ok: true,
      week: 17,
      cards: { "unai-simon-2026-limited-12": { x: 54.5, p: 0.94, average: 55, start: 56.1, bench: 0.8, pStart: 0.93, pOn: 0.01 } },
    });
  });

  it("carries Sofix's read of the game: Sorare's odds for a national-team game, nothing where none are priced", async () => {
    const body = await (await call({ cards: [], players: ["jan-oblak", "unai-simon"] })).json();
    expect(body.players["jan-oblak"].game).toEqual({ win: 0.56, cleanSheet: 0.556, goalsFor: null, difficulty: 35, bucket: 1, label: "Very favourite", source: "sorare" });
    expect(body.players["unai-simon"].game).toBeNull();
  });

  it("omits a slug it does not know", async () => {
    const body = await (await call({ cards: ["stranger-2026-limited-1"], players: ["nobody"] })).json();
    expect(body).toEqual({ ok: true, week: 17, cards: {}, players: {} });
  });

  it("turns away anyone without the extension's token, before it reads anything", async () => {
    const refused: Record<string, string>[] = [{}, { authorization: "Bearer wrong" }, { authorization: `Basic ${TOKEN}` }, { authorization: `Bearer ${TOKEN}x` }];
    for (const headers of refused) {
      expect((await call({ cards: [], players: [] }, headers)).status).toBe(401);
    }
    expect(loadSorare).not.toHaveBeenCalled();
  });

  it("turns everyone away when no token is configured", async () => {
    process.env.EXTENSION_TOKEN = "";
    expect((await call({ cards: [], players: [] }, { authorization: "Bearer " })).status).toBe(401);
  });

  it("refuses a call over the cap, and anything that is not a list of slugs", async () => {
    const many = Array.from({ length: 121 }, (_, i) => `card-${i}`);
    expect((await call({ cards: many, players: [] })).status).toBe(400);
    expect((await call({ cards: ["Not A Slug"], players: [] })).status).toBe(400);
    expect((await call("nonsense")).status).toBe(400);
    expect(loadSorare).not.toHaveBeenCalled();
  });

  it("says so when Sorare has never been synced", async () => {
    loadSorare.mockResolvedValue(null);
    expect((await call({ cards: [], players: [] })).status).toBe(503);
  });
});
