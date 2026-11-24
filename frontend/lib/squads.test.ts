import { describe, expect, it } from "vitest";
import { choice, ladder, ranked, tier, within, type Tile } from "./squads";

const BOARD = [{ target: 320, cash: 0, essence: 500 }, { target: 360, cash: 5, essence: 0 }, { target: 380, cash: 10, essence: 0 }];

describe("within", () => {
  it("takes the last frontier entry whose budget fits, none when even the cheapest does not", () => {
    const lane = [{ id: 0, from: 10 }, { id: 1, from: 20 }, { id: 2, from: 30 }];
    expect(within(lane, 25)?.id).toBe(1);
    expect(within(lane, 30)?.id).toBe(2);
    expect(within(lane, 9)).toBeNull();
  });
});

describe("ladder", () => {
  it("climbs on a clear and goes back to the first step on a miss, as the backend's squads.ladder does", () => {
    const out = ladder([[330], [370], [300], [330], [null], [370]], BOARD);
    expect(out.rungs.map((r) => r[0]!.res)).toEqual(["clear", "clear", "miss", "clear", "skip", "clear"]);
    expect(out.rungs.map((r) => r[0]!.target)).toEqual([320, 360, 380, 320, 360, 360]);
    expect(out.rungs[2]![0]!.back).toBe(true);
    expect([out.clears, out.cash, out.essence, out.top]).toEqual([4, 10, 1000, 360]);
  });
  it("with two tries in a round, a miss is forgiven when the next try clears", () => {
    const out = ladder([[300, 330], [330, 300]], BOARD);
    expect(out.rungs[0]!.map((r) => r.res)).toEqual(["miss", "clear"]);
    expect(out.rungs[1]!.map((r) => r.target)).toEqual([360, 360]); // 330 missed 360, then 300 missed it too: back to 320
    expect(out.rungs[1]![1]!.back).toBe(true);
    expect(out.clears).toBe(1);
  });
});

describe("tier", () => {
  it("is the highest prize line a score reached", () => {
    const lines = [{ score: 329, cash: 0, essence: 250 }, { score: 376, cash: 0, essence: 500 }];
    expect([tier(300, lines), tier(330, lines), tier(400, lines), tier(null, lines)]).toEqual([-1, 0, 1, -1]);
  });
});

const tile = (club: string, pro: { from: number; toBuy: number; full: number; over: number }[], arena: { from: number; toBuy: number; full: number; started: number }[] = []): Tile => ({
  club, crest: null, games: 10,
  pro: { "0.9": { full: pro.map((p, id) => ({ id, ...p, from: p.full, mean: 300, cov: 1 })), owned: pro.map((p, id) => ({ id, ...p, mean: 300, cov: 1 })) } },
  arena: { full: arena.map((a, id) => ({ id, ...a, from: a.full, mean: 290 })), owned: arena.map((a, id) => ({ id, ...a, mean: 290 })) },
});

describe("choice and ranked", () => {
  const s = { budget: 30, target: 0.9 as const, mine: true };
  it("prices a club both ways and says when nothing fits", () => {
    const t = tile("A", [{ from: 20, toBuy: 20, full: 35, over: 4 }]);
    expect(choice(t, s)).toMatchObject({ mode: "pro", price: 20 });
    expect(choice(t, { ...s, mine: false })).toMatchObject({ mode: "none", cheapest: 35 });
  });
  it("takes the Arena seven only when all five started in the target's share of games", () => {
    const pro = [{ from: 25, toBuy: 25, full: 25, over: 3 }];
    expect(choice(tile("A", pro, [{ from: 12, toBuy: 12, full: 12, started: 0.95 }]), s).mode).toBe("arena");
    expect(choice(tile("A", pro, [{ from: 12, toBuy: 12, full: 12, started: 0.77 }]), s).mode).toBe("pro");
  });
  it("orders the clubs that fit by games over the first step, then price, and the rest after", () => {
    const order = ranked([
      tile("Over", [{ from: 50, toBuy: 50, full: 50, over: 9 }]),
      tile("Cheap", [{ from: 10, toBuy: 10, full: 10, over: 5 }]),
      tile("Best", [{ from: 28, toBuy: 28, full: 28, over: 8 }]),
      tile("Same", [{ from: 9, toBuy: 9, full: 9, over: 5 }]),
    ], s).map((x) => x.tile.club);
    expect(order).toEqual(["Best", "Same", "Cheap", "Over"]);
  });
});
