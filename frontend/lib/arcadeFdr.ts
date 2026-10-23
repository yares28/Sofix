import type { Competition } from "./competitions";
import type { FixtureGrid } from "./types";

/**
 * Arcade and the league boards (owner, 21 Oct 2026: link Arcade to the new Premier League and Bundesliga FDR). Arcade's games come from
 * Sorare; the boards' fixtures from football-data. A Sorare game is the board's fixture in the same league at the same kick-off, told
 * apart by the clubs' names when two kick off together. Only shown, never folded into a card's points: no model was checked for that.
 */

/** One side of a board fixture: the club and how hard the game is for it (1 = easiest), its clean-sheet chance and expected goals. */
export type FdrSide = { code: string; name: string; bucket: 1 | 2 | 3 | 4 | 5; label: string; cleanSheet: number | null; xgFor: number | null; xgAgainst: number | null };
export type FdrFixture = { league: Competition; kickoff: string; home: FdrSide; away: FdrSide };

/** Sorare's competition slug for each board. */
export const BOARD_OF: Record<string, Competition> = { "laliga-es": "PD", "premier-league-gb-eng": "PL", "bundesliga-de": "BL1", "ligue-1-fr": "FL1", "uefa-champions-league":"CL", "uefa-europa-league":"EL", "uefa-europa-conference-league":"CONF" };

/** The board's scheduled fixtures between two times, both sides with their difficulty; a side the model has not rated is left out. */
export function boardFixtures(grid: FixtureGrid, league: Competition, from: number, to: number): FdrFixture[] {
  const byId = new Map<number, { kickoff: string; home?: FdrSide; away?: FdrSide }>();
  for (const team of grid.teams) {
    for (const cells of team.cells) {
      for (const cell of cells) {
        const at = Date.parse(cell.kickoff_utc);
        if (cell.status !== "scheduled" || !cell.prediction || at < from || at > to) continue;
        const p = cell.prediction;
        const side: FdrSide = { code: team.code, name: team.name, bucket: p.bucket, label: p.label, cleanSheet: p.clean_sheet, xgFor: p.xg_for, xgAgainst: p.xg_against };
        const entry = byId.get(cell.fixture_id) ?? { kickoff: cell.kickoff_utc };
        entry[cell.venue === "H" ? "home" : "away"] = side;
        byId.set(cell.fixture_id, entry);
      }
    }
  }
  return [...byId.values()].flatMap((f) => (f.home && f.away ? [{ league, kickoff: f.kickoff, home: f.home, away: f.away }] : []));
}

const STOP = new Set(["fc", "cf", "afc", "sc", "ac", "cd", "ud", "rc", "rcd", "sd", "ca", "club", "de", "del", "la", "the", "and", "fsv", "vfl", "vfb", "tsg", "sv", "bv", "hotspur", "albion", "balompie"]);
const tokens = (name: string) => name.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().split(/[^a-z0-9]+/).filter((t) => t.length > 2 && !STOP.has(t));
/** Words two club names share (a word may be the other's start: "atletico" and "atl"). */
export function nameMatch(a: string, b: string): number {
  const x = tokens(a), y = tokens(b);
  return x.filter((t) => y.some((u) => t === u || (Math.min(t.length, u.length) >= 3 && (t.startsWith(u) || u.startsWith(t))))).length;
}

/** The board's fixture for a Sorare game: same league, kick-off within 20 minutes, and the clubs' names when two are that close. */
export function matchFixture(game: { kickoff: string; competition: { slug: string }; home: { name: string } | null; away: { name: string } | null }, fixtures: FdrFixture[]): FdrFixture | null {
  const league = BOARD_OF[game.competition.slug];
  if (!league) return null;
  const at = Date.parse(game.kickoff);
  const near = fixtures.filter((f) => f.league === league && Math.abs(Date.parse(f.kickoff) - at) <= 20 * 60_000);
  const scored = near.map((f) => ({ f, score: nameMatch(game.home?.name ?? "", f.home.name) + nameMatch(game.away?.name ?? "", f.away.name) })).sort((a, b) => b.score - a.score);
  if (scored.length === 1) return scored[0]!.f;
  return scored[0] && scored[0].score > 0 && scored[0].score > (scored[1]?.score ?? -1) ? scored[0].f : null;
}
