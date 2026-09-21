import { describe, expect, it } from "vitest";
import {
  barsOf,
  capsulesOf,
  chainOf,
  dialOf,
  isDatabasePaused,
  PILL_LABEL,
  pulseOf,
  resumeLabel,
  setupLeft,
  withLiveExtension,
  type RunSummary,
  type SystemStatus,
} from "./control";

const NOW = new Date("2026-09-21T12:00:00Z"); // Monday 14:00 in Madrid

const run = (id: number, startedAt: string, trigger = "cli", status = "succeeded", seconds = 8): RunSummary => ({
  id,
  trigger,
  status,
  startedAt,
  finishedAt: new Date(Date.parse(startedAt) + seconds * 1000).toISOString(),
  seconds,
});

const system = (runs: RunSummary[], extra: Partial<SystemStatus> = {}): SystemStatus => ({ runs, limits: null, extension: null, ...extra });
const LINKED = { version: "0.1.0", sorareUser: "Yares", seenAt: "2026-09-21T11:40:00Z" };

describe("pulse", () => {
  it("is good when the data is fresh and setup is done, with the next run", () => {
    const pulse = pulseOf(system([run(1, "2026-09-21T07:18:00Z", "schedule")], { extension: LINKED }), "2026-09-21T07:18:30Z", NOW);
    expect(pulse.state).toBe("good");
    expect(pulse.detail).toBe("Updated 5 h ago · next tomorrow 00:43");
  });

  it("flags a failed last run first", () => {
    expect(pulseOf(system([run(1, "2026-09-21T07:18:00Z", "schedule", "failed")]), "2026-09-21T07:18:30Z", NOW).state).toBe("failed");
  });

  it("flags stale data before setup", () => {
    expect(pulseOf(system([]), "2026-09-19T08:00:00Z", NOW).state).toBe("stale");
  });

  it("asks for the extension until it checks in, then for sorare.com until it knows the account", () => {
    const fresh = "2026-09-21T11:00:00Z";
    expect(pulseOf(system([]), fresh, NOW)).toMatchObject({ state: "setup", detail: "Add the extension to link Sorare" });
    const added = system([], { extension: { ...LINKED, sorareUser: null } });
    expect(pulseOf(added, fresh, NOW)).toMatchObject({ state: "setup", detail: "Open sorare.com once, signed in" });
    expect(PILL_LABEL.setup).toBe("1 step left");
  });

  it("doesn't nag about setup without the database (local development)", () => {
    expect(setupLeft(null)).toBe(false);
    expect(pulseOf(null, "2026-09-21T11:00:00Z", NOW).state).toBe("good");
  });

  it("says when a paused database comes back, before anything else", () => {
    const pulse = pulseOf(system([], { paused: true }), "2026-09-19T08:00:00Z", NOW);
    expect(pulse).toMatchObject({ state: "paused", title: "Database paused", detail: "Free limit reached · back on 1 Oct" });
    expect(setupLeft(system([], { paused: true }))).toBe(false);
  });
});

describe("paused database", () => {
  it("recognises Neon's free-plan limit errors only", () => {
    expect(isDatabasePaused("Your account or project has exceeded the compute time quota. Upgrade your plan to increase limits.")).toBe(true);
    expect(isDatabasePaused("Your project has exceeded the data transfer quota. Upgrade your plan to increase limits.")).toBe(true);
    expect(isDatabasePaused("fetch failed")).toBe(false);
    expect(isDatabasePaused('relation "read_models" does not exist')).toBe(false);
  });

  it("comes back on the first of next month, across the year end", () => {
    expect(resumeLabel(new Date("2026-12-31T23:00:00Z"))).toBe("1 Jan");
  });
});

describe("live extension", () => {
  it("prefers what the extension just said over the cached check-in", () => {
    const merged = withLiveExtension(system([]), { version: "0.1.1", sorareUser: "Yares" }, NOW);
    expect(merged?.extension).toEqual({ version: "0.1.1", sorareUser: "Yares", seenAt: NOW.toISOString() });
    expect(setupLeft(merged)).toBe(false);
  });

  it("keeps the known account when the extension hasn't seen sorare.com since it restarted", () => {
    const merged = withLiveExtension(system([], { extension: LINKED }), { version: "0.1.0", sorareUser: null }, NOW);
    expect(merged?.extension?.sorareUser).toBe("Yares");
  });

  it("changes nothing without an answer", () => {
    const stored = system([]);
    expect(withLiveExtension(stored, null, NOW)).toBe(stored);
  });
});

describe("dial", () => {
  it("marks past slots done only when a scheduled run happened", () => {
    const { marks, nowHour } = dialOf([run(1, "2026-09-21T07:21:00Z", "schedule")], NOW);
    expect(nowHour).toBe(14);
    expect(marks.map((m) => [m.label, m.kind])).toEqual([
      ["00:43", "missed"],
      ["09:17", "done"],
    ]);
  });

  it("does not count a manual run as the scheduled one", () => {
    const { marks } = dialOf([run(1, "2026-09-21T07:21:00Z", "button")], NOW);
    expect(marks.find((m) => m.label === "09:17")?.kind).toBe("missed");
  });
});

describe("bars", () => {
  it("keeps the last six runs, oldest first", () => {
    const runs = Array.from({ length: 8 }, (_, i) => run(i + 1, `2026-09-1${i}T10:00:00Z`));
    expect(barsOf(runs).map((b) => b.id)).toEqual([3, 4, 5, 6, 7, 8]);
  });

  it("labels each bar short enough to sit side by side, in Madrid time, whole seconds", () => {
    const [bar] = barsOf([run(1, "2026-09-15T22:30:00Z", "schedule", "succeeded", 5.94)]);
    expect(bar).toMatchObject({ day: "16/9", when: "16 Sept 00:30", seconds: 6 });
  });
});

describe("capsules", () => {
  it("shows odds credits and free storage when known", () => {
    const caps = capsulesOf({ oddsCredits: 486, oddsCreditsAt: null, databaseBytes: 9_658_368, databaseLimitBytes: 536_870_912 });
    expect(caps.map((c) => [c.name, c.value])).toEqual([
      ["Odds API", "486"],
      ["Neon", "98%"],
      ["GitHub", "∞"],
    ]);
    expect(caps[0]?.fraction).toBeCloseTo(0.972);
  });

  it("hides what isn't known yet", () => {
    expect(capsulesOf(null).map((c) => c.name)).toEqual(["GitHub"]);
  });
});

describe("connection chain", () => {
  it("shows the extension as missing until it checks in", () => {
    const chain = chainOf(system([]), NOW);
    expect(chain.map((n) => [n.id, n.on])).toEqual([
      ["sorare", false],
      ["extension", false],
      ["app", true],
      ["jobs", false],
    ]);
    expect(chain[1]?.sub).toBe("not added");
  });

  it("lights up when the extension and the schedule are alive", () => {
    const chain = chainOf(
      system([run(1, "2026-09-21T07:18:00Z", "schedule")], {
        extension: { version: "0.1.0", sorareUser: "Yares", seenAt: "2026-09-21T11:40:00Z" },
      }),
      NOW,
    );
    expect(chain.every((n) => n.on)).toBe(true);
    expect(chain[0]?.sub).toBe("Yares");
  });

  it("drops the extension after two missed check-ins", () => {
    const chain = chainOf(system([], { extension: { version: "0.1.0", sorareUser: "Yares", seenAt: "2026-09-20T20:00:00Z" } }), NOW);
    expect(chain[1]).toMatchObject({ on: false, sub: "not seen lately" });
  });
});
