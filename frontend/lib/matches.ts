import type { FixtureGrid, GridCell, GridTeam } from "./types";

export interface Match {
  fixtureId: number;
  home: GridTeam;
  away: GridTeam;
  homeCell: GridCell; // the fixture from the home team's side (its prediction is the home team's)
  awayCell: GridCell;
  kickoff: string;
}

export interface Gameweek {
  matches: Match[];
  notPlaying: GridTeam[]; // blank this gameweek
  doubles: GridTeam[]; // two games this gameweek
}

/**
 * One gameweek as matches rather than team rows: the grid holds each fixture twice (once per team),
 * so pair the two sides by fixture id. Sorted by kickoff.
 */
export function gameweekMatches(grid: FixtureGrid, column: number): Gameweek {
  const byCode = new Map(grid.teams.map((team) => [team.code, team]));
  const sides = new Map<number, { home?: { team: GridTeam; cell: GridCell }; away?: { team: GridTeam; cell: GridCell } }>();
  for (const team of grid.teams) {
    for (const cell of team.cells[column] ?? []) {
      const entry = sides.get(cell.fixture_id) ?? {};
      entry[cell.venue === "H" ? "home" : "away"] = { team, cell };
      sides.set(cell.fixture_id, entry);
    }
  }
  const matches: Match[] = [];
  for (const [fixtureId, { home, away }] of sides) {
    if (!home || !away || !byCode.has(home.team.code) || !byCode.has(away.team.code)) continue;
    matches.push({ fixtureId, home: home.team, away: away.team, homeCell: home.cell, awayCell: away.cell, kickoff: home.cell.kickoff_utc });
  }
  matches.sort((a, b) => Date.parse(a.kickoff) - Date.parse(b.kickoff) || a.home.name.localeCompare(b.home.name));
  return {
    matches,
    notPlaying: grid.teams.filter((team) => (team.cells[column] ?? []).length === 0),
    doubles: grid.teams.filter((team) => (team.cells[column] ?? []).length > 1),
  };
}

export interface MatchOutlook {
  homeWin: number;
  draw: number;
  awayWin: number;
  favourite: GridTeam | null; // null when it's close (neither side 10 points clearer)
}

export function matchOutlook(match: Match): MatchOutlook | null {
  const p = match.homeCell.prediction;
  if (!p) return null;
  const { win: homeWin, draw, loss: awayWin } = p.probabilities;
  const favourite = homeWin - awayWin >= 0.1 ? match.home : awayWin - homeWin >= 0.1 ? match.away : null;
  return { homeWin, draw, awayWin, favourite };
}
