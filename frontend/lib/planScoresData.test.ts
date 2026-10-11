import { beforeEach, expect, it, vi } from "vitest";
import type { GameweekPlan } from "./play";

const { sql } = vi.hoisted(() => ({ sql: vi.fn() }));
vi.mock("./db", () => ({ database: () => sql }));
vi.mock("./cache", () => ({ cache: (fn: unknown) => fn }));
import { loadPlanActuals } from "./planScoresData";

const week = () => ({ gameweek: { slug: "selected" }, playing: { players: [
  { player: "a", games: [{ id: "g1" }, { id: "g2" }] },
  { player: "b", games: [{ id: "g1" }] },
  { player: "c", games: [{ id: "g3" }] },
  { player: "d", games: [{ id: null }] },
] }, plans: [{ lineups: [{ starters: [
  { slug: "card-a", player: "a" }, { slug: "card-b", player: "b" },
  { slug: "card-c", player: "c" }, { slug: "card-d", player: "d" },
], subs: [] }] }] }) as unknown as GameweekPlan;
beforeEach(() => { sql.mockReset(); });
it("joins the selected GW's exact player/game identities, takes the best double score and preserves real zero", async () => {
  sql.mockResolvedValue([
    { player: "a", game_id: "g1", score: 40, played: true, status: "FINAL" },
    { player: "a", game_id: "g2", score: 70, played: true, status: "FINAL" },
    { player: "b", game_id: "g1", score: 0, played: true, status: "FINAL" },
    { player: "c", game_id: "different-week", score: 90, played: true, status: "FINAL" },
  ]);
  expect(await loadPlanActuals(week())).toEqual({ "card-a": { score: 70, played: true, complete: true }, "card-b": { score: 0, played: true, complete: true } });
  expect(sql).toHaveBeenCalledTimes(1);
  expect(sql.mock.calls[0]![1]).toEqual(["g1", "g2", "g3"]);
});
it("keeps partial doubles, distinguishes confirmed DNP from missing, and rejects contradictory DNP", async () => {
  sql.mockResolvedValue([
    { player: "a", game_id: "g1", score: 40, played: true, status: "FINAL" },
    { player: "b", game_id: "g1", score: null, played: false, status: "DID_NOT_PLAY" },
    { player: "c", game_id: "g3", score: 90, played: true, status: "DID_NOT_PLAY" },
  ]);
  expect(await loadPlanActuals(week())).toEqual({ "card-a": { score: 40, played: true, complete: false }, "card-b": { score: 0, played: false, complete: true } });
});
it("leaves failed reads unknown", async () => {
  sql.mockRejectedValue(new Error("unavailable"));
  expect(await loadPlanActuals(week())).toEqual({});
});
it("shows reviewing and live scores provisionally without turning an unplayed live game into DNP", async () => {
  sql.mockResolvedValue([
    { player: "a", game_id: "g1", score: 40, played: true, status: "REVIEWING" },
    { player: "a", game_id: "g2", score: 0, played: false, status: "PENDING" },
    { player: "b", game_id: "g1", score: 0, played: true, status: "LIVE" },
    { player: "c", game_id: "g3", score: 0, played: false, status: "REVIEWING" },
  ]);
  expect(await loadPlanActuals(week())).toEqual({ "card-a": { score: 40, played: true, complete: false }, "card-b": { score: 0, played: true, complete: false } });
});
