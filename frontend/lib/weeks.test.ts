import { describe, expect, it } from "vitest";
import type { GameweekPlan, Sorare, TimelineWeek } from "./play";
import type { FixtureGrid, GridMatchday } from "./types";
import { byMonth, currentWeek, seasonWeeks, weekById, weekContext, weekDates, weekOn, weekValue } from "./weeks";

// The real shape of the 2026/27 season: LaLiga plays MD5–MD7 and then stops for an international break,
// while Sorare keeps running a game week every few days.
const ROUNDS: GridMatchday[] = [
  { number: 5, date_from: "2026-09-11T19:00:00Z", date_to: "2026-09-14T19:00:00Z", finished: true },
  { number: 6, date_from: "2026-09-15T17:00:00Z", date_to: "2026-09-17T19:30:00Z", finished: true },
  { number: 7, date_from: "2026-09-18T19:00:00Z", date_to: "2026-09-20T19:00:00Z", finished: true },
  { number: 8, date_from: "2026-10-09T19:00:00Z", date_to: "2026-10-12T19:00:00Z", finished: false },
] as GridMatchday[];

const TIMELINE: TimelineWeek[] = [
  { id: "13", slug: "a", number: 13, start: "2026-09-11T17:00:00Z", end: "2026-09-15T17:00:00Z", lock: "", status: "done" },
  { id: "14", slug: "b", number: 14, start: "2026-09-15T17:00:00Z", end: "2026-09-18T17:00:00Z", lock: "", status: "done" },
  { id: "15", slug: "c", number: 15, start: "2026-09-18T17:00:00Z", end: "2026-09-22T17:00:00Z", lock: "", status: "done" },
  { id: "16", slug: "d", number: 16, start: "2026-09-22T17:00:00Z", end: "2026-09-25T17:00:00Z", lock: "", status: "live" },
  { id: "17", slug: "e", number: 17, start: "2026-09-25T17:00:00Z", end: "2026-09-29T21:00:00Z", lock: "", status: "next" },
  { id: "19", slug: "f", number: 19, start: "2026-10-02T17:00:00Z", end: "2026-10-06T21:00:00Z", lock: "", status: "later" },
];

const week = (id: string, over: Partial<GameweekPlan> = {}): GameweekPlan =>
  ({
    gameweek: { id, slug: "s", number: Number(id), name: "", start: "", end: "", lock: "" },
    state: "ready",
    played: false,
    source: "sorare",
    playing: { cards: 13, players: [] },
    playable: [],
    blocked: [],
    notWorth: [],
    plans: [{ rank: 1, essence: 55, cash: 0, pAny: 0.16, rewards: 0.2, cardsUsed: 9, cardsAvailable: 87, lineups: [] }],
    ...over,
  }) as GameweekPlan;

const grid = { matchdays: ROUNDS } as FixtureGrid;
const sorare = {
  timeline: TIMELINE,
  nextId: "17",
  lastId: "15",
  weeks: [
    week("15", {
      played: true,
      plans: [
        { rank: 1, essence: 409, cash: 0, pAny: 0.6, rewards: 1, cardsUsed: 87, cardsAvailable: 87, lineups: [], actual: { essence: 500, cash: 0, cards: 87, paid: 1, inRange: 1 } },
      ],
    }),
    week("17"),
    week("19", { source: "form", playing: { cards: 14, players: [] } }),
  ],
} as Sorare;

const NOW = new Date("2026-09-24T10:00:00Z");

describe("the weeks of a season", () => {
  const weeks = seasonWeeks(grid, sorare, NOW);

  it("merges a LaLiga round into the Sorare week it falls in", () => {
    const md7 = weeks.find((w) => w.md === 7)!;
    expect(md7.number).toBe(15);
    expect(md7.id).toBe("2026-09-18");
  });

  it("gives each round to one game week only, where the windows touch", () => {
    // MD6 starts on 15 Sep, the day GW13 ends and GW14 begins: it belongs to GW14.
    expect(weeks.find((w) => w.md === 6)!.number).toBe(14);
    expect(weeks.filter((w) => w.number === 13)).toHaveLength(1);
  });

  it("keeps a week that has no LaLiga round at all", () => {
    const gw17 = weeks.find((w) => w.number === 17)!;
    expect(gw17.md).toBeNull();
    expect(gw17.state).toBe("next");
  });

  it("keeps a round Sorare has not opened a week for", () => {
    const md8 = weeks.find((w) => w.md === 8)!;
    expect(md8.gw).toBeNull();
    expect(weekValue(md8)).toEqual({ value: "—", note: "Sorare opens later" });
  });

  it("is in date order and has no duplicates", () => {
    const ids = weeks.map((w) => w.id);
    expect(ids).toEqual([...ids].sort());
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("carries what the job planned, and marks a replay as ours", () => {
    expect(weekValue(weeks.find((w) => w.number === 17)!)).toEqual({ value: "≈55", note: "1 plan" });
    expect(weekValue(weeks.find((w) => w.number === 15)!)).toEqual({ value: "500", note: "our plan's replay" });
    expect(weekValue(weeks.find((w) => w.number === 19)!)).toEqual({ value: "14", note: "cards play" });
  });

  it("knows which week is live and which is next", () => {
    expect(weeks.find((w) => w.number === 16)!.state).toBe("live");
    expect(currentWeek(weeks)!.number).toBe(17);
    expect(weekById(weeks, "2026-09-25")!.number).toBe(17);
    expect(weekById(weeks, "nope")).toBeNull();
  });
});

describe("how the picker groups and writes them", () => {
  const weeks = seasonWeeks(grid, sorare, NOW);

  it("puts a season into months", () => {
    const months = byMonth(weeks);
    expect(months.map((m) => m.label)).toEqual(["Sep", "Oct"]);
    expect(months[0]!.weeks.every((w) => w.id.startsWith("2026-09"))).toBe(true);
  });

  it("writes the dates the way the app does", () => {
    expect(weekDates(weeks.find((w) => w.number === 17)!)).toBe("25–29 Sep");
    expect(weekDates(weeks.find((w) => w.md === 8)!)).toBe("9–12 Oct");
  });
});

describe("with nothing synced", () => {
  it("still lists the LaLiga rounds", () => {
    const weeks = seasonWeeks(grid, null, NOW);
    expect(weeks).toHaveLength(ROUNDS.length);
    expect(weeks.every((w) => w.gw === null)).toBe(true);
    expect(currentWeek(weeks)!.md).toBe(8);
  });

  it("copes with no grid either", () => {
    expect(seasonWeeks(null, null, NOW)).toEqual([]);
    expect(currentWeek([])).toBeNull();
  });
});

describe("what the bar shows on a page", () => {
  const context = (asked?: Parameters<typeof weekContext>[3]) => weekContext(grid, sorare, NOW, asked);

  it("opens on the week Sorare is planning", () => {
    expect(context().current!.number).toBe(17);
    expect(context().now!.number).toBe(17);
  });

  it("follows a week in the address", () => {
    expect(context({ w: "2026-09-11" }).current!.md).toBe(5);
  });

  it("follows an older per-page link, so the bar agrees with the page", () => {
    expect(context({ md: 8 }).current!.md).toBe(8);
    expect(context({ gw: "19" }).current!.number).toBe(19);
    expect(context({ w: "2026-10-09", md: 5 }).current!.md).toBe(8); // the week wins over the old link
  });

  it("gives back the week that was asked for, whatever the page can draw", () => {
    // GW17 has no LaLiga round, and the week you pick is still the week you get: the board says so itself
    // rather than quietly showing another one (components/AwayWeek.tsx).
    expect(context().current!.number).toBe(17);
    expect(context().current!.md).toBeNull();
    expect(context({ w: "2026-10-09" }).current!.gw).toBeNull();
  });

  it("finds the week that contains today, not the one the app opens on", () => {
    const weeks = seasonWeeks(grid, sorare, NOW);
    expect(weekOn(weeks, new Date("2026-09-26T12:00:00Z"))!.number).toBe(17);
    expect(weekOn(weeks, NOW)!.id).toBe("2026-09-22");
    expect(weekOn([], NOW)).toBeNull();
  });

  it("gives back nothing when there is nothing", () => {
    expect(weekContext(null, null, NOW).current).toBeNull();
  });
});
