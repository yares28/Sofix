import { describe, expect, it } from "vitest";
import { decisiveOf, roleNumbers, shownXs, tileVersions, xsNumbers } from "./xs";

const game = { startPoint: 45, subPoint: 35, startPrev: 55, subPrev: 41, pDec: 0.27, decIf: 79, subPDec: 0.1, subDecIf: 70 };

describe("xsNumbers", () => {
  it("gives each version its own number: v1 as published, v2 the most likely score, v0 its roles by their chances", () => {
    expect(xsNumbers(52.4, game, { pStart: 0.9, pOn: 0.1 })).toEqual({ v0: 53.6, v1: 52.4, v2: 45 });
  });

  it("takes the substitute's number when coming on is likelier than starting", () => {
    expect(xsNumbers(20, game, { pStart: 0.2, pOn: 0.6 }).v2).toBe(35);
  });

  it("never makes a number up: a game with no other version, or no chances for v0, keeps v1's", () => {
    expect(xsNumbers(52.4, undefined, { pStart: 1, pOn: 0 })).toEqual({ v0: 52.4, v1: 52.4, v2: 52.4 });
    expect(xsNumbers(52.4, game, {}).v0).toBe(52.4);
    expect(xsNumbers(null, game, { pStart: 1, pOn: 0 })).toEqual({ v0: null, v1: null, v2: null });
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
  it("is v1 unless v0 or v2 was picked", () => {
    expect(shownXs(null)).toBe("v1");
    expect(shownXs("v2")).toBe("v2");
    expect(shownXs("v9")).toBe("v1");
  });
});

describe("roleNumbers", () => {
  it("answers in the role the card already names: his score if he starts, or if he comes on", () => {
    expect(roleNumbers(50, game, "start")).toEqual({ v0: 55, v1: 50, v2: 45 });
    expect(roleNumbers(38, game, "sub")).toEqual({ v0: 41, v1: 38, v2: 35 });
    expect(roleNumbers(47, game, null)).toEqual({ v0: 47, v1: 47, v2: 47 });
    expect(roleNumbers(50, { startPoint: 44 }, "start")).toEqual({ v0: 50, v1: 50, v2: 44 });
  });
});

describe("tileVersions", () => {
  it("gives the overlay tile its other versions and the decisive scenario, in the role the tile shows", () => {
    expect(tileVersions(50, game, { pStart: 0.9, pOn: 0.1 }, true)).toEqual({ xs: { v0: 55, v2: 45 }, dec: { pct: 27, score: 79 } });
    expect(tileVersions(52, game, { pStart: 0.9, pOn: 0.1 }, false)).toEqual({ xs: { v0: 54, v2: 45 }, dec: { pct: 27, score: 79 } });
  });

  it("sends nothing for a game with no other version, so the payload stays as it was", () => {
    expect(tileVersions(50, undefined, {}, true)).toEqual({});
    expect(tileVersions(50, { startPoint: 50 }, {}, true)).toEqual({});
  });
});
