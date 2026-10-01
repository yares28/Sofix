/**
 * Pure display logic for the Home's team news (plans/futbolfantasy.md, S5): how the split of players is drawn, and how a
 * row words its game. The numbers themselves come from the job (`TeamNews` in lib/play.ts); nothing is worked out twice.
 */
import { timeUntil, type NewsGame, type NewsMove, type TeamNews } from "./play";

type Split = TeamNews["split"];
export type Band = keyof Split;

const BANDS: { key: Band; label: string }[] = [
  { key: "likely", label: "likely to start" },
  { key: "doubtful", label: "in doubt" },
  { key: "unlikely", label: "unlikely" },
  { key: "out", label: "out" },
];

/** The bands that have someone in them, sized by their count; the last sliver is kept visible however few are in it. */
export function shares(split: Split): { key: Band; count: number; flex: number }[] {
  return BANDS.filter(({ key }) => split[key] > 0).map(({ key }) => ({ key, count: split[key], flex: key === "out" ? Math.max(split[key], 1.6) : split[key] }));
}

export function splitLabel(split: Split): string {
  return BANDS.filter(({ key }) => split[key] > 0)
    .map(({ key, label }) => `${split[key]} ${label}`)
    .join(", ");
}

const madrid = (iso: string, options: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Madrid", ...options }).format(new Date(iso));
const weekday = (iso: string) => madrid(iso, { weekday: "short" });
const clock = (iso: string) => madrid(iso, { hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
const dayKey = (iso: string | Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Madrid" }).format(typeof iso === "string" ? new Date(iso) : iso);

/** "v Deportivo · Sun 16:15": his opponent (v at home, at away) and the kickoff in Madrid time. */
export function gameLine(game: NewsGame): string {
  const who = game.venue === "H" ? `v ${game.opponent}` : game.venue === "A" ? `at ${game.opponent}` : game.opponent;
  return `${who} · ${weekday(game.kickoff)} ${clock(game.kickoff)}`;
}

const STATUS_WORD: Record<string, string> = { out: "Out", doubt: "Doubt", suspended: "Suspended" };

/** What to put under a moved player's name: what the site says of him, or else his game. */
export function movedWhy(move: Pick<NewsMove, "kind" | "game">): string {
  return (move.kind && STATUS_WORD[move.kind]) || gameLine(move.game);
}

/** "Locks Fri 21:00 · in 2 d 7 h", "Locks Wed 20:00 · in 6 h" or "Locked". */
export function lockChip(lock: string, now: Date): string {
  const left = timeUntil(lock, now);
  if (left.past) return "Locked";
  const span = left.days ? `${left.days} d ${left.hours} h` : left.hours ? `${left.hours} h` : `${left.minutes} min`;
  return `Locks ${weekday(lock)} ${clock(lock)} · in ${span}`;
}

/** What a comparison is against: yesterday's reading, or the day and time of an older one. */
export function sinceLabel(since: string, now: Date): string {
  const yesterday = new Date(now.getTime() - 86_400_000);
  return dayKey(since) === dayKey(yesterday) ? "since yesterday" : `since ${weekday(since)} ${clock(since)}`;
}
