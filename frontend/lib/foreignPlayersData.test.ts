import { beforeEach, expect, it, vi } from "vitest";
vi.mock("./cache", () => ({ cache: (fn: unknown) => fn }));
vi.mock("./db", () => ({ published: () => true, readModel: vi.fn() }));
import { readModel } from "./db";
import { loadForeignDirectory, loadForeignPlayer, loadLeaguePlayers } from "./foreignPlayersData";
import { loadLeagueMarket } from "./playData";
import { playerBucket } from "./foreignPlayers";
const player = { slug: "one-player", name: "One Player", club: "Arsenal", pic: "", league: "PL", pos: "DEF" };
beforeEach(() => vi.mocked(readModel).mockReset());
it.each(["PL", "BL1", "FL1", "CL", "EL", "CONF"])("resolves a cold %s bookmark through the directory and one bounded shard only", async code => {
  vi.mocked(readModel).mockImplementation(async key => ({ payload: key === "player_index" ? { players: [{ ...player, league: code }] } : { market: [player] } }) as never);
  await loadForeignPlayer(player.slug);
  expect(vi.mocked(readModel).mock.calls.map(c => c[0])).toEqual(["player_index", `players:${code}:${playerBucket(player.slug)}`]);
  vi.mocked(readModel).mockClear();
  expect(await loadForeignPlayer("../bad")).toBeNull();
  expect(readModel).not.toHaveBeenCalled();
});
it("filters coaches from an older directory using cached bounded league blocks until the next publication", async () => {
  const old = { ...player, pos: undefined };
  const coach = { ...old, slug: "a-coach", name: "Coach" };
  vi.mocked(readModel).mockImplementation(async key => ({ payload: key === "player_index" ? { players: [old, coach] } : { market: key === "players:PL" ? [player, { ...coach, pos: null }] : [] } }) as never);
  expect((await loadForeignDirectory())?.players.map(p => p.slug)).toEqual([player.slug]);
});
it("reads a league too big for one block from its 16 shards (Champions League, 21 Nov 2026)", async () => {
  vi.mocked(readModel).mockImplementation(async (...args: unknown[]) => { const key = String(args[0]); return { payload: key === "players:CL" ? { competition: "CL", market: [], shards: "0123456789abcdef" } : { market: [{ ...player, slug: `p-${key.slice(-1)}` }] } } as never; });
  const block = await loadLeaguePlayers("CL");
  expect(block?.market).toHaveLength(16);
  expect(block?.competition).toBe("CL");
  const market = await loadLeagueMarket("CL");
  expect(market.map(p => p.slug).sort()).toEqual([..."0123456789abcdef"].map(b => `p-${b}`).sort());
});
