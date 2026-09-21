import { describe, expect, it } from "vitest";
import { seasonProgression } from "./progression";
import type { FixtureGrid, GridCell, GridTeam } from "./types";

let id = 1;
const scale = { cuts: [1, 2, 3, 4], higher_is_easier: false };

function played(opponent: string, venue: "H" | "A", gf: number, ga: number): GridCell {
  return {
    fixture_id: id++, opponent_code: opponent, venue, kickoff_utc: "2026-08-20T19:00:00Z", date_confirmed: true,
    rescheduled: false, status: "finished", prediction: null,
    result: { goals_for: gf, goals_against: ga, outcome: gf > ga ? "W" : gf === ga ? "D" : "L" },
  };
}

function upcoming(opponent: string, venue: "H" | "A", win: number, draw: number, ep: number, fixtureId: number): GridCell {
  return {
    fixture_id: fixtureId, opponent_code: opponent, venue, kickoff_utc: "2026-10-20T19:00:00Z", date_confirmed: true,
    rescheduled: false, status: "scheduled", result: null,
    prediction: {
      difficulty: 50, label: "Even", bucket: 3, expected_points: ep,
      probabilities: { win, draw, loss: 1 - win - draw }, clean_sheet: 0.3, xg_for: 1.5, xg_against: 1.0, both_score: 0.5,
    },
  };
}

const team = (code: string, cells: GridCell[], opening?: number[]): GridTeam => ({
  code, name: `Team ${code}`, color: "#123456", crest_url: null, cells: cells.map((c) => [c]),
  ...(opening ? { opening } : {}),
});

/** Two clubs, three gameweeks: one played, two to come. */
const makeGrid = (finished: boolean[]): FixtureGrid => ({
  season: "2026/27", current_matchday: 2, model_version: null,
  lens_scales: { overall: scale, attack: scale, defence: scale, odds: scale, record: scale, market_record: scale },
  matchdays: finished.map((done, i) => ({
    number: i + 1, date_from: "2026-08-20T00:00:00Z", date_to: "2026-08-22T00:00:00Z", finished: done,
  })),
  teams: [
    team("TOP", [played("LOW", "H", 3, 0), upcoming("LOW", "H", 0.7, 0.2, 2.3, 900), upcoming("LOW", "A", 0.7, 0.2, 2.3, 901)]),
    team("LOW", [played("TOP", "A", 0, 3), upcoming("TOP", "A", 0.1, 0.2, 0.5, 900), upcoming("TOP", "H", 0.1, 0.2, 0.5, 901)]),
  ],
});

describe("seasonProgression", () => {
  it("uses the real table while it has been played and the projection after it", () => {
    const { clubs, lastPlayed, columns } = seasonProgression(makeGrid([true, false, false]), { simulations: 0 });
    expect({ lastPlayed, columns }).toEqual({ lastPlayed: 0, columns: 3 });
    const top = clubs.find((club) => club.team.code === "TOP")!;
    expect(top.path.map((point) => point.gameweek)).toEqual([1, 2, 3]);
    expect(top.path.map((point) => point.played)).toEqual([true, false, false]);
    expect(top.path[0]).toMatchObject({ position: 1, points: 3 }); // won its only game
    expect(top.path[2]!.points).toBeCloseTo(3 + 2.3 + 2.3, 6); // points so far plus the expected ones
    expect(top.now).toBe(1);
    expect(top.end).toBe(1);
    const low = clubs.find((club) => club.team.code === "LOW")!;
    expect([low.best, low.worst, low.end]).toEqual([2, 2, 2]);
  });

  it("leaves the band empty when nothing is simulated", () => {
    const { clubs } = seasonProgression(makeGrid([true, false, false]), { simulations: 0 });
    expect(clubs.flatMap((club) => club.path).every((point) => point.low === null && point.high === null)).toBe(true);
  });

  it("puts a band on the projected gameweeks only, and keeps it in the table", () => {
    const { clubs } = seasonProgression(makeGrid([true, false, false]), { simulations: 200 });
    for (const club of clubs) {
      for (const point of club.path) {
        if (point.played) {
          expect(point.low).toBeNull();
        } else {
          expect(point.low).not.toBeNull();
          expect(point.low!).toBeLessThanOrEqual(point.high!);
          expect(point.low!).toBeGreaterThanOrEqual(1);
          expect(point.high!).toBeLessThanOrEqual(clubs.length);
        }
      }
    }
  });

  it("is seeded, so the same board always draws the same chart", () => {
    const grid = makeGrid([true, false, false]);
    expect(seasonProgression(grid, { simulations: 120 })).toEqual(seasonProgression(grid, { simulations: 120 }));
  });

  it("carries the pre-season projection through, lined up with the gameweeks", () => {
    const grid = makeGrid([true, false, false]);
    grid.teams[0]!.opening = [2, 2, 1]; // August had TOP second, climbing to first
    const { clubs } = seasonProgression(grid, { simulations: 0 });
    const top = clubs.find((club) => club.team.code === "TOP")!;
    expect(top.path.map((point) => point.opening)).toEqual([2, 2, 1]);
    expect([top.openingNow, top.openingEnd]).toEqual([2, 1]);
    const low = clubs.find((club) => club.team.code === "LOW")!;
    expect(low.path.every((point) => point.opening === null)).toBe(true); // no artifact for this club
    expect([low.openingNow, low.openingEnd]).toEqual([null, null]);
  });

  it("handles a season nobody has played yet", () => {
    const { clubs, lastPlayed } = seasonProgression(makeGrid([false, false, false]), { simulations: 50 });
    expect(lastPlayed).toBe(-1);
    expect(clubs.every((club) => club.now === null)).toBe(true);
    expect(clubs.every((club) => club.path.every((point) => !point.played))).toBe(true);
  });
});
