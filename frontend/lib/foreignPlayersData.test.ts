import { beforeEach, expect, it, vi } from "vitest";
vi.mock("./cache", () => ({ cache: (fn: unknown) => fn }));
vi.mock("./db", () => ({ database: () => true, readModel: vi.fn() }));
import { readModel } from "./db";
import { loadForeignDirectory, loadForeignPlayer } from "./foreignPlayersData";
import { playerBucket } from "./foreignPlayers";
const player = { slug: "one-player", name: "One Player", club: "Arsenal", pic: "", league: "PL", pos: "DEF" };
beforeEach(() => vi.mocked(readModel).mockReset());
it.each(["PL", "BL1", "FL1"])("resolves a cold %s bookmark through the directory and one bounded shard only", async code => {
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
