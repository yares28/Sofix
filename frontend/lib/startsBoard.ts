import { NO_ELEVENS, type Elevens, type LiveSource, type RecordWeek, type StartFix } from "./audit";
import type { StartSource } from "./play";

export const COMPETITIONS = [
  ["laliga-es", "LaLiga"], ["premier-league-gb-eng", "Premier League"],
  ["bundesliga-de", "Bundesliga"], ["ligue-1-fr", "Ligue 1"],
  ["uefa-champions-league", "Champions League"], ["uefa-europa-league", "Europa League"],
  ["uefa-europa-conference-league", "Conference League"],
] as const;
export const SOURCE_NAMES: Record<StartSource, string> = { futbolfantasy: "Futbol Fantasy", sorare: "Sorare", sofix: "Sofix" };
export const CHARTS = [["A", "A · Connected dots"], ["B", "B · Calibration"], ["C", "C · Paired bars"]] as const;
export type StartScope = { sources: Record<StartSource, LiveSource>; bands: Partial<Record<StartSource, StartFix[]>>; weeks: RecordWeek[]; elevens?: Elevens };
export type StartsBoard = { version: 1; all: StartScope; competitions: Record<string, StartScope> };
export type StartSelection = { competition: string; chart: string; source: StartSource; eleven: string; chartPage: number; elevenPage: number };

export function selection(params: Record<string, string | undefined> = {}): StartSelection {
  const page = (key: string) => /^\d+$/.test(params[key] ?? "") ? Math.max(0, Math.min(100, Number(params[key]) - 1)) : 0;
  return {
    competition: COMPETITIONS.some(([slug]) => slug === params.competition) ? params.competition! : "all",
    chart: CHARTS.some(([key]) => key === params.chart) ? params.chart! : "A",
    source: params.source === "sorare" || params.source === "sofix" ? params.source : "futbolfantasy",
    eleven: params.eleven === "weeks" || params.eleven === "clubs" ? params.eleven : "all",
    chartPage: page("chartPage"), elevenPage: page("elevenPage"),
  };
}

export function emptyScope(): StartScope {
  const source = (): LiveSource => ({ state: "none", recorded: 0, settled: 0, right: null, brier: null, mean: null, started: null, buckets: null });
  return { sources: { futbolfantasy: source(), sorare: source(), sofix: source() }, bands: {}, weeks: [], elevens: NO_ELEVENS };
}

export const casesLabel = (n: number) => `${n.toLocaleString("en-GB")} ${n === 1 ? "game" : "games"}`;
