import { describe, expect, it } from "vitest";
import type { LineupPlayer } from "./lineups";
import { accuracy, byScore, readScores, scoreWords, sideScores, sofixScores } from "./matchScores";

const row = (slug: string, score: number, played: boolean | null, projection: number | null) => ({
  score, projection: projection === null ? null : { score: projection }, anyPlayer: { slug }, anyPlayerGameStats: { playedInGame: played },
});
const player = (slug: string, actual: "starter" | "bench" = "starter"): LineupPlayer => ({ id: `so:${slug}`, slug, name: slug, pos: "MID", p: null, actual });

describe("readScores", () => {
  it("keeps a score only for a player who played, and Sorare's number for everyone", () => {
    const scores = readScores([row("a", 63.4, true, 50), row("b", 0, false, 41), row("c", 0, null, null), { broken: true }]);
    expect(scores).toEqual({
      a: { actual: 63.4, sofix: null, sorare: 50 },
      b: { actual: null, sofix: null, sorare: 41 },
      c: { actual: null, sofix: null, sorare: null },
    });
  });
});

describe("sofixScores", () => {
  it("reads the number of that game only, and the week's number for a first game without one", () => {
    const record = { players: {
      a: { mu: 40, games: [{ id: "Game:1", sofix: 55.5 }, { id: "Game:2", sofix: 30 }] },
      b: { mu: 44, games: [{ id: "Game:1", sofix: null }] },
      c: { mu: 48, games: [{ id: "Game:0" }, { id: "Game:1" }] }, // a second game never borrows the week's number
      d: { mu: 70, games: [{ id: "Game:9", sofix: 70 }] },
    } };
    expect(sofixScores([record], "Game:1")).toEqual({ a: 55.5, b: 44 });
  });
});

describe("accuracy", () => {
  const scores = {
    a: { actual: 60, sofix: 50, sorare: 60 },
    b: { actual: 30, sofix: 50, sorare: null },
    c: { actual: null, sofix: 50, sorare: 45 }, // did not play: nothing to compare
  };
  it("is 100 minus the average gap over the players who played and had a number", () => {
    const team = [player("a"), player("b"), player("c", "bench"), player("unknown")];
    expect(accuracy(team, scores, "sofix")).toEqual({ percent: 85, off: 15, players: 2 });
    expect(accuracy(team, scores, "sorare")).toEqual({ percent: 100, off: 0, players: 1 });
  });
  it("says nothing when nobody can be compared", () => {
    expect(accuracy([player("c")], scores, "sofix")).toBeNull();
  });
});

describe("scoreWords", () => {
  it("names what the badge shows", () => {
    const values = { a: { actual: 63.4, sofix: null, sorare: 50 } };
    expect(scoreWords(player("a"), { show: "actual", values })).toBe("a, started, scored 63, Sorare expected 50");
    expect(scoreWords(player("a", "bench"), { show: "sorare", values })).toBe("a, bench, Sorare expected 50, scored 63");
    expect(scoreWords(player("a"), { show: "sofix", values })).toBe("a, started, no Sofix number, scored 63");
  });
});

describe("sideScores", () => {
  const values = { a: { actual: 63.4, sofix: 48, sorare: 50 }, b: { actual: null, sofix: 40, sorare: null } };
  it("puts both expected scores next to the real one, and the real one next to an expected score", () => {
    expect(sideScores(player("a"), { show: "actual", values })).toEqual([{ view: "sofix", n: 48 }, { view: "sorare", n: 50 }]);
    expect(sideScores(player("a"), { show: "sofix", values })).toEqual([{ view: "actual", n: 63.4 }]);
  });
  it("leaves out a number nobody gave", () => {
    expect(sideScores(player("b"), { show: "actual", values })).toEqual([{ view: "sofix", n: 40 }]);
    expect(sideScores(player("b"), { show: "sorare", values })).toEqual([]);
    expect(sideScores(player("nobody"), { show: "actual", values })).toEqual([]);
  });
});

describe("byScore", () => {
  it("puts who scored most first and keeps those who did not play after them, in their order", () => {
    const values = { a: { actual: 20, sofix: null, sorare: null }, b: { actual: null, sofix: 90, sorare: null }, c: { actual: 71, sofix: null, sorare: null }, e: { actual: 0, sofix: null, sorare: null } };
    expect(byScore([player("a"), player("b"), player("c"), player("d"), player("e")], values).map((p) => p.slug)).toEqual(["c", "a", "e", "b", "d"]);
  });
});
