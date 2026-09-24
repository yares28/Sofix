import { describe, expect, it } from "vitest";
import type { GameweekPlan, Sorare, Status } from "./play";
import { ago, heroOf, railOf, syncState } from "./sorareStatus";

// The refresh schedule runs 09:17 and 00:43 Madrid every day (plus Tue and Fri), so between a Wednesday
// afternoon build and a Friday 16:00 lock there are four runs.
const BUILT = "2026-09-23T14:07:00+00:00"; // Wed 16:07 Madrid
const LOCK = "2026-09-25T14:00:00+00:00"; // Fri 16:00 Madrid

const status = (over: Partial<Status> = {}): Status => ({
  builtAt: BUILT,
  where: "cloud",
  lastCloudAt: BUILT,
  moved: 0,
  kept: { gameweeks: 1, rows: 83, projections: 11, scored: 0 },
  ...over,
});

const data = (over: Partial<Status> = {}) => ({ status: status(over), nextId: "17" }) as Sorare;
const week = (source: "sorare" | "form" = "sorare", id = "17") =>
  ({ gameweek: { id, lock: LOCK }, source }) as unknown as GameweekPlan;

const now = (iso: string) => new Date(iso);

describe("how long ago", () => {
  it("picks the unit that reads best", () => {
    expect(ago(new Date(BUILT), now("2026-09-23T14:32:00Z"))).toBe("25 min");
    expect(ago(new Date(BUILT), now("2026-09-23T22:07:00Z"))).toBe("8 h");
    expect(ago(new Date(BUILT), now("2026-09-26T14:07:00Z"))).toBe("3 d");
  });
});

describe("the state of the sync", () => {
  it("says nothing at all before the job has ever recorded it", () => {
    expect(syncState({} as Sorare, week(), now("2026-09-23T14:32:00Z"))).toBeNull();
  });

  it("is fresh when the cloud built it from Sorare's own projections", () => {
    const sync = syncState(data(), week(), now("2026-09-23T14:32:00Z"))!;
    expect(sync.state).toBe("fresh");
    expect(sync.chip).toBe("synced 25 min ago");
    expect(sync.alert).toBeNull();
    expect(sync.runs).toHaveLength(4);
    expect(sync.runs.every((run) => !run.done)).toBe(true);
  });

  it("names the missing projections when the plan stood on form instead", () => {
    const sync = syncState(data(), week("form"), now("2026-09-23T14:32:00Z"))!;
    expect(sync.state).toBe("waiting");
    expect(sync.alert?.title).toContain("before Sorare published");
    expect(sync.alert?.detail).toContain("00:43"); // the next run picks the real numbers up
    expect(sync.behind).toBe(true);
  });

  it("says nothing against the cloud before it has had a turn", () => {
    const sync = syncState(data({ where: "pc", lastCloudAt: null }), week(), now("2026-09-23T14:32:00Z"))!;
    expect(sync.state).toBe("pending");
    expect(sync.alert).toBeNull(); // a run that hasn't come round yet has skipped nothing
    expect(sync.behind).toBe(false);
    expect(sync.chip).toBe("built on your PC · the cloud runs at 00:43");
  });

  it("only blames the secret once a scheduled run has come and gone", () => {
    const sync = syncState(data({ where: "pc", lastCloudAt: null }), week(), now("2026-09-23T23:00:00Z"))!;
    expect(sync.state).toBe("cloudless");
    expect(sync.alert?.title).toContain("came and went");
    expect(sync.alert?.detail).toContain("your .env only reaches runs started on this machine");
    expect(sync.behind).toBe(true);
    expect(sync.alert?.href).toBe("/control");
  });

  it("forgives one missed run, not two", () => {
    const pc = data({ where: "pc", lastCloudAt: "2026-09-22T22:43:00+00:00" });
    expect(syncState(pc, week(), now("2026-09-23T23:00:00Z"))!.state).toBe("fresh"); // one run has passed
    const later = syncState(pc, week(), now("2026-09-24T08:00:00Z"))!; // two have
    expect(later.state).toBe("cloudless");
    expect(later.alert?.title).toContain("stopped syncing");
  });

  it("goes quiet once the gameweek has locked", () => {
    const sync = syncState(data(), week(), now("2026-09-25T17:00:00Z"))!;
    expect(sync.state).toBe("stale");
    expect(sync.chip).toBe("locked");
  });
});

describe("the hero number", () => {
  it("counts the rebuilds left, and says when the last one lands", () => {
    const sync = syncState(data(), week(), now("2026-09-23T14:32:00Z"))!;
    expect(heroOf(sync, now("2026-09-23T14:32:00Z"))).toEqual({
      value: "4",
      unit: "runs",
      caption: "left before the lock, the last at 09:17",
    });
  });

  it("counts the age instead when the cloud has been given a turn and skipped it", () => {
    const sync = syncState(data({ where: "pc", lastCloudAt: null }), week(), now("2026-09-24T08:00:00Z"))!;
    expect(heroOf(sync, now("2026-09-24T08:00:00Z"))).toMatchObject({ value: "18", unit: "h" });
  });

  it("points at the cloud's first turn while it is still to come", () => {
    const sync = syncState(data({ where: "pc", lastCloudAt: null }), week(), now("2026-09-23T14:32:00Z"))!;
    expect(heroOf(sync, now("2026-09-23T14:32:00Z")).caption).toContain("the cloud's turn at 00:43");
  });

  it("says plainly when no run is left", () => {
    const late = syncState(data(), week(), now("2026-09-25T13:00:00Z"))!;
    expect(heroOf(late, now("2026-09-25T13:00:00Z")).caption).toContain("this is the plan");
  });
});

describe("the run line", () => {
  it("runs from the build to the lock, marking the runs that have happened", () => {
    const sync = syncState(data(), week(), now("2026-09-24T08:00:00Z"))!;
    const rail = railOf(sync);
    expect(rail[0]).toMatchObject({ at: 3, done: true });
    expect(rail[rail.length - 1]).toMatchObject({ at: 100, lock: true });
    expect(rail.filter((mark) => mark.done)).toHaveLength(3); // the build, then the 00:43 and 09:17 runs
    const middle = rail.slice(1, -1).map((mark) => mark.at);
    expect(middle).toEqual([...middle].sort((a, b) => a - b));
    expect(Math.min(...middle)).toBeGreaterThan(3);
    expect(Math.max(...middle)).toBeLessThan(100);
  });
});

describe("a week you opened to look ahead", () => {
  it("says it stands on form, whatever the cloud is doing", () => {
    const sync = syncState(data({ where: "pc", lastCloudAt: null }), week("form", "19"), now("2026-09-23T14:32:00Z"))!;
    expect(sync.state).toBe("waiting");
    expect(sync.chip).toContain("from form");
    expect(sync.behind).toBe(false); // these are the best numbers that exist yet, not stale ones
    expect(sync.alert).toBeNull();
  });

  it("still lets the cloud warning through on the gameweek being planned", () => {
    const sync = syncState(data({ where: "pc", lastCloudAt: null }), week("form", "17"), now("2026-09-23T23:00:00Z"))!;
    expect(sync.state).toBe("cloudless");
  });
});
