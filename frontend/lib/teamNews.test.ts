import { describe, expect, it } from "vitest";
import { gameLine, lockChip, movedWhy, shares, sinceLabel, splitLabel } from "./teamNews";
import type { NewsGame, NewsMove } from "./play";

const NOW = new Date("2026-10-07T12:00:00Z"); // Wed 7 Oct 14:00 in Madrid
const game: NewsGame = { id: "g1", kickoff: "2026-10-11T14:15:00Z", team: "Real Sociedad", opponent: "Deportivo", venue: "H" };

describe("the split of the players", () => {
  it("is drawn in proportion, with a sliver for the few who are out so they are never lost", () => {
    const parts = shares({ likely: 35, doubtful: 21, unlikely: 16, out: 1 });

    expect(parts.map((p) => [p.key, p.count])).toEqual([
      ["likely", 35],
      ["doubtful", 21],
      ["unlikely", 16],
      ["out", 1],
    ]);
    expect(parts.find((p) => p.key === "out")!.flex).toBeGreaterThan(1);
    expect(parts.find((p) => p.key === "likely")!.flex).toBe(35);
  });

  it("leaves a band with nobody in it out", () => {
    expect(shares({ likely: 5, doubtful: 0, unlikely: 0, out: 0 }).map((p) => p.key)).toEqual(["likely"]);
  });

  it("is spoken for a screen reader", () => {
    expect(splitLabel({ likely: 35, doubtful: 21, unlikely: 16, out: 1 })).toBe("35 likely to start, 21 in doubt, 16 unlikely, 1 out");
    expect(splitLabel({ likely: 2, doubtful: 0, unlikely: 0, out: 0 })).toBe("2 likely to start");
  });
});

describe("the game of a row", () => {
  it("says who he plays, at home or away, and when in Madrid time", () => {
    expect(gameLine(game)).toBe("v Deportivo · Sun 16:15");
    expect(gameLine({ ...game, venue: "A" })).toBe("at Deportivo · Sun 16:15");
    expect(gameLine({ ...game, venue: null })).toBe("Deportivo · Sun 16:15");
  });

  it("names what moved a player: his status, else his game", () => {
    const move = (kind: NewsMove["kind"]) => ({ kind, game }) as NewsMove;

    expect(movedWhy(move("out"))).toBe("Out");
    expect(movedWhy(move("doubt"))).toBe("Doubt");
    expect(movedWhy(move("suspended"))).toBe("Suspended");
    expect(movedWhy(move("available"))).toBe("v Deportivo · Sun 16:15");
    expect(movedWhy(move(null))).toBe("v Deportivo · Sun 16:15");
  });
});

describe("the lock and the comparison", () => {
  it("counts down to the lock, or says it is locked", () => {
    expect(lockChip("2026-10-09T19:00:00Z", NOW)).toBe("Locks Fri 21:00 · in 2 d 7 h");
    expect(lockChip("2026-10-07T18:00:00Z", NOW)).toBe("Locks Wed 20:00 · in 6 h");
    expect(lockChip("2026-10-07T11:00:00Z", NOW)).toBe("Locked");
  });

  it("says since yesterday when the reading is from the day before, else since the day and time", () => {
    expect(sinceLabel("2026-10-06T20:00:00Z", NOW)).toBe("since yesterday");
    expect(sinceLabel("2026-10-05T20:00:00Z", NOW)).toBe("since Mon 22:00");
  });
});
