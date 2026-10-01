import { relativeTime } from "./grid";

const MADRID = { timeZone: "Europe/Madrid", hourCycle: "h23" } as const;
const clock = (at: Date) => new Intl.DateTimeFormat("en-GB", { ...MADRID, hour: "2-digit", minute: "2-digit" }).format(at);
const dayClock = (at: Date) => new Intl.DateTimeFormat("en-GB", { ...MADRID, weekday: "short", hour: "2-digit", minute: "2-digit" }).format(at).replace(",", "");

/**
 * How fresh a reading is, written the same way on every page: how long ago, and the time it was made in Madrid. "9 h ago (03:33)";
 * "2 days ago (Tue 03:33)" once it is over a day old, so the time is not mistaken for today's.
 */
export function freshLabel(iso: string, now: Date): string {
  const at = new Date(iso);
  const over = now.getTime() - at.getTime() >= 86_400_000;
  return `${relativeTime(iso, now)} (${over ? dayClock(at) : clock(at)})`;
}
