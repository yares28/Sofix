// The league figures of the Audit page (plans/xscore.md P9 X5d): the new xScore against what happened, replayed over two LaLiga seasons.
// `lib/data/audit_league.json` is written by `python -m app.jobs.audit_league`; these helpers only read it, and say "too few to tell" under the floor.

export const FLOOR = 100;

export type Rate = { rate: number; lo: number | null; hi: number | null; pairs: number; games: number };
export type Band = { said: number; happened: number; n: number };
export type LeagueAudit = {
  asOf: string;
  through: string;
  starts: number;
  positions: { pos: "GK" | "DEF" | "MID" | "FWD"; now: Rate | null; before: Rate | null; sorare: Rate | null }[];
  weeks: { from: string; rate: number; pairs: number }[];
  miss: { from: number; step: number; counts: number[]; n: number; within7: number | null; within15: number | null };
  within7: { now: number | null; before: number | null; sorare: number | null };
  keeper: { games: number; range: number | null; bands: Band[]; said: number; happened: number };
  starts_calibration: { games: number; right: number; bands: Band[] };
};

export const POSITION_NAME = { GK: "Goalkeepers", DEF: "Defenders", MID: "Midfielders", FWD: "Forwards" } as const;

/** A share as a whole percent, or null when it is not there. */
export const pct = (v: number | null | undefined): number | null => (typeof v === "number" ? Math.round(v * 100) : null);

/** The part of the 45 to 65 scale a share sits at, 0 to 100: the pair charts run from a little under a coin flip to a little over what the best position reaches. */
export const PAIR_MIN = 0.45;
export const PAIR_MAX = 0.65;
export const alongPairs = (v: number): number => Math.min(100, Math.max(0, ((v - PAIR_MIN) / (PAIR_MAX - PAIR_MIN)) * 100));

/** Whether a figure has enough cases behind it to be drawn. */
export const enough = (r: Rate | null): r is Rate => !!r && r.games >= FLOOR;

export type WeeklyStory = { total: number; above: number; lowest: number; highest: number };
/** How many gameweeks beat a coin flip, and the lowest and highest. */
export function weeklyStory(weeks: LeagueAudit["weeks"]): WeeklyStory | null {
  if (!weeks.length) return null;
  const rates = weeks.map((w) => w.rate);
  return { total: weeks.length, above: rates.filter((r) => r > 0.5).length, lowest: Math.min(...rates), highest: Math.max(...rates) };
}

/** A bar's height for a weekly share on a 40 to 75 scale, 0 to 100. */
export const weekHeight = (rate: number): number => Math.min(100, Math.max(4, ((rate - 0.4) / 0.35) * 100));

/** The bars of the miss chart as shares of the tallest, and whether each is one of the four in the middle (the starts within 7 points). */
export function missBars(miss: LeagueAudit["miss"]): { h: number; middle: boolean }[] {
  const top = Math.max(1, ...miss.counts);
  const mid = Math.floor(miss.counts.length / 2);
  return miss.counts.map((c, i) => ({ h: Math.max(2, Math.round((c / top) * 100)), middle: i >= mid - 2 && i < mid + 2 }));
}

/** A calibration point's place on a square from 0 to `max`, as shares of its side, and its size in px by how many starts it holds. */
export function dot(band: Band, max: number): { x: number; y: number; size: number } {
  const clamp = (v: number) => Math.min(100, Math.max(0, (v / max) * 100));
  return { x: clamp(band.said), y: clamp(band.happened), size: Math.round(8 + Math.min(14, band.n / 40)) };
}

/** The scale of a calibration chart: the next five points up from the highest share in it, so the diagonal is not squashed. */
export function scaleMax(bands: Band[]): number {
  const top = Math.max(0.1, ...bands.flatMap((b) => [b.said, b.happened]));
  return Math.min(1, Math.ceil((top * 100) / 5) * 0.05);
}

export function asOfLabel(iso: string): string {
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(`${iso}T12:00:00Z`));
}
