/**
 * The board refresh schedule, exactly as `.github/workflows/refresh.yml` runs it (cron in UTC).
 * schedule.test.ts reads the workflow file and fails if the two ever drift apart.
 */
export const REFRESH_CRONS = ["17 7 * * *", "43 22 * * *", "23 13 * * 2", "23 17 * * 5"] as const;

export type CronSpec = { minute: number; hour: number; weekday: number | null };

export function parseCron(expr: string): CronSpec {
  const [minute, hour, , , weekday] = expr.trim().split(/\s+/);
  return { minute: Number(minute), hour: Number(hour), weekday: weekday === "*" ? null : Number(weekday) };
}

/** Every scheduled run in [from, to), oldest first. */
export function runsBetween(from: Date, to: Date, crons: readonly string[] = REFRESH_CRONS): Date[] {
  const specs = crons.map(parseCron);
  const out: Date[] = [];
  const day = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate() - 1));
  while (day.getTime() < to.getTime()) {
    for (const spec of specs) {
      if (spec.weekday !== null && day.getUTCDay() !== spec.weekday) continue;
      const at = new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate(), spec.hour, spec.minute));
      if (at.getTime() >= from.getTime() && at.getTime() < to.getTime()) out.push(at);
    }
    day.setUTCDate(day.getUTCDate() + 1);
  }
  return out.sort((a, b) => a.getTime() - b.getTime());
}

export function nextRun(now: Date, crons: readonly string[] = REFRESH_CRONS): Date | null {
  return runsBetween(now, new Date(now.getTime() + 8 * 86_400_000), crons)[0] ?? null;
}

const MADRID = "Europe/Madrid";
const partsFormat = new Intl.DateTimeFormat("en-GB", {
  timeZone: MADRID,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

/** Madrid calendar day ("2026-09-21") and hour of day as a decimal (14.5 = 14:30). */
export function madridClock(at: Date): { day: string; hour: number } {
  const parts = Object.fromEntries(partsFormat.formatToParts(at).map((p) => [p.type, p.value]));
  return { day: `${parts.year}-${parts.month}-${parts.day}`, hour: Number(parts.hour) + Number(parts.minute) / 60 };
}

/** Today's scheduled runs in Madrid time, for the Control Center's 24-hour dial. */
export function todaysRuns(now: Date, crons: readonly string[] = REFRESH_CRONS): Date[] {
  const today = madridClock(now).day;
  return runsBetween(new Date(now.getTime() - 30 * 3_600_000), new Date(now.getTime() + 30 * 3_600_000), crons).filter(
    (at) => madridClock(at).day === today,
  );
}
