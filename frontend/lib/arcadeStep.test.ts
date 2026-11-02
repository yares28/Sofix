import { describe, expect, it } from "vitest";
import { climbStep } from "../components/arcade/ArcadePlanner";
import type { Arcade, ArcadeStep } from "./arcade";

const step = (number: number, target: number, state: string): ArcadeStep => ({ id: `s${number}`, number, level: number - 1, title: null, target, originalTarget: null, state, rewards: [], lineups: null, captain: 0.5, collection: null, packs: [], entered: [] });
const board = (current: number | null, ...states: string[]) => ({ board: { id: "b", config: null, title: null, end: null, current, restartable: null, steps: states.map((s, i) => step(i + 1, [260, 300, 360, 400][i]!, s)) } }) as unknown as Arcade;

describe("the step you are on", () => {
  it("moves past a cleared step Sorare still names (1 Nov 2026: step 2 cleared, its reward unclaimed, lineups going on step 3)", () => {
    expect(climbStep(board(2, "CLAIMED", "CLAIMABLE", "PLAYABLE", "LOCKED"))).toBe(3);
  });
  it("moves past every cleared step, not only one", () => {
    expect(climbStep(board(1, "CLAIMABLE", "CLAIMED", "LINEUP_SET", "LOCKED"))).toBe(3);
  });
  it("stays on a step whose lineups are still playing", () => {
    expect(climbStep(board(2, "CLAIMED", "LIVE", "LOCKED", "LOCKED"))).toBe(2);
  });
  it("stays on the last step when it is cleared (it pays again)", () => {
    expect(climbStep(board(4, "CLAIMED", "CLAIMED", "CLAIMED", "CLAIMABLE"))).toBe(4);
  });
});
