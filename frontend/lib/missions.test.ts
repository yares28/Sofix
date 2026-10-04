import { describe, expect, it } from "vitest";
import { atLeast, fit, plan, rewardOf, ruleOf, type MissionRow } from "./missions";
import type { PlayingPlayer } from "./play";
import type { Sheet } from "./playerSheet";

const row = (title: string, description: string, over: Partial<MissionRow> = {}): MissionRow => ({ id: title, title, description, mode: "DECISIVE", picks: 3, made: 0, period: "DAILY", state: "READY", ...over });
const DECISIVE = row("Decisive Picker", "Earn 200 XP for each player you select who gets a positive decisive action in today's matches.");
const INTERCEPTION = row("Interception - All Matches", "Classic: Pick a player who makes 2+ interceptions in any match and win 50 All-Star Essence per correct choice.");
const ASSIST = row("Assist - All Matches", "Classic: Pick a player who gets an assist in any match and win 50 All-Star Essence per correct choice.");

describe("what a mission asks and pays", () => {
  it("reads the rule from its words", () => {
    expect(ruleOf(DECISIVE)).toEqual({ kind: "decisive", label: "a decisive action" });
    expect(ruleOf(INTERCEPTION)).toEqual({ kind: "interception", atLeast: 2, label: "2+ interceptions" });
    expect(ruleOf(ASSIST)).toEqual({ kind: "assist", atLeast: 1, label: "an assist" });
    expect(ruleOf(row("Goals", "Pick a player who scores 2+ goals"))).toMatchObject({ kind: "goal", atLeast: 2 });
  });
  it("reads the reward in its own words, or says nothing", () => {
    expect(rewardOf(DECISIVE)).toBe("200 XP");
    expect(rewardOf(INTERCEPTION)).toBe("50 All-Star Essence");
    expect(rewardOf(row("x", "Pick a player"))).toBeNull();
  });
});

describe("the chance of at least n", () => {
  it("is a Poisson tail", () => {
    expect(atLeast(1, 0.5)).toBeCloseTo(1 - Math.exp(-0.5), 6);
    expect(atLeast(2, 1.5)).toBeCloseTo(1 - Math.exp(-1.5) * (1 + 1.5), 6);
    expect(atLeast(0, 3)).toBe(1);
    expect(atLeast(2, 0)).toBe(0);
  });
});

const sheet = (over: Partial<Sheet> = {}): Sheet => ({
  pos: "DEF",
  team: "x",
  starts: 30,
  seasonStarts: 30,
  season: { interception_won: [2.0, 3], goal_assist: [0.1, 1] },
  l10: {},
  last: Array.from({ length: 10 }, (_, i) => [50, "BET", i % 5 === 0 ? 1 : 0, "H", i, i % 2, 0] as Sheet["last"][number]),
  decAll: 0.15,
  cs: 5,
  pens: 0,
  ...over,
});
const player = (slug: string, over: Partial<PlayingPlayer> = {}): PlayingPlayer => ({
  player: slug, name: slug, pos: "DEF", avatar: "", pic: "https://assets.sorare.com/x.png", crest: null, rarity: "limited", club: "Getafe", inSeason: true, cards: 1, p: 0.9, x: 50, average: 50,
  games: [{ kickoff: "2026-10-10T19:00:00Z", competition: "laliga-es", opponent: "Betis", opponentCrest: null, venue: "H" }], ...over,
});
const NOW = new Date("2026-10-10T07:00:00Z");

describe("a card's fit to a mission", () => {
  it("is his chance of a decisive action from the game (or his own rate), with what he did over 5, 8 and two seasons", () => {
    const found = fit({ kind: "decisive", label: "" }, player("a", { shape: { p: 0.3, dec: 70, plain: 40, sdDec: 9, sdPlain: 9, low: 30, high: 80 } }), sheet());
    expect(found?.chance).toBe(0.3);
    expect(found?.average.l5).toBeCloseTo(0.2); // one of his last five starts was decisive (the one five starts back is out)
    expect(found?.average.season).toBe(0.15);
    expect(fit({ kind: "decisive", label: "" }, player("a"), null)).toBeNull();
    expect(fit({ kind: "decisive", label: "" }, player("a"), sheet())?.chance).toBe(0.15); // no game number: his own rate
  });
  it("is a count's tail from his season's rate for interceptions and assists, and nothing without a sheet", () => {
    const rule = ruleOf(INTERCEPTION);
    const found = fit(rule, player("a"), sheet())!;
    expect(found.chance).toBeCloseTo(atLeast(2, 2.0), 6);
    expect(found.average.l5).toBeCloseTo((5 + 6 + 7 + 8 + 9) / 5);
    expect(found.average.season).toBe(2);
    expect(fit(rule, player("a"), null)).toBeNull();
  });
});

describe("who goes to which mission", () => {
  const sheets = { a: sheet({ season: { interception_won: [3.0, 4] } }), b: sheet({ season: { interception_won: [1.0, 2] } }), c: sheet({ season: { interception_won: [0.2, 1] } }) };
  const players = [player("a"), player("b"), player("c")];

  it("gives each card to one mission only, the likeliest pairs first, as many as it has picks left", () => {
    const withAssists = { ...sheets, c: sheet({ season: { interception_won: [0.2, 1], goal_assist: [0.5, 3] } }) };
    const { plans, day } = plan([INTERCEPTION, row("Assist one", "Pick a player who gets an assist", { picks: 1 })], "limited", players, withAssists, NOW);
    expect(day).toBe("2026-10-10");
    const taken = plans.flatMap((p) => p.picks.map((x) => x.slug));
    expect(new Set(taken).size).toBe(taken.length);
    expect(plans[1]!.picks.map((x) => x.slug)).toEqual(["c"]); // c is far likelier to assist than to intercept twice
    expect(plans[0]!.picks.map((x) => x.slug)).toEqual(["a", "b"]);
  });

  it("leaves out the picks already made, a game already started and a card of another rarity", () => {
    const { plans } = plan([row("Done", "Pick 2+ interceptions", { picks: 3, made: 3 })], "limited", players, sheets, NOW);
    expect(plans[0]!.open).toBe(0);
    expect(plans[0]!.picks).toEqual([]);
    const late = plan([INTERCEPTION], "limited", players, sheets, new Date("2026-10-10T20:00:00Z"));
    expect(late.day).toBeNull();
    const rare = plan([INTERCEPTION], "rare", players, sheets, NOW);
    expect(rare.plans[0]!.picks).toEqual([]);
  });

  it("looks at the next day with a game when none is left today", () => {
    const tomorrow = player("t", { games: [{ kickoff: "2026-10-11T19:00:00Z", competition: "laliga-es", opponent: "Rayo", opponentCrest: null, venue: "A" }] });
    const { day, plans } = plan([INTERCEPTION], "limited", [tomorrow], { t: sheets.a }, NOW);
    expect(day).toBe("2026-10-11");
    expect(plans[0]!.picks[0]!.opponent).toBe("Rayo");
  });
});
