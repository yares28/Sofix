import type { FixtureGrid, GridCell } from "./types";
import type { LineupMatch } from "./lineups";

export type MatchFacts = { market: GridCell["market"]; prediction: GridCell["prediction"] };

/** Match the home side and round as well as the opponent; never borrow another game's odds. */
export function lineupMatchFacts(matches: LineupMatch[], grid: FixtureGrid | null): Record<number, MatchFacts> {
  const facts: Record<number, MatchFacts> = {};
  if (!grid) return facts;
  for (const match of matches) {
    if (match.competition !== "laliga" || match.round === null || !match.home.club || !match.away.club) continue;
    const team = grid.teams.find((one) => one.code === match.home.club);
    const cells = team?.cells[match.round - 1] ?? [];
    const cell = cells.find((one) => one.venue === "H" && one.opponent_code === match.away.club);
    if (cell) facts[match.id] = { market: cell.market, prediction: cell.prediction };
  }
  return facts;
}
