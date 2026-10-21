import type { FixtureGrid, GridMatchday } from "./types";

export const COMPETITIONS = { PD: "LaLiga", PL: "Premier League", BL1: "Bundesliga" } as const;
export type Competition = keyof typeof COMPETITIONS;
export const competitionOf = (value: unknown): Competition => value === "PL" || value === "BL1" ? value : "PD";
export const leagueName = (grid: Pick<FixtureGrid, "competition">) => COMPETITIONS[competitionOf(grid.competition)];
export function validDay(day: string | null | undefined): day is string {
  if (!day || !/^\d{4}-\d{2}-\d{2}$/.test(day)) return false;
  const parsed = new Date(day);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === day;
}

export function competitionHref(path: string, search: string, league: Competition, week?: string, through?: string) {
  const params = new URLSearchParams(search);
  params.set("league", league);
  if (!params.has("w") && week) params.set("w", week);
  if (!params.has("end") && through) params.set("end", through.slice(0, 10));
  params.delete("gw");
  params.delete("pins");
  return `${path}?${params}`;
}

/** A calendar date survives league changes; numeric rounds never do. */
export function leagueColumn(rounds: GridMatchday[], date: string, end?: string): number | null {
  const day = date.slice(0, 10);
  if (!validDay(day)) return null;
  const through = end?.slice(0, 10) ?? new Date(Date.parse(day) + 6 * 86400000).toISOString().slice(0, 10);
  if (!validDay(through) || through < day) return null;
  const index = rounds.findIndex(r => r.date_from.slice(0, 10) <= through && r.date_to.slice(0, 10) >= day);
  return index < 0 ? null : index;
}
