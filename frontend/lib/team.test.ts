import { describe, expect, it } from "vitest";
import { findTeam, pointsTrend, seasonEntries, venueSplit } from "./team";
import type { FixtureGrid, GridCell } from "./types";

let id = 1;
const upcoming = (venue: "H" | "A", ep: number, difficulty: number): GridCell => ({
  fixture_id: id++, opponent_code: "OPP", venue, kickoff_utc: "2026-10-01T19:00:00Z", date_confirmed: true,
  rescheduled: false, status: "scheduled", result: null,
  prediction: {
    difficulty, label: "Even", bucket: 3, expected_points: ep, probabilities: { win: 0.4, draw: 0.3, loss: 0.3 },
    clean_sheet: 0.3, xg_for: 1.2, xg_against: 1.1,
  },
});
const played = (venue: "H" | "A", gf: number, ga: number): GridCell => ({
  ...upcoming(venue, 0, 0), status: "finished", prediction: null,
  result: { goals_for: gf, goals_against: ga, outcome: gf > ga ? "W" : gf === ga ? "D" : "L" },
});
const md = (number: number) => ({ number, date_from: "2026-09-01T00:00:00Z", date_to: "2026-09-02T00:00:00Z", finished: false });

const team = {
  code: "FCB", name: "Barcelona", color: "#a50044", crest_url: null,
  cells: [[played("H", 3, 1)], [played("A", 1, 1)], [], [upcoming("H", 2.2, 30), upcoming("A", 1.6, 50)], [upcoming("A", 1.2, 60)]],
};
const grid: FixtureGrid = {
  season: "2026/27", current_matchday: 3, model_version: null,
  lens_scales: {
    overall: { cuts: [1, 2, 3, 4], higher_is_easier: false },
    attack: { cuts: [4, 3, 2, 1], higher_is_easier: true },
    defence: { cuts: [4, 3, 2, 1], higher_is_easier: true },
    odds: { cuts: [0.6, 0.45, 0.3, 0.18], higher_is_easier: true },
    record: { cuts: [0.06, 0.02, -0.02, -0.06], higher_is_easier: true },
    market_record: { cuts: [0.06, 0.02, -0.02, -0.06], higher_is_easier: true },
  },
  matchdays: [md(1), md(2), md(3), md(4), md(5)],
  teams: [team],
};

describe("team season", () => {
  it("finds a team case-insensitively", () => {
    expect(findTeam(grid, "fcb")?.name).toBe("Barcelona");
    expect(findTeam(grid, "XXX")).toBeNull();
  });

  it("lists every matchday, with blanks and one entry per game in a double", () => {
    const entries = seasonEntries(grid, team);
    expect(entries.map((e) => [e.matchday.number, e.cell ? e.cell.venue : null])).toEqual([
      [1, "H"], [2, "A"], [3, null], [4, "H"], [4, "A"], [5, "A"],
    ]);
  });

  it("charts actual points for played games and expected points after", () => {
    expect(pointsTrend(seasonEntries(grid, team)).map((p) => [p.matchday, p.kind, p.value])).toEqual([
      [1, "actual", 3], [2, "actual", 1], [4, "expected", 2.2], [4, "expected", 1.6], [5, "expected", 1.2],
    ]);
  });

  it("splits record and outlook by venue", () => {
    const split = venueSplit(seasonEntries(grid, team));
    expect(split.H).toMatchObject({ played: 1, won: 1, goalsFor: 3, goalsAgainst: 1, points: 3, upcoming: 1, averageDifficulty: 30 });
    expect(split.A).toMatchObject({ played: 1, drawn: 1, points: 1, upcoming: 2, averageDifficulty: 55 });
    expect(split.A.expectedPoints).toBeCloseTo(2.8);
  });
});
