import { formatDay } from "./grid";
import type { Bucket, FixtureGrid } from "./types";

/** Small shared helpers left from the old home: dates, board links and club matching. */

/** "9–12 Oct", "30 Sep – 2 Oct" (Madrid dates). */
export function dateRange(from: string, to: string): string {
  const [a, b] = [formatDay(from), formatDay(to)];
  if (a === b) return a;
  const [dayA, monthA] = a.split(" ");
  const [dayB, monthB] = b.split(" ");
  return monthA === monthB ? `${dayA}–${dayB} ${monthB}` : `${a} – ${b}`;
}

/** Club words Sorare adds and the board does not: "FC Barcelona" and "Barcelona" are the same club. */
const CLUB_WORDS = new Set(["fc", "cf", "ud", "rc", "cd", "ac", "sc", "sad", "de", "club"]);

/**
 * Clubs Sorare names differently from the board even without those words ("Deportivo Alavés" is "Alavés" on the
 * board), as club key -> the board's club key. Checked against Sorare's LaLiga club list on 2026-09-29 and again on 2026-10-03,
 * when "Celta de Vigo" (the board says "Celta") was found missing: all 20 names are in overlay.test.ts.
 */
const CLUB_ALIASES: Record<string, string> = {
  "deportivo alaves": "alaves",
  "deportivo la coruna": "deportivo",
  "celta vigo": "celta",
};

export const clubKey = (name: string): string => {
  const words = name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean);
  const kept = words.filter((word) => !CLUB_WORDS.has(word));
  const key = (kept.length ? kept : words).join(" ");
  return CLUB_ALIASES[key] ?? key;
};

export const NATIONAL_COMPETITION = /(nations-league|world-cup|euro-qual|olympic|international)/i;

export interface SideOutlook {
  club: string;
  opponent: string;
  win: number | null;
  cleanSheet: number | null;
  /** The goals the model expects his side to score in the game. */
  xgFor: number | null;
  /** The board's result difficulty, 0–100 and 1 (easiest) to 5, with its plain-language label. */
  difficulty: number | null;
  bucket: Bucket | null;
  label: string | null;
}

/**
 * Each club's own forecast for a fixture, keyed by club, venue and opponent. A season has one home meeting,
 * so the names are the game. Anything we cannot name on both sides is left out: the model only rates LaLiga.
 */
export function sideOutlook(grid: FixtureGrid): Map<string, SideOutlook> {
  const byCode = new Map(grid.teams.map((team) => [team.code, team]));
  const index = new Map<string, SideOutlook>();
  for (const team of grid.teams) {
    for (const column of team.cells) {
      for (const cell of column) {
        const opponent = byCode.get(cell.opponent_code);
        if (!opponent) continue;
        const key = `${clubKey(team.name)}|${cell.venue}|${clubKey(opponent.name)}`;
        const next: SideOutlook = {
          club: team.name,
          opponent: opponent.name,
          win: cell.prediction?.probabilities.win ?? null,
          cleanSheet: cell.prediction?.clean_sheet ?? null,
          xgFor: cell.prediction?.xg_for ?? null,
          difficulty: cell.prediction?.difficulty ?? null,
          bucket: cell.prediction?.bucket ?? null,
          label: cell.prediction?.label ?? null,
        };
        const prev = index.get(key);
        if (!prev || (prev.win === null && next.win !== null)) index.set(key, next);
      }
    }
  }
  return index;
}

/** The board page a tile opens, keeping the gameweek unless it's the default one. */
export function boardHref(path: string, grid: FixtureGrid, column: number, opening: number): string {
  return column === opening ? path : `${path}?gw=${grid.matchdays[column]!.number}`;
}
