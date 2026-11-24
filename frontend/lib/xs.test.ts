import { describe, expect, it } from "vitest";
import { decisiveOf, replayRates, roleNumbers, shownXs, starterRates, tileVersions, xsNumbers } from "./xs";

const game = { startPoint: 45, subPoint: 35, startPrev: 55, subPrev: 41, pDec: 0.27, decIf: 79, subPDec: 0.1, subDecIf: 70, startV3: 48, pDecPrev: 0.3, decPrevIf: 82 };

describe("xsNumbers", () => {
  it("gives each version its own number: v1 as published, v2 the most likely score, v0 its roles by their chances", () => {
    expect(xsNumbers(52.4, game, { pStart: 0.9, pOn: 0.1 })).toEqual({ v0: 53.6, v1: 52.4, v2: 45, v3: 48 });
  });

  it("takes the substitute's number when coming on is likelier than starting", () => {
    expect(xsNumbers(20, game, { pStart: 0.2, pOn: 0.6 }).v2).toBe(35);
  });

  it("never makes a number up: a game with no other version, or no chances for v0, keeps v1's", () => {
    expect(xsNumbers(52.4, undefined, { pStart: 1, pOn: 0 })).toEqual({ v0: 52.4, v1: 52.4, v2: 52.4, v3: 52.4 });
    expect(xsNumbers(52.4, game, {}).v0).toBe(52.4);
    expect(xsNumbers(null, game, { pStart: 1, pOn: 0 })).toEqual({ v0: null, v1: null, v2: null, v3: null });
  });
});

describe("decisiveOf", () => {
  it("names the scenario of his likelier role, and nothing when the chance is none or its score unknown", () => {
    expect(decisiveOf(game, { pStart: 0.9, pOn: 0.05 })).toEqual({ pct: 27, score: 79 });
    expect(decisiveOf(game, { pStart: 0.1, pOn: 0.6 })).toEqual({ pct: 10, score: 70 });
    expect(decisiveOf({ ...game, decIf: undefined }, { pStart: 1, pOn: 0 })).toBeNull();
    expect(decisiveOf({ ...game, pDec: 0.002 }, { pStart: 1, pOn: 0 })).toBeNull();
    expect(decisiveOf(undefined, {})).toBeNull();
  });
});

describe("shownXs", () => {
  it("is v3 unless v0, v1 or v2 was picked (owner, 24 Nov 2026)", () => {
    expect(shownXs(null)).toBe("v3");
    expect(shownXs("v1")).toBe("v1");
    expect(shownXs("v2")).toBe("v2");
    expect(shownXs("v9")).toBe("v3");
  });
});

describe("roleNumbers", () => {
  it("answers in the role the card already names: his score if he starts, or if he comes on", () => {
    expect(roleNumbers(50, game, "start")).toEqual({ v0: 55, v1: 50, v2: 45, v3: 48 });
    expect(roleNumbers(38, game, "sub")).toEqual({ v0: 41, v1: 38, v2: 35, v3: 35 });
    expect(roleNumbers(47, game, null)).toEqual({ v0: 47, v1: 47, v2: 47, v3: 47 });
    expect(roleNumbers(50, { startPoint: 44 }, "start")).toEqual({ v0: 50, v1: 50, v2: 44, v3: 44 });
  });
});

describe("tileVersions", () => {
  it("gives the overlay tile its other versions and the decisive scenario, in the role the tile shows", () => {
    expect(tileVersions(50, game, { pStart: 0.9, pOn: 0.1 }, true)).toEqual({ xs: { v0: 55, v2: 45, v3: 48 }, dec: { pct: 27, score: 79 }, dec3: { pct: 30, score: 82 } });
    expect(tileVersions(52, game, { pStart: 0.9, pOn: 0.1 }, false)).toEqual({ xs: { v0: 54, v2: 45, v3: 48 }, dec: { pct: 27, score: 79 }, dec3: { pct: 30, score: 82 } });
  });

  it("sends nothing for a game with no other version, so the payload stays as it was", () => {
    expect(tileVersions(50, undefined, {}, true)).toEqual({});
    expect(tileVersions(50, { startPoint: 50 }, {}, true)).toEqual({});
  });
});

describe("replayRates", () => {
  it("reads each version's hits on the same replayed games", () => {
    expect(replayRates({ cases: 200, previousHits: 60, meanHits: 62, hits: 80 })).toEqual({ v0: 0.3, v1: 0.31, v2: 0.4 });
  });

  it("adds the research's side-by-side replay: v3 at every width, v1 and v2 at ±10 and ±15", () => {
    const replay = { cases: 6754, previousHits: 2027, meanHits: 2036, hits: 2596 };
    expect(starterRates(7, replay).v3).toBeCloseTo(0.3866, 4);
    expect(Object.keys(starterRates(10, replay)).sort()).toEqual(["v1", "v2", "v3"]); // no v0 at ±10 yet
    expect(starterRates(15, replay).v3).toBeCloseTo(0.6464, 4);
  });
});

describe("Sofix v3", () => {
  it("is v0's normal score for a starter, v2's for a substitute, and v2's where v0 is not on file", () => {
    expect(xsNumbers(52, game, { pStart: 0.9, pOn: 0.1 }).v3).toBe(48);
    expect(xsNumbers(20, game, { pStart: 0.2, pOn: 0.6 }).v3).toBe(35);
    expect(xsNumbers(52, { startPoint: 45 }, { pStart: 1, pOn: 0 }).v3).toBe(45);
    expect(shownXs("v3")).toBe("v3");
  });

  it("names v0's decisive scenario, and none once the number has switched to it", () => {
    expect(decisiveOf(game, { pStart: 1, pOn: 0 }, "v3")).toEqual({ pct: 30, score: 82 });
    expect(decisiveOf({ ...game, pDecPrev: undefined, decPrevIf: undefined }, { pStart: 1, pOn: 0 }, "v3")).toBeNull();
  });
});
