import { describe, expect, it } from "vitest";
import { mayRefresh, newsFor, type PlanWatch } from "./planNews";

const now = Date.parse("2026-10-29T12:00:00Z");
const watch: PlanWatch = { lock: "2026-10-30T15:00:00Z", builtAt: "2026-10-29T07:30:00Z", players: { isco: 0.9, "arda-guler": 0.7 } };
const row = (player: string, chance: number) => ({ game: "Game:00000000-0000-0000-0000-000000000000", player, basisPoints: chance * 10_000 });

describe("news for the plan", () => {
  it("is a planned starter's chance moving by a quarter or more", () => {
    expect(newsFor(watch, [row("isco", 0.4), row("arda-guler", 0.6), row("someone-else", 0)], now)).toEqual(["isco"]);
    expect(newsFor(watch, [row("arda-guler", 0.95)], now)).toEqual(["arda-guler"]);
  });
  it("is nothing once the week has locked, or without a plan to watch", () => {
    expect(newsFor(watch, [row("isco", 0)], Date.parse("2026-10-30T15:00:01Z"))).toEqual([]);
    expect(newsFor(null, [row("isco", 0)], now)).toEqual([]);
  });
  it("starts at most one refresh every 25 minutes, never beside a running one", () => {
    expect(mayRefresh(false, null, now)).toBe(true);
    expect(mayRefresh(false, now - 10 * 60_000, now)).toBe(false);
    expect(mayRefresh(false, now - 30 * 60_000, now)).toBe(true);
    expect(mayRefresh(true, null, now)).toBe(false);
  });
});
