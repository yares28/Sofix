/**
 * Is the Sorare gameweek on screen still worth acting on?
 *
 * Three things can be known without asking Sorare again, and nothing else is guessed:
 *  - **who built it** — the scheduled job in the cloud, or a run on the owner's PC (`status.where`);
 *  - **what it was built on** — Sorare's own projections, or the fallback of each player's last five games
 *    (`gameweek.source`), which tells us better numbers are still to come;
 *  - **when it will be rebuilt** — the refresh schedule, which `lib/schedule.ts` mirrors from the workflow.
 *
 * A plan is always current with the run that built it, so "Sorare has moved its numbers since" is not something
 * the app can know; `status.moved` is what the last run *found* had moved, which is a measure of churn, not a
 * warning. Display logic only: the numbers all come from the job.
 */

import type { GameweekPlan, Sorare, Status } from "./play";
import { runsBetween } from "./schedule";

export type Freshness = "fresh" | "pending" | "waiting" | "cloudless" | "stale";

export type SyncState = {
  state: Freshness;
  /** The state in the owner's words, short enough for a chip. */
  chip: string;
  /** Only when something is wrong: the headline, the line under it, and the one thing that fixes it. */
  alert: { title: string; detail: string; action: string; href: string } | null;
  /**
   * Whether what is on screen is actually out of date. A warning about the cloud is not the same thing: a plan
   * the PC built a minute ago is perfectly good, and dimming it would be crying wolf.
   */
  behind: boolean;
  builtAt: Date;
  /** Every scheduled run between the build and the lock; the ones already past are marked. */
  runs: { at: Date; done: boolean }[];
  /** The last run that can still rebuild it before the lock. */
  lastChance: Date | null;
  lock: Date;
};

const MISSED = 2; // runs a cloud that used to work may miss before it counts as having stopped

const clock = (at: Date) =>
  new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Madrid", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(at);

/** Rounded to the unit that reads best: "25 min", "8 h", "3 d". */
export function ago(from: Date, to: Date): string {
  const minutes = Math.max(0, Math.round((to.getTime() - from.getTime()) / 60_000));
  if (minutes < 90) return `${minutes} min`;
  const hours = Math.round(minutes / 60);
  return hours < 48 ? `${hours} h` : `${Math.round(hours / 24)} d`;
}

export function syncState(data: Sorare, week: GameweekPlan, now: Date): SyncState | null {
  const status: Status | undefined = data.status;
  if (!status) return null; // published before the job recorded any of this
  const builtAt = new Date(status.builtAt);
  const lock = new Date(week.gameweek.lock);
  const runs = runsBetween(builtAt, lock).map((at) => ({ at, done: at <= now }));
  const lastChance = runs.length ? runs[runs.length - 1]!.at : null;
  const missed = runs.filter((run) => run.done).length;
  const base = { builtAt, runs, lastChance, lock };

  // A week beyond the next one always stands on form, whatever the cloud is doing: Sorare publishes a projection
  // for a player's next fixture only. That is the fact worth showing on a page you opened to look ahead.
  const ahead = week.gameweek.id !== data.nextId && !week.played && now < lock;
  if (ahead && week.source === "form") {
    return {
      ...base,
      state: "waiting",
      behind: false, // nothing is out of date: these are simply the best numbers that exist yet
      chip: "from form — Sorare hasn't published this week",
      alert: null,
    };
  }

  // The cloud is the only thing that keeps this current while the PC is off, so its absence outranks everything —
  // but only once it has actually had a turn. A scheduled run that hasn't come round yet has skipped nothing.
  const never = !status.lastCloudAt;
  if (never && missed === 0) {
    const next = runs[0]?.at;
    return {
      ...base,
      state: "pending",
      behind: false,
      chip: next ? `built on your PC · the cloud runs at ${clock(next)}` : "built on your PC",
      alert: null,
    };
  }
  if (never || (status.where === "pc" && missed >= MISSED)) {
    return {
      ...base,
      state: "cloudless",
      behind: missed > 0,
      chip: never ? "the cloud skipped it" : `cloud last synced ${ago(new Date(status.lastCloudAt as string), now)} ago`,
      alert: {
        title: never ? "A scheduled run came and went without syncing Sorare" : "The scheduled job has stopped syncing Sorare",
        detail: `This gameweek is still the one your PC built ${ago(builtAt, now)} ago. The step skips itself when SORARE_API_KEY is missing from the repository secrets — the key in your .env only reaches runs started on this machine.`,
        action: "Check the secret",
        href: "/control",
      },
    };
  }

  if (now >= lock) return { ...base, state: "stale", chip: "locked", alert: null, behind: false };

  // Built before Sorare published: the plan will change on its own, and it is worth saying so.
  if (week.source === "form") {
    return {
      ...base,
      state: "waiting",
      behind: true,
      chip: "built without Sorare's projections",
      alert: {
        title: "Built before Sorare published its projections",
        detail: lastChance
          ? `Each player's last five games stood in. The next run picks up the real numbers at ${clock(runs.find((run) => !run.done)?.at ?? lastChance)}.`
          : "Each player's last five games stood in, and no run lands before the lock.",
        action: "Rebuild now",
        href: "/control",
      },
    };
  }

  return { ...base, state: "fresh", chip: `synced ${ago(builtAt, now)} ago`, alert: null, behind: false };
}

/** The hero of the panel: one number, and what it counts. */
export function heroOf(sync: SyncState, now: Date): { value: string; unit: string; caption: string } {
  const left = sync.runs.filter((run) => !run.done).length;
  if (sync.state === "cloudless") {
    const [value, unit] = ago(sync.builtAt, now).split(" ");
    return { value: value ?? "0", unit: unit ?? "min", caption: "since your PC built it — nothing else has" };
  }
  if (sync.state === "pending") {
    return {
      value: String(left),
      unit: left === 1 ? "run" : "runs",
      caption: `before the lock — the first is the cloud's turn at ${clock(sync.runs[0]!.at)}`,
    };
  }
  if (sync.state === "stale") return { value: "0", unit: "runs", caption: "the gameweek has locked" };
  if (!left) return { value: "0", unit: "runs", caption: "left before the lock: this is the plan" };
  return {
    value: String(left),
    unit: left === 1 ? "run" : "runs",
    caption: `left before the lock, the last at ${clock(sync.lastChance as Date)}`,
  };
}

/** Where each mark sits on the run line, as a percentage from the build to the lock. */
export function railOf(sync: SyncState): { at: number; label: string; done: boolean; lock?: boolean }[] {
  const from = sync.builtAt.getTime();
  const span = Math.max(1, sync.lock.getTime() - from);
  const place = (at: Date) => 3 + (97 - 3) * ((at.getTime() - from) / span);
  return [
    { at: 3, label: clock(sync.builtAt), done: true },
    ...sync.runs.map((run) => ({ at: place(run.at), label: clock(run.at), done: run.done })),
    { at: 100, label: clock(sync.lock), done: false, lock: true },
  ];
}
