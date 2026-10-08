import { describe, expect, it } from "vitest";
import { atLeast, fit, isToday, missionDay, missionsLoadNote, plan, rewardOf, ruleOf, type MissionRow } from "./missions";
import type { PlayingPlayer } from "./play";
import type { Sheet } from "./playerSheet";

const row = (title: string, description: string, over: Partial<MissionRow> = {}): MissionRow => ({ id: title, title, description, mode: "DECISIVE", picks: 3, made: 0, period: "DAILY", state: "READY", ...over });
const DECISIVE = row("Decisive Picker", "Earn 200 XP for each player you select who gets a positive decisive action in today's matches.");
const INTERCEPTION = row("Interception - All Matches", "Classic: Pick a player who makes 2+ interceptions in any match and win 50 All-Star Essence per correct choice.");
const ASSIST = row("Assist - All Matches", "Classic: Pick a player who gets an assist in any match and win 50 All-Star Essence per correct choice.");

describe("what a mission asks and pays", () => {
  it("does not turn a compound or custom decisive target into a generic decisive estimate", () => {
    expect(ruleOf({ ...DECISIVE, thresholds: [{ stat: "goals", min: 1 }, { stat: "goal_assist", min: 1 }] }).kind).toBe("unsupported");
    expect(ruleOf({ ...DECISIVE, stats: ["goals"] })).toMatchObject({ kind: "goal", atLeast: 1 });
    expect(ruleOf({ ...DECISIVE, stats: ["last_man_tackle"] }).kind).toBe("unsupported");
  });
  it("reads the rule from its words", () => {
    expect(ruleOf(DECISIVE)).toEqual({ kind: "decisive", label: "a decisive action" });
    expect(ruleOf(INTERCEPTION)).toEqual({ kind: "interception", atLeast: 2, label: "2+ interceptions" });
    expect(ruleOf(ASSIST)).toEqual({ kind: "assist", atLeast: 1, label: "an assist" });
    expect(ruleOf(row("Goals", "Pick a player who scores 2+ goals"))).toMatchObject({ kind: "goal", atLeast: 2 });
  });
  it("calls a mission to beat his own average a score mission, which is not ranked yet", () => {
    const score = row("Overperform", "Beat his last 15 games' average by 10 points", { mode: "SCORE" });
    expect(ruleOf(score)).toEqual({ kind: "score", label: score.description });
    expect(fit(ruleOf(score), player("a", { shape: { p: 0.9, dec: 70, plain: 40, sdDec: 9, sdPlain: 9, low: 30, high: 80 } }), sheet())).toBeNull();
    expect(plan([score], "limited", [player("a")], { a: sheet() }, NOW).plans[0]!.picks).toEqual([]);
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
const NOW = new Date("2026-10-10T10:00:00Z"); // after the 08:00 UTC reset: the mission day of 10 Oct

describe("a card's fit to a mission", () => {
  it("uses the next game's playing chance rather than an aggregate across several gameweeks", () => {
    const p = player("a", { p: 0.99, pStart: 0.05, pOn: 0.05 });
    expect(fit({ kind: "goal", atLeast: 1, label: "goal" }, p, sheet({ season: { goals: [1, 0] } }))?.chance).toBeCloseTo(0.1 * (1 - Math.exp(-1)));
  });
  it("is his chance of a decisive action from the game (or his own rate), with what he did over 5, 8 and two seasons", () => {
    const found = fit({ kind: "decisive", label: "" }, player("a", { shape: { p: 0.3, dec: 70, plain: 40, sdDec: 9, sdPlain: 9, low: 30, high: 80 } }), sheet());
    expect(found?.chance).toBeCloseTo(0.27);
    expect(found?.average.l5).toBeCloseTo(0.2); // one of his last five starts was decisive (the one five starts back is out)
    expect(found?.average.season).toBe(0.15);
    expect(fit({ kind: "decisive", label: "" }, player("a"), null)).toBeNull();
    expect(fit({ kind: "decisive", label: "" }, player("a"), sheet())?.chance).toBeCloseTo(0.135);
  });
  it("is a count's tail from his season's rate for interceptions and assists, and nothing without a sheet", () => {
    const rule = ruleOf(INTERCEPTION);
    const found = fit(rule, player("a"), sheet())!;
    expect(found.chance).toBeCloseTo(0.9 * atLeast(2, 2.0), 6);
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
    const { plans, day } = plan([INTERCEPTION, row("Assist one", "Pick a player who gets an assist for 50 All-Star Essence", { picks: 1 })], "limited", players, withAssists, NOW);
    expect(day).toBe("2026-10-10");
    const taken = plans.flatMap((p) => p.picks.map((x) => x.slug));
    expect(new Set(taken).size).toBe(taken.length);
    expect(plans[1]!.picks.map((x) => x.slug)).toEqual(["c"]); // c is far likelier to assist than to intercept twice
    expect(plans[0]!.picks.map((x) => x.slug)).toEqual(["a", "b"]);
  });

  it("lists every card with a game for each mission, likeliest first, also one given to another mission, and names those no number fits", () => {
    const { plans } = plan([INTERCEPTION], "limited", [...players, player("d")], sheets, NOW);
    expect(plans[0]!.all.map((x) => x.slug)).toEqual(["a", "b", "c"]); // all three, though it has picks for fewer when some are made
    expect(plans[0]!.unrated).toEqual([{ slug: "d", name: "d" }]); // no stat sheet
    const busy = plan([INTERCEPTION, row("Assist one", "Pick a player who gets an assist", { picks: 1 })], "limited", players, { ...sheets, c: sheet({ season: { interception_won: [0.2, 1], goal_assist: [0.5, 3] } }) }, NOW);
    expect(busy.plans[0]!.all.map((x) => x.slug)).toContain("c"); // c is the assist mission's pick and still listed here
  });

  it("leaves out the picks already made, a game already started and a card of another rarity", () => {
    const { plans } = plan([row("Done", "Pick 2+ interceptions", { picks: 3, made: 3 })], "limited", players, sheets, NOW);
    expect(plans[0]!.open).toBe(0);
    expect(plans[0]!.picks).toEqual([]);
    const late = plan([INTERCEPTION], "limited", players, sheets, new Date("2026-10-10T20:00:00Z"));
    expect(late.plans[0]!.picks).toEqual([]);
    const rare = plan([INTERCEPTION], "rare", players, sheets, NOW);
    expect(rare.plans[0]!.picks).toEqual([]);
  });

  it("offers today only: a game on a later day is not a mission's, because tomorrow's missions are not known", () => {
    const tomorrow = player("t", { games: [{ kickoff: "2026-10-11T19:00:00Z", competition: "laliga-es", opponent: "Rayo", opponentCrest: null, venue: "A" }] });
    const { day, plans } = plan([INTERCEPTION], "limited", [tomorrow], { t: sheets.a }, NOW);
    expect(day).toBe("2026-10-10");
    expect(plans[0]!.picks).toEqual([]);
  });

  it("follows Sorare's mission day, not the Madrid date: after midnight and before the reset, tonight's games are the next day's missions", () => {
    // 02:39 Madrid on 7 Oct is still the mission day of 6 Oct: a game that evening is not one of its candidates, and the day is named 6 Oct.
    const tonight = player("a", { games: [{ kickoff: "2026-10-07T19:00:00Z", competition: "x", opponent: "Tonight", opponentCrest: null, venue: "H" }] });
    const before = plan([INTERCEPTION], "limited", [tonight], { a: sheets.a }, new Date("2026-10-07T00:39:00Z"));
    expect(before.day).toBe("2026-10-06");
    expect(before.plans[0]!.picks).toEqual([]);
    // ...and a game after midnight still belongs to the day that began at the reset before it.
    const late = player("a", { games: [{ kickoff: "2026-10-08T01:00:00Z", competition: "x", opponent: "Late", opponentCrest: null, venue: "H" }] });
    expect(plan([INTERCEPTION], "limited", [late], { a: sheets.a }, new Date("2026-10-07T10:00:00Z")).plans[0]!.picks.map((x) => x.opponent)).toEqual(["Late"]);
  });

  it("counts a player whose gameweek is being played, at his next game still to come (his first one already played)", () => {
    const twoGames = player("a", { games: [
      { kickoff: "2026-10-09T19:00:00Z", competition: "x", opponent: "Old", opponentCrest: null, venue: "H" },
      { kickoff: "2026-10-10T19:00:00Z", competition: "x", opponent: "Next", opponentCrest: null, venue: "H" },
    ] });
    const { plans } = plan([INTERCEPTION], "limited", [twoGames, twoGames], { a: sheets.a }, NOW);
    expect(plans[0]!.picks.map((x) => x.opponent)).toEqual(["Next"]); // once, at the game still to come
  });
});

describe("the mission day", () => {
  it("starts at Sorare's reset, 9:00 CET (08:00 UTC), and is named by the date it starts on", () => {
    expect(missionDay(new Date("2026-10-07T07:59:00Z"))).toBe("2026-10-06");
    expect(missionDay(new Date("2026-10-07T08:00:00Z"))).toBe("2026-10-07");
    expect(missionDay(new Date("2026-10-07T23:30:00Z"))).toBe("2026-10-07");
    // The same hour in UTC on both sides of the clock change of 25 Oct, so Madrid's summer time moves nothing.
    expect(missionDay(new Date("2026-10-24T08:00:00Z"))).toBe("2026-10-24");
    expect(missionDay(new Date("2026-10-26T07:59:00Z"))).toBe("2026-10-25");
  });

  it("knows a list read before the last reset is not today's", () => {
    const now = new Date("2026-10-07T10:00:00Z");
    expect(isToday("2026-10-07T08:30:00Z", now)).toBe(true);
    expect(isToday("2026-10-07T07:30:00Z", now)).toBe(false); // read before this morning's reset
    expect(isToday("2026-10-04T19:07:48Z", now)).toBe(false); // what Sofix held on 6 Oct
    expect(isToday("2026-10-06T21:00:00Z", new Date("2026-10-07T06:00:00Z"))).toBe(true); // last night's, still running before the reset
    expect(isToday(null, now)).toBe(false);
    expect(isToday("junk", now)).toBe(false);
  });
});

describe("what the Load button says", () => {
  it("names what it loaded, per rarity, or that Sorare has none today", () => {
    expect(missionsLoadNote({ state: "ok", loaded: { limited: 1, rare: 0, super_rare: 0, unique: 0 } })).toBe("Loaded: 1 Limited mission.");
    expect(missionsLoadNote({ state: "ok", loaded: { limited: 2, rare: 3 } })).toBe("Loaded: 2 Limited missions, 3 Rare missions.");
    expect(missionsLoadNote({ state: "ok", loaded: { limited: 0 } })).toBe("Loaded: no missions on Sorare today.");
  });

  it("says what to do when it could not load", () => {
    expect(missionsLoadNote({ state: "no-tab", loaded: null })).toMatch(/No sorare.com tab is open/);
    expect(missionsLoadNote({ state: "signed-out", loaded: null })).toMatch(/Sign in/);
    expect(missionsLoadNote({ state: "error", loaded: null })).toMatch(/didn.t answer/);
    expect(missionsLoadNote(null)).toMatch(/extension didn.t answer/);
  });
});
