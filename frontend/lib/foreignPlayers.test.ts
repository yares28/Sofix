import { expect, it } from "vitest";
import { foreignMarket, playerBucket, type ForeignBlock } from "./foreignPlayers";
import type { Sorare } from "./play";

const now = Date.parse("2026-10-21T12:00:00Z");
const data = { nextId: "25", generatedAt: new Date(now).toISOString(), timeline: [{ id: "25", slug: "new-gw", lock: "2026-10-23T14:00:00Z" }, { id: "24", slug: "old-gw", lock: "2026-10-20T14:00:00Z" }] } as unknown as Sorare;
const block = { competition: "PL", weekId: "25", generatedAt: new Date(now).toISOString(), complete: true, modelVersion: "PL:xscore-v2", market: [{ slug: "foreign-player", name: "Foreign Player", pos: "DEF", club: "Arsenal", crest: null, average: 0, projection: null, eur: null, pic: "", pStart: 0, p: 0, x: 0 }] } as ForeignBlock;

it("retains genuine zeros and uses the index's own captured GW, never a later Sorare GW", () => {
  expect(foreignMarket(block, data, "25", null, null, now)[0]).toMatchObject({ x: 0, pStart: 0 });
  expect(foreignMarket({ ...block, weekId: "24" }, data, "25", null, null, now)[0]!.x).toBeUndefined();
  expect(foreignMarket(block, data, "24", null, null, now)[0]!.x).toBeUndefined();
});

it("expires future forecasts while retaining identity and restores only an exact saved past GW", () => {
  const stale = { ...block, generatedAt: "2026-10-19T11:00:00Z" };
  expect(foreignMarket(stale, data, "25", null, null, now)[0]).toMatchObject({ name: "Foreign Player", projection: null });
  expect(foreignMarket(stale, data, "25", null, null, now)[0]!.x).toBeUndefined();
  const record = { gameweek: { slug: "old-gw" }, players: { "foreign-player": { mu: 0, pPlay: 0, games: [{ kickoff: "2026-10-21T12:00:00Z", sofix: 0 }] } } };
  expect(foreignMarket(stale, data, "24", null, record, now)[0]!.x).toBe(0);
  expect(foreignMarket(stale, data, "24", null, { ...record, gameweek: { slug: "wrong-gw" } }, now)[0]!.x).toBeUndefined();
});

it("uses the same deterministic detail shard as the backend", () => {
  expect(playerBucket("player-0")).toBe("a");
});

it("does not draw Coach rows retained by an earlier source index", () => {
  const legacy = { ...block, market: [...block.market, { ...block.market[0], slug: "coach", pos: null }] } as unknown as ForeignBlock;
  expect(foreignMarket(legacy, data, "25", null, null, now).map(p => p.slug)).toEqual(["foreign-player"]);
});
