import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { REFRESH_CRONS, madridClock, nextRun, parseCron, runsBetween, todaysRuns } from "./schedule";

describe("refresh schedule", () => {
  it("matches the crons in .github/workflows/refresh.yml", () => {
    const yml = readFileSync(join(__dirname, "..", "..", ".github", "workflows", "refresh.yml"), "utf8");
    const crons = [...yml.matchAll(/cron:\s*"([^"]+)"/g)].map((m) => m[1]);
    expect(crons).toEqual([...REFRESH_CRONS]);
  });

  it("parses minute, hour and weekday", () => {
    expect(parseCron("23 13 * * 2")).toEqual({ minute: 23, hour: 13, weekday: 2 });
    expect(parseCron("17 7 * * *")).toEqual({ minute: 17, hour: 7, weekday: null });
  });

  it("lists a Monday's runs in order, including the late Sorare slots", () => {
    // 21 Sep 2026 is a Monday
    const runs = runsBetween(new Date("2026-09-21T00:00:00Z"), new Date("2026-09-22T00:00:00Z"));
    expect(runs.map((d) => d.toISOString())).toEqual([
      "2026-09-21T07:17:00.000Z",
      "2026-09-21T12:07:00.000Z",
      "2026-09-21T13:37:00.000Z",
      "2026-09-21T15:07:00.000Z",
      "2026-09-21T22:43:00.000Z",
    ]);
  });

  it("adds the late Sorare slots on Europe days, and not on Friday", () => {
    const wednesday = runsBetween(new Date("2026-09-23T00:00:00Z"), new Date("2026-09-24T00:00:00Z")).map((d) =>
      d.toISOString(),
    );
    expect(wednesday).toEqual([
      "2026-09-23T07:17:00.000Z",
      "2026-09-23T12:07:00.000Z",
      "2026-09-23T13:37:00.000Z",
      "2026-09-23T15:07:00.000Z",
      "2026-09-23T22:43:00.000Z",
    ]);
    const friday = runsBetween(new Date("2026-09-25T00:00:00Z"), new Date("2026-09-26T00:00:00Z")).map((d) =>
      d.toISOString(),
    );
    expect(friday).not.toContain("2026-09-25T13:37:00.000Z");
    expect(friday).not.toContain("2026-09-25T15:07:00.000Z");
    expect(friday).toContain("2026-09-25T17:23:00.000Z");
  });

  it("adds Tuesday's extra run", () => {
    const runs = runsBetween(new Date("2026-09-22T00:00:00Z"), new Date("2026-09-23T00:00:00Z"));
    expect(runs.map((d) => d.toISOString())).toContain("2026-09-22T13:23:00.000Z");
  });

  it("finds the next run", () => {
    expect(nextRun(new Date("2026-09-21T12:00:00Z"))?.toISOString()).toBe("2026-09-21T12:07:00.000Z");
  });

  it("reads Madrid's clock across midnight", () => {
    // 22:43 UTC in September is 00:43 the next day in Madrid (CEST)
    expect(madridClock(new Date("2026-09-21T22:43:00Z"))).toEqual({ day: "2026-09-22", hour: 43 / 60 });
  });

  it("keeps today's runs in Madrid time", () => {
    const today = todaysRuns(new Date("2026-09-21T12:00:00Z")).map((d) => d.toISOString());
    // Madrid's Monday: 00:43, 09:17, 14:07, then 15:37 and 17:07 (two hours before a 17:30 or 19:00 deadline).
    expect(today).toEqual([
      "2026-09-20T22:43:00.000Z",
      "2026-09-21T07:17:00.000Z",
      "2026-09-21T12:07:00.000Z",
      "2026-09-21T13:37:00.000Z",
      "2026-09-21T15:07:00.000Z",
    ]);
  });
});
