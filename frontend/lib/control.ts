import { relativeTime } from "./grid";
import { isStale } from "./refresh";
import { madridClock, nextRun, todaysRuns } from "./schedule";

/** What the Control Center shows. Built from the database (lib/system.ts) and the refresh schedule. */
export type RunSummary = {
  id: number;
  trigger: string;
  status: string;
  startedAt: string;
  finishedAt: string | null;
  seconds: number | null;
};
export type Limits = {
  oddsCredits: number | null;
  oddsCreditsAt: string | null;
  databaseBytes: number | null;
  databaseLimitBytes: number;
};
export type ExtensionStatus = { version: string; sorareUser: string | null; seenAt: string };
/** `paused`: Neon's free plan hit a monthly limit, so nothing could be read (see isDatabasePaused). */
export type SystemStatus = { runs: RunSummary[]; limits: Limits | null; extension: ExtensionStatus | null; paused?: boolean };

export const ODDS_MONTHLY_CREDITS = 500;
/** A scheduled run counts as done when a schedule-triggered run started this long after its slot. */
const SCHEDULE_SLACK_MS = 90 * 60_000;
/**
 * The extension checks in when something changes and otherwise every 6 hours (each check-in wakes Neon, so it is
 * kept rare); after two missed check-ins it counts as gone.
 */
export const EXTENSION_CHECKIN_MS = 6 * 3_600_000;
const EXTENSION_GONE_MS = 2 * EXTENSION_CHECKIN_MS + 3_600_000;

const hm = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Madrid", hour: "2-digit", minute: "2-digit" });
const dayMonth = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Madrid", day: "numeric", month: "short" });
const dayMonthUtc = new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", day: "numeric", month: "short" });

/**
 * Neon's free plan suspends the database until the next month once the compute or data-transfer allowance runs
 * out; every query then fails with "…exceeded the compute time quota…" (or "data transfer quota").
 */
export function isDatabasePaused(message: string): boolean {
  return /exceeded the [a-z ]*quota/i.test(message);
}

/** When a paused free-plan database comes back: the first day of the next month (UTC, like Neon's billing). */
export function resumeLabel(now: Date): string {
  return dayMonthUtc.format(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)));
}

/**
 * The extension answers pings from this Chrome right away, while its check-in reaches the database later (and the
 * page is cached): prefer what it just said.
 */
export function withLiveExtension(
  system: SystemStatus | null,
  live: { version: string; sorareUser: string | null } | null,
  now: Date,
): SystemStatus | null {
  if (!live) return system;
  const base = system ?? { runs: [], limits: null, extension: null };
  const sorareUser = live.sorareUser ?? base.extension?.sorareUser ?? null;
  return { ...base, extension: { version: live.version, sorareUser, seenAt: now.toISOString() } };
}

/** Setup ends once the extension has checked in with a Sorare account. Unknown (so not nagged) without the database. */
export function setupLeft(system: SystemStatus | null): boolean {
  return Boolean(system && !system.paused && !system.extension?.sorareUser);
}

export function nextRunLabel(now: Date): string | null {
  const next = nextRun(now);
  if (!next) return null;
  const sameDay = madridClock(next).day === madridClock(now).day;
  return sameDay ? hm.format(next) : `tomorrow ${hm.format(next)}`;
}

export type PulseState = "good" | "setup" | "stale" | "failed" | "paused";
export type Pulse = { state: PulseState; title: string; detail: string };

/** The status pill's words, one per state. */
export const PILL_LABEL: Record<PulseState, string> = {
  good: "All good",
  setup: "1 step left",
  stale: "Data is old",
  failed: "Refresh failed",
  paused: "Paused",
};

/** The most urgent thing first: a paused database, a failed refresh, old data, then setup left to finish. */
export function pulseOf(system: SystemStatus | null, syncedAt: string | null, now: Date): Pulse {
  const last = system?.runs.at(-1);
  const next = nextRunLabel(now);
  const updated = syncedAt ? `Updated ${relativeTime(syncedAt, now)}` : "Not updated yet";
  const schedule = `${updated}${next ? ` · next ${next}` : ""}`;
  if (system?.paused) {
    return { state: "paused", title: "Database paused", detail: `Free limit reached · back on ${resumeLabel(now)}` };
  }
  if (last?.status === "failed") {
    return { state: "failed", title: "Last refresh failed", detail: "The board keeps the last good data" };
  }
  if (isStale(syncedAt, now.getTime())) {
    return { state: "stale", title: "Data is getting old", detail: schedule };
  }
  if (setupLeft(system)) {
    const added = Boolean(system?.extension);
    return { state: "setup", title: "One step left", detail: added ? "Open sorare.com once, signed in" : "Add the extension to link Sorare" };
  }
  return { state: "good", title: "All good", detail: schedule };
}

export type DialMark = { hour: number; label: string; kind: "done" | "missed" | "todo" };

export function dialOf(runs: RunSummary[], now: Date): { marks: DialMark[]; nowHour: number } {
  const marks = todaysRuns(now).map((at): DialMark => {
    const label = hm.format(at);
    const hour = madridClock(at).hour;
    if (at.getTime() > now.getTime()) return { hour, label, kind: "todo" };
    const ran = runs.some((run) => {
      const started = Date.parse(run.startedAt);
      return run.trigger === "schedule" && started >= at.getTime() - 5 * 60_000 && started <= at.getTime() + SCHEDULE_SLACK_MS;
    });
    return { hour, label, kind: ran ? "done" : "missed" };
  });
  return { marks, nowHour: madridClock(now).hour };
}

/** One refresh as a bar. `day` is short ("16/9") so seven bars fit side by side; `when` is for the tooltip. */
export type Bar = { id: number; seconds: number | null; status: string; trigger: string; day: string; when: string };

export function barsOf(runs: RunSummary[], count = 6): Bar[] {
  return runs.slice(-count).map((run) => {
    const at = new Date(run.startedAt);
    const [, month, day] = madridClock(at).day.split("-");
    return {
      id: run.id,
      seconds: run.seconds == null ? null : Math.round(run.seconds),
      status: run.status,
      trigger: run.trigger,
      day: `${Number(day)}/${Number(month)}`,
      when: `${dayMonth.format(at)} ${hm.format(at)}`,
    };
  });
}

export type Capsule = { name: string; value: string; fraction: number; sub: string };

export function capsulesOf(limits: Limits | null): Capsule[] {
  const out: Capsule[] = [];
  if (limits?.oddsCredits != null) {
    out.push({
      name: "Odds API",
      value: String(limits.oddsCredits),
      fraction: Math.min(1, Math.max(0, limits.oddsCredits / ODDS_MONTHLY_CREDITS)),
      sub: `of ${ODDS_MONTHLY_CREDITS} credits`,
    });
  }
  if (limits?.databaseBytes != null && limits.databaseLimitBytes > 0) {
    const free = 1 - limits.databaseBytes / limits.databaseLimitBytes;
    out.push({ name: "Neon", value: `${Math.floor(free * 100)}%`, fraction: Math.max(0, free), sub: "storage free" });
  }
  // A public repository runs GitHub Actions on standard runners for free, without a minutes cap.
  out.push({ name: "GitHub", value: "∞", fraction: 1, sub: "free minutes" });
  return out;
}

export type ChainNode = { id: "sorare" | "extension" | "app" | "jobs"; label: string; sub: string; on: boolean };

export function chainOf(system: SystemStatus | null, now: Date): ChainNode[] {
  const ext = system?.extension ?? null;
  const extAlive = Boolean(ext && now.getTime() - Date.parse(ext.seenAt) < EXTENSION_GONE_MS);
  const lastScheduled = system?.runs.filter((run) => run.trigger === "schedule").at(-1);
  const jobsOn = Boolean(lastScheduled && now.getTime() - Date.parse(lastScheduled.startedAt) < 36 * 3_600_000);
  return [
    { id: "sorare", label: "sorare.com", sub: extAlive && ext?.sorareUser ? ext.sorareUser : "sign in", on: extAlive && Boolean(ext?.sorareUser) },
    { id: "extension", label: "Extension", sub: extAlive && ext ? `v${ext.version}` : ext ? "not seen lately" : "not added", on: extAlive },
    { id: "app", label: "Sofix", sub: "online", on: true },
    { id: "jobs", label: "Cloud jobs", sub: jobsOn ? "on a clock" : "waiting for first run", on: jobsOn },
  ];
}
