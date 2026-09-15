import { describe, expect, it } from "vitest";
import { gameweekMatches, matchOutlook } from "./matches";
import type { FixtureGrid, GridCell, GridTeam } from "./types";

const cell = (fixture_id: number, opponent_code: string, venue: "H" | "A", kickoff: string, win = 0.5, loss = 0.25): GridCell => ({
  fixture_id, opponent_code, venue, kickoff_utc: kickoff, date_confirmed: true, rescheduled: false, status: "scheduled",
  result: null, weather: null,
  prediction: {
    difficulty: 40, label: "Easy-ish", bucket: 2, expected_points: 1.75,
    probabilities: { win, draw: 1 - win - loss, loss }, clean_sheet: 0.3, xg_for: 1.5, xg_against: 1.0,
  },
});
const team = (code: string, cells: GridCell[][]): GridTeam => ({ code, name: `Team ${code}`, color: "#123456", crest_url: null, cells });
const scale = { cuts: [1, 2, 3, 4], higher_is_easier: false };

const grid: FixtureGrid = {
  season: "2026/27", current_matchday: 1, model_version: null,
  lens_scales: { overall: scale, attack: scale, defence: scale, odds: scale },
  matchdays: [{ number: 1, date_from: "2026-09-19T14:00:00Z", date_to: "2026-09-21T19:00:00Z", finished: false }],
  teams: [
    team("AAA", [[cell(2, "BBB", "H", "2026-09-21T19:00:00Z", 0.62, 0.15)]]),
    team("BBB", [[cell(2, "AAA", "A", "2026-09-21T19:00:00Z", 0.15, 0.62)]]),
    team("CCC", [[cell(1, "DDD", "A", "2026-09-19T14:00:00Z", 0.36, 0.34), cell(3, "EEE", "H", "2026-09-20T16:00:00Z")]]),
    team("DDD", [[cell(1, "CCC", "H", "2026-09-19T14:00:00Z", 0.34, 0.36)]]),
    team("EEE", [[cell(3, "CCC", "A", "2026-09-20T16:00:00Z")]]),
    team("FFF", [[]]),
  ],
};

describe("gameweekMatches", () => {
  it("pairs both sides of each fixture, sorts by kickoff, and lists blanks and doubles", () => {
    const gw = gameweekMatches(grid, 0);
    expect(gw.matches.map((m) => `${m.home.code}-${m.away.code}`)).toEqual(["DDD-CCC", "CCC-EEE", "AAA-BBB"]);
    expect(gw.matches[2]!.awayCell.prediction?.probabilities.win).toBe(0.15);
    expect(gw.notPlaying.map((t) => t.code)).toEqual(["FFF"]);
    expect(gw.doubles.map((t) => t.code)).toEqual(["CCC"]);
  });

  it("names a favourite only when one side is at least 10 points clearer", () => {
    const [close, , clear] = gameweekMatches(grid, 0).matches;
    expect(matchOutlook(close!)?.favourite).toBeNull();
    expect(matchOutlook(clear!)).toMatchObject({ homeWin: 0.62, awayWin: 0.15, favourite: { code: "AAA" } });
  });
});
