import { describe, expect, it } from "vitest";
import {
  allocation,
  cashLabel,
  chanceLabel,
  essenceLabel,
  formatOf,
  insideRange,
  lastWeek,
  nextWeek,
  paysNote,
  rangeScale,
  rewardChips,
  timeUntil,
  waitingFor,
  weekPlan,
  type GameweekPlan,
  type Lineup,
  type Plan,
  type Sorare,
} from "./play";

const lineup = (over: Partial<Lineup> = {}): Lineup => ({
  comp: "LaLiga",
  key: "LALIGA EA SPORTS | Limited",
  group: "In-season",
  fee: 0,
  rarity: "limited",
  size: 5,
  subSlots: 2,
  minInSeason: 4,
  cap: null,
  captainBonus: 0.5,
  entries: 4487,
  x: 300,
  lo: 220,
  hi: 380,
  pReturn: 0.48,
  eEss: 260,
  eCash: 1.31,
  pCard: 0,
  need: 307,
  needFrom: "GW13",
  tiers: [
    { lo: 1, hi: 50, cash: 10, essence: 0, card: false, p: 0.01 },
    { lo: 51, hi: 1500, cash: 0, essence: 250, card: false, p: 0.47 },
  ],
  starters: [],
  subs: [],
  average: 244,
  ...over,
});

const plan = (over: Partial<Plan> = {}): Plan => ({
  rank: 1,
  essence: 571,
  cash: 1.31,
  pAny: 0.85,
  rewards: 1.4,
  cardsUsed: 30,
  cardsAvailable: 86,
  lineups: [lineup(), lineup({ group: "Classic", comp: "All Star", size: 7, minInSeason: 0 })],
  ...over,
});

const gameweek = (over: Partial<GameweekPlan> = {}): GameweekPlan => ({
  gameweek: {
    id: "17",
    slug: "football-25-29-sep-2026",
    number: 17,
    name: "Game Week 17",
    start: "2026-09-25T14:00:00+00:00",
    end: "2026-09-29T13:59:00+00:00",
    lock: "2026-09-25T14:00:00+00:00",
  },
  state: "ready",
  played: false,
  projectionsAt: "2026-09-23T18:00:00+00:00",
  source: "sorare",
  playing: { cards: 13, players: [] },
  playable: [],
  blocked: [],
  notWorth: [],
  plans: [plan()],
  ...over,
});

describe("the time to the lock", () => {
  it("counts the days and hours left", () => {
    const left = timeUntil("2026-09-25T14:00:00Z", new Date("2026-09-22T15:20:00Z"));
    expect(left).toMatchObject({ days: 2, hours: 22, past: false });
  });

  it("says when the moment has gone", () => {
    expect(timeUntil("2026-09-20T14:00:00Z", new Date("2026-09-22T15:20:00Z")).past).toBe(true);
  });
});

describe("the way numbers are written", () => {
  it("never rounds a chance to 0% or 100%", () => {
    expect(chanceLabel(0.999)).toBe(">99%");
    expect(chanceLabel(0.001)).toBe("<1%");
    expect(chanceLabel(0.48)).toBe("48%");
    expect(chanceLabel(0)).toBe("0%");
  });

  it("writes essence with thousands and a minus for a loss", () => {
    expect(essenceLabel(1300)).toBe("1,300");
    expect(essenceLabel(-95)).toBe("−95");
  });

  it("keeps cents on small cash amounts only", () => {
    expect(cashLabel(1.31)).toBe("$1.31");
    expect(cashLabel(2000)).toBe("$2000");
  });
});

describe("what a competition is", () => {
  it("spells out the format", () => {
    expect(formatOf(lineup())).toBe("5 + 2 subs · 4 in-season");
    expect(formatOf(lineup({ group: "Classic", size: 7, minInSeason: 0 }))).toBe("7 + 2 subs");
    expect(formatOf(lineup({ group: "Room", subSlots: 0, cap: 260 }))).toBe("Room of 10 · cap 260");
  });

  it("says who gets paid", () => {
    expect(paysNote(lineup())).toBe("Top 1,500 of ≈4,487 pays");
    expect(paysNote(lineup({ group: "Room", fee: 300 }))).toBe("Top 3 of 10 · 300 to enter");
  });
});

describe("the range bar", () => {
  it("fits the bad week, the good week and the score that pays", () => {
    const scale = rangeScale(lineup(), false);
    expect(scale.from).toBeLessThan(220);
    expect(scale.to).toBeGreaterThan(380);
    expect(scale.at(300)).toBeGreaterThan(0);
    expect(scale.at(300)).toBeLessThan(100);
  });

  it("makes room for what it really scored", () => {
    const withActual = lineup({ actual: { total: 460, cash: 0, essence: 0, card: false, need: 313, bonusLost: false, cameIn: [] } });
    expect(rangeScale(withActual, true).to).toBeGreaterThanOrEqual(460);
  });
});

describe("a plan", () => {
  it("counts the lineups that landed inside their range", () => {
    const inside = lineup({ actual: { total: 300, cash: 0, essence: 250, card: false, need: 313, bonusLost: false, cameIn: [] } });
    const outside = lineup({ actual: { total: 120, cash: 0, essence: 0, card: false, need: 313, bonusLost: false, cameIn: [] } });
    expect(insideRange(plan({ lineups: [inside, outside] }))).toBe(1);
  });

  it("splits the cards by the kind of competition, with the rest left over", () => {
    const parts = allocation(
      plan({
        cardsUsed: 12,
        cardsAvailable: 20,
        lineups: [
          lineup({ starters: Array(5).fill({}) as never, subs: Array(2).fill({}) as never }),
          lineup({ group: "Classic", starters: Array(5).fill({}) as never, subs: [] }),
        ],
      }),
    );
    expect(parts).toEqual([
      { group: "In-season", cards: 7 },
      { group: "Classic", cards: 5 },
      { group: "Unused", cards: 8 },
    ]);
  });
});

describe("what a gameweek is waiting for", () => {
  const now = new Date("2026-09-22T15:20:00Z");

  it("says nothing when the plans are there", () => {
    expect(waitingFor(gameweek(), now)).toBeNull();
  });

  it("names the projections when they are still to come", () => {
    expect(waitingFor(gameweek({ state: "waiting" }), now)).toContain("projections");
  });

  it("says plainly when no card of yours plays", () => {
    expect(waitingFor(gameweek({ state: "none" }), now)).toBe("None of your cards play this gameweek.");
  });

  it("falls back to the missing comparable gameweek", () => {
    expect(waitingFor(gameweek({ state: "waiting", projectionsAt: "2026-09-20T18:00:00Z" }), now)).toContain(
      "already been played",
    );
  });
});

describe("reward chips", () => {
  it("shows what is expected before the games", () => {
    const chips = rewardChips(lineup(), false);
    expect(chips.map((chip) => chip.kind)).toEqual(["essence", "cash"]);
    expect(chips[0]?.label).toBe("≈260");
  });

  it("marks a room's entry fee as net", () => {
    expect(rewardChips(lineup({ group: "Room", fee: 300, eEss: -95, eCash: 0 }), false)[0]?.label).toBe("≈−95 net");
  });

  it("shows what was won after them", () => {
    const won = lineup({ actual: { total: 400, cash: 0, essence: 250, card: false, need: 313, bonusLost: false, cameIn: [] } });
    expect(rewardChips(won, true)).toEqual([{ kind: "essence", label: "250", won: true }]);
    const nothing = lineup({ actual: { total: 200, cash: 0, essence: 0, card: false, need: 313, bonusLost: false, cameIn: [] } });
    expect(rewardChips(nothing, true)).toEqual([{ kind: "none", label: "No reward" }]);
  });
});

describe("picking the gameweek to show", () => {
  const played = gameweek({ gameweek: { ...gameweek().gameweek, id: "15", number: 15 }, played: true });
  const ahead = gameweek({ gameweek: { ...gameweek().gameweek, id: "19", number: 19 }, source: "form" });
  const data = { weeks: [played, gameweek(), ahead], nextId: "17", lastId: "15" } as Sorare;

  it("finds the one being planned, the one just played, and the ones ahead", () => {
    expect(weekPlan(data, "17")?.gameweek.number).toBe(17);
    expect(weekPlan(data, "15")?.played).toBe(true);
    expect(weekPlan(data, "19")?.source).toBe("form");
    expect(weekPlan(data, "99")).toBeNull();
    expect(nextWeek(data).gameweek.id).toBe("17");
    expect(lastWeek(data)?.gameweek.id).toBe("15");
  });

  it("has no last gameweek until one has been replayed", () => {
    expect(lastWeek({ ...data, lastId: null } as Sorare)).toBeNull();
  });
});
