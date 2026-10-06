import { describe, expect, it } from "vitest";
import recorded from "../e2e/fixtures/grid-response.json";
import { laligaRound } from "./laliga";
import type { PlayerGame, PlayingPlayer } from "./play";
import type { ApiResponse, FixtureGrid } from "./types";

const grid = (recorded as ApiResponse<FixtureGrid>).data!;
const column = grid.matchdays.findIndex((md) => !md.finished);
const md = grid.matchdays[column]!;

const game = (kickoff: string, competition = "LaLiga"): PlayerGame => ({ kickoff, competition, opponent: "Elche", opponentCrest: null, venue: "H" });
const player = (name: string, games: PlayerGame[]) => ({ name, x: 50, pos: "MID", games }) as unknown as PlayingPlayer;

describe("laligaRound", () => {
  const inRound = md.date_from; // the round's first kickoff
  const round = laligaRound(grid, column, [
    player("A", [game(inRound)]),
    player("B", [game(inRound)]),
    player("C", [game(inRound, "MLS")]), // not LaLiga
    player("D", [game("2020-01-01T18:00:00Z")]), // another round
  ]);

  it("counts the players with a LaLiga game in the round, by day", () => {
    expect(round.playing).toBe(2);
    expect(round.days.reduce((sum, d) => sum + d.players, 0)).toBe(2);
  });

  it("ranks the five kindest games by expected points and the five likeliest clean sheets, highest first", () => {
    expect(round.kindest).toHaveLength(5);
    expect(round.cleanSheets).toHaveLength(5);
    for (const list of [round.kindest, round.cleanSheets]) {
      expect(list.map((pick) => pick.value)).toEqual([...list.map((pick) => pick.value)].sort((a, b) => b - a));
    }
  });

  it("keeps every game of the round, each side with its own chance to win, and the draw between them", () => {
    expect(round.games.length).toBeGreaterThan(0);
    for (const g of round.games) {
      if (g.home.win !== null && g.away.win !== null && g.draw !== null) expect(g.home.win + g.draw + g.away.win).toBeCloseTo(1, 1);
    }
  });
});
