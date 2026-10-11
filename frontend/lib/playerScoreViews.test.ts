import { describe, expect, it } from "vitest";
import type { PlayerScoreRow, PlayerScoreWeek } from "./audit";
import { scoreStats, playerSummaries, withGameCrests } from "./playerScoreViews";

const row: PlayerScoreRow = { player: "p", name: "Player", pic: "", pos: "DEF", game: "g", kickoff: null,
  home: "Spain", away: "Denmark", competition: "International", xscore: 50, sorare: 60, by: "sofix",
  actual: 0, difference: -50, firstScore: 0, played: true, started: true, state: "rechecked",
  checkedAt: null, recheckedAt: null, firstDue: null, recheckDue: null, reason: "" };
const week = (slug: string, rows: PlayerScoreRow[]): PlayerScoreWeek => ({ slug, number: 19, rows,
  summary: { checked: 0, total: rows.length, rechecked: 0, starts: 0, xCases: 0, xMiss: null, sorareCases: 0, sorareMiss: null } });

describe("saved player score views", () => {
  it("counts real zero, separates forecast samples, excludes pending, DNP and substitutes from start averages", () => {
    const stats = scoreStats([row, { ...row, xscore: null, sorare: null, actual: 80 },
      { ...row, state: "pending", actual: 99 }, { ...row, played: false, actual: 0 },
      { ...row, started: false, actual: 90 }, { ...row, xscore: 40, sorare: null, actual: 60, by: "form" }]);
    expect(stats).toMatchObject({ total: 6, checked: 5, starts: 3, xCases: 2, sorareCases: 1,
      xscore: 45, sorare: 60, actual: 140 / 3, diff: -15, totalDiff: -30, xMiss: 35, sorareMiss: 60 });
  });
  it("groups a player's complete retained history without merging different players or discarding two games in a GW", () => {
    const summaries = playerSummaries([week("19", [row, { ...row, game: "g2", actual: 70 }]),
      week("18", [{ ...row, actual: 60 }, { ...row, player: "other", xscore: null, sorare: null }])]);
    expect(summaries).toHaveLength(2);
    expect(summaries.find(p => p.player === "p")).toMatchObject({ weeks: 2, sources: ["sofix"], stats: { total: 3, starts: 3, diff: -20 / 3 } });
    expect(summaries.find(p => p.player === "other")?.stats).toMatchObject({ xscore: null, sorare: null, actual: 0, diff: null });
    expect(scoreStats([])).toMatchObject({ xMiss: null, diff: null, actual: null, totalDiff: null });
  });
  it("uses the actual match sides for crests, including national teams; never substitutes a player's club", () => {
    const game = { id: "g", team: "Spain", opponent: "Denmark", teamCrest: "spain.svg", opponentCrest: "denmark.svg", venue: "A" as const, kickoff: "", competition: "International" };
    const crests = new Map([["spain", "spain.svg"], ["denmark", "denmark.svg"], ["barcelona", "club.svg"]]);
    // Conflicting sides for the same id are ignored; name identity still chooses the right crest.
    expect(withGameCrests(row, [game], crests)).toMatchObject({ homeCrest: "spain.svg", awayCrest: "denmark.svg" });
    expect(withGameCrests({ ...row, home: "Unknown side" }, [], crests).homeCrest).toBeNull();
    expect(withGameCrests({ ...row, home: "Denmark", away: "Spain" }, [game], new Map())).toMatchObject({ homeCrest: "denmark.svg", awayCrest: "spain.svg" });
  });
});
