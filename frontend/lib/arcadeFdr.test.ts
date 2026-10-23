import { describe, expect, it } from "vitest";
import { boardFixtures, matchFixture, nameMatch, type FdrFixture } from "./arcadeFdr";
import type { FixtureGrid } from "./types";

const side = (code: string, name: string, bucket: 1 | 2 | 3 | 4 | 5) => ({ code, name, bucket, label: "Even", cleanSheet: 0.3, xgFor: 1.4, xgAgainst: 1.1 });
const fixture = (kickoff: string, home: string, away: string, league: FdrFixture["league"] = "PL"): FdrFixture => ({ league, kickoff, home: side(home.slice(0, 3).toUpperCase(), home, 2), away: side(away.slice(0, 3).toUpperCase(), away, 4) });
const game = (kickoff: string, home: string, away: string, slug = "premier-league-gb-eng") => ({ kickoff, competition: { slug }, home: { name: home }, away: { name: away } });

describe("Arcade and the league boards", () => {
  it("matches clubs by the words their names share, ignoring accents and FC-like words", () => {
    expect(nameMatch("Atlético de Madrid", "Ath Madrid")).toBeGreaterThan(0);
    expect(nameMatch("Tottenham Hotspur FC", "Tottenham")).toBe(1);
    expect(nameMatch("Real Madrid", "Real Betis")).toBe(1);
    expect(nameMatch("FC Bayern München", "Bayern Munich")).toBeGreaterThan(0);
    expect(nameMatch("Arsenal FC", "Everton")).toBe(0);
  });

  it("finds a Sorare game's fixture in the same league at the same kick-off, by names when two kick off together", () => {
    const board = [fixture("2026-10-25T14:00:00Z", "Arsenal", "Everton"), fixture("2026-10-25T14:00:00Z", "Liverpool", "Brighton"), fixture("2026-10-25T16:30:00Z", "Chelsea", "Fulham")];
    expect(matchFixture(game("2026-10-25T14:00:00Z", "Liverpool FC", "Brighton & Hove Albion FC"), board)?.home.name).toBe("Liverpool");
    expect(matchFixture(game("2026-10-25T16:30:00Z", "Chelsea FC", "Fulham FC"), board)?.away.name).toBe("Fulham");
    expect(matchFixture(game("2026-10-25T16:35:00Z", "X", "Y"), board)?.home.name).toBe("Chelsea"); // alone at that time
    expect(matchFixture(game("2026-10-25T14:00:00Z", "Unknown", "Other"), board)).toBeNull(); // two at once, no name in common
    expect(matchFixture(game("2026-10-25T16:30:00Z", "Chelsea FC", "Fulham FC", "uefa-champions-league"), board)).toBeNull(); // not a board league
  });

  it("builds both sides of each scheduled board fixture, and leaves out a side without a forecast", () => {
    const cell = (fixture_id: number, venue: "H" | "A", opponent_code: string, bucket: 1 | 2 | 3 | 4 | 5 | null) => ({ fixture_id, venue, opponent_code, kickoff_utc: "2026-10-25T14:00:00Z", date_confirmed: true, rescheduled: false, status: "scheduled" as const, result: null,
      prediction: bucket === null ? null : { difficulty: bucket, label: "Even" as const, bucket, expected_points: 1.4, probabilities: { win: 0.4, draw: 0.3, loss: 0.3 }, clean_sheet: 0.3, xg_for: 1.5, xg_against: 1.1 } });
    const grid = { competition: "PL", season: "2026", current_matchday: 9, model_version: null, lens_scales: {}, matchdays: [], teams: [
      { code: "ARS", name: "Arsenal", color: "#f00", crest_url: null, cells: [[cell(1, "H", "EVE", 2)], [cell(2, "A", "CHE", 3)]] },
      { code: "EVE", name: "Everton", color: "#00f", crest_url: null, cells: [[cell(1, "A", "ARS", 5)]] },
      { code: "CHE", name: "Chelsea", color: "#00f", crest_url: null, cells: [[cell(2, "H", "ARS", null)]] },
    ] } as unknown as FixtureGrid;
    const out = boardFixtures(grid, "PL", 0, Date.parse("2026-11-01T00:00:00Z"));
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ home: { code: "ARS", bucket: 2, difficulty: 2 }, away: { code: "EVE", bucket: 5, difficulty: 5 } });
  });
});
