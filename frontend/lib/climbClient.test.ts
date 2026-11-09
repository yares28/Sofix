import { describe, expect, it } from "vitest";
import { climbSignature, reusable } from "./climbClient";
import type { ClimbArgs } from "./climbClient";

const outlook = (id: string, kickoff: string) => ({ card: { slug: `c-${id}` }, game: { id, kickoff, status: "planned" } }) as unknown as ClimbArgs[0][number];
const args = (kickoff = "2026-11-20T19:30:00Z", lives = 3): ClimbArgs => [[outlook("g1", kickoff)], [{ number: 1, target: 300, lives: 3, big: false }], { step: 1, lives, notBefore: null, held: [] }, 0.5, Date.parse("2026-11-09T12:00:00Z")];

describe("a saved climb", () => {
  const saved = { sig: climbSignature(args()), now: Date.parse("2026-11-09T12:00:00Z") };

  it("is reused on a refresh when nothing it was worked out from has changed", () => {
    expect(reusable(saved, climbSignature(args()), args()[0], Date.parse("2026-11-09T18:00:00Z"))).toBe(true);
  });

  it("is worked out again when a read changed an input", () => {
    expect(reusable(saved, climbSignature(args(undefined, 2)), args()[0], Date.parse("2026-11-09T18:00:00Z"))).toBe(false);
  });

  it("is worked out again once one of its games has kicked off", () => {
    expect(reusable(saved, climbSignature(args()), args()[0], Date.parse("2026-11-20T19:31:00Z"))).toBe(false);
  });

  it("is never reused when nothing was saved", () => {
    expect(reusable(null, climbSignature(args()), args()[0], Date.parse("2026-11-09T18:00:00Z"))).toBe(false);
  });
});
