import { describe, expect, it } from "vitest";
import type { GameweekLineup } from "./entered";
import type { GameweekPlan, Lineup, PlayCard } from "./play";
import { enteredScore, lineupActual, withLineupRules } from "./lineupScores";

const card = (slug: string, extra: Partial<PlayCard> = {}): PlayCard => ({
  slug, player: slug, name: slug, pos: "DEF", rarity: "limited", inSeason: true, level: 0,
  pic: "", avatar: "", club: slug, crest: null, mult: 1, p: 1, mu: 40, x: 40, average: 40,
  actual: null, fixture: null, slot: "DEF", captain: false, ...extra,
});
const line = (extra: Partial<Lineup> = {}): Lineup => ({
  board: "board", captainBonus: 0.5, minInSeason: 0, clubBonus: null, averageBonus: null,
  x: 110, starters: [card("a", { captain: true }), card("b")], subs: [], ...extra,
}) as Lineup;
const week = (lineup: Lineup): GameweekPlan => ({
  gameweek: { slug: "selected", id: "21" }, plans: [{ rank: 1, lineups: [lineup] }],
  playing: { cards: 3, players: [] },
}) as unknown as GameweekPlan;
const entered = (cards: PlayCard[], board = "board"): GameweekLineup => ({
  id: "mine", name: "Custom", draft: false, confirmable: false, board, competition: "LaLiga", result: null,
  cards: cards.map((c, index) => ({ slug: c.slug, name: c.name, picture: null, rarity: c.rarity, score: null, captain: !!c.captain, index })),
});

describe("entered lineup expected score", () => {
  it("uses the recorded forecast only for the same board, captain, starters and bench", () => {
    const lineup = line();
    expect(enteredScore(entered(lineup.starters), week(lineup), "selected")).toEqual({ value: 110, estimated: false });
    expect(enteredScore(entered(lineup.starters), week(lineup), "other").value).toBeNull();
    expect(enteredScore(entered(lineup.starters), null, "selected").value).toBeNull();
  });
  it("estimates a custom captain with the selected week's individual forecasts and bonuses", () => {
    const lineup = line();
    const custom = entered([card("a"), card("b", { captain: true })]);
    expect(enteredScore(custom, week(lineup), "selected")).toEqual({ value: 100, estimated: true });
    expect(enteredScore({ ...custom, board: "other" }, week(lineup), "selected").value).toBeNull();
  });
  it("estimates older saved custom teams using their retained appearance order and the same board's saved rules", () => {
    const lineup = line();
    const custom = entered([card("a"), card("b", { captain: true })]);
    custom.cards.forEach(c => { delete c.index; });
    expect(enteredScore(custom, week(lineup), "selected")).toEqual({ value: 100, estimated: true });
    expect(enteredScore(custom, week(lineup), "other").value).toBeNull();
    expect(enteredScore({ ...custom, board: "other" }, week(lineup), "selected").value).toBeNull();
  });
  it("fills missing old bonus rules from the same GW and board without replacing original forecasts", () => {
    const original = week(line({ x: 123, clubBonus: undefined, averageBonus: undefined }));
    const replay = week(line({ x: 999, clubBonus: [2, 0.02], averageBonus: [260, 0.04] }));
    const restored = withLineupRules(original, replay);
    expect(restored.plans[0]!.lineups[0]!.x).toBe(123);
    expect(restored.plans[0]!.lineups[0]!.clubBonus).toEqual([2, 0.02]);
    expect(original.plans[0]!.lineups[0]!.clubBonus).toBeUndefined();
    replay.gameweek.slug = "other";
    expect(withLineupRules(original, replay)).toBe(original);
    replay.gameweek.slug = "selected";
    replay.plans[0]!.lineups[0]!.board = "other";
    expect(withLineupRules(original, replay).plans[0]!.lineups[0]!.clubBonus).toBeUndefined();
  });
  it("counts a substitute only when an eligible starter does not play; a replacement cancels team bonuses", () => {
    const lineup = line({ x: 100, clubBonus: [2, 0.1], starters: [card("a", { p: 0, x: 0, captain: true }), card("b")], subs: [card("c", { mu: 50, x: 50, slot: "OUT" })] });
    const custom = entered([...lineup.starters, ...lineup.subs].map(c => ({ ...c, captain: c.slug === "b" })));
    expect(enteredScore(custom, week(lineup), "selected").value).toBeCloseTo(110);
    const missing = entered([card("unknown", { captain: true }), card("b"), ...lineup.subs]);
    expect(enteredScore(missing, week(lineup), "selected").value).toBeNull();
  });
  it("estimates a lineup outside the saved plans using Sorare's slot and multiplier metadata", () => {
    const selected = week(line());
    selected.playing.players = [{ player: "custom", name: "Custom", x: 0, p: 0, games: [], pos: "DEF", avatar: "", pic: "", crest: null, rarity: "limited", club: "Celta", inSeason: true, cards: 1, average: 40 }];
    const custom = entered([card("custom", { captain: true })], "unplanned");
    custom.scoring = { slots: [{ positions: ["Defender"], sub: false }], minInSeason: 0, captain: 0.5, season: 0.05, grade: 0.01, scarcity: {}, clubBonus: null, averageBonus: null };
    Object.assign(custom.cards[0]!, { player: "custom", level: 2, inSeason: true, positions: ["Defender"], club: "Celta", average: 40 });
    expect(enteredScore(custom, selected, "selected")).toEqual({ value: 0, estimated: true });
    selected.playing.players[0]!.x = 40; selected.playing.players[0]!.p = 0.8;
    expect(enteredScore(custom, selected, "selected").value).toBeCloseTo(62.8);
  });
  it("gives a plan lineup the plan's reward chance, and a custom one its chance of the score the lowest paid level took", () => {
    const lineup = line({ pReturn: 0.31, need: 100 });
    expect(enteredScore(entered(lineup.starters), week(lineup), "selected").chance).toBe(0.31);
    const custom = entered([card("a"), card("b", { captain: true })]);
    expect(enteredScore(custom, week(lineup), "selected").chance).toBeCloseTo(0.5); // expects exactly the 100 it needs
    expect(enteredScore(custom, week(line({ need: 160 })), "selected").chance).toBeLessThan(0.05);
    expect(enteredScore(custom, week(line({ need: 100, group: "Room" })), "selected").chance).toBeUndefined();
  });
  it("never borrows card multipliers from another competition", () => {
    const selected = week(line());
    selected.plans[0]!.lineups.push(line({ board: "other", starters: [card("foreign", { mult: 2 })] }));
    const custom = entered([card("a"), card("foreign", { captain: true })]);
    expect(enteredScore(custom, selected, "selected").value).toBeNull();
  });
  it("works out a card's multiplier from the board's own bonuses when the plan picked it elsewhere (Pro sends no rules)", () => {
    const selected = week(line({ bonuses: { season: 0.05, grade: 0.01, scarcity: {} } }));
    selected.plans[0]!.lineups.push(line({ board: "other", starters: [card("elsewhere", { level: 3, inSeason: true, mult: 9 })] }));
    const custom = entered([card("a", { captain: true }), card("elsewhere")]);
    expect(enteredScore(custom, selected, "selected").value).toBeCloseTo(40 * 1.5 + 40 * 1.08);
    delete selected.plans[0]!.lineups[0]!.bonuses;
    expect(enteredScore(custom, selected, "selected").value).toBeNull();
  });
  it("respects all of a custom substitute's eligible positions", () => {
    const lineup = line({ starters: [card("a", { p: 0, x: 0, captain: true }), card("b")], subs: [card("c", { pos: "MID", slot: "OUT" })] });
    const custom = entered([...lineup.starters, ...lineup.subs].map(c => ({ ...c, captain: c.slug === "b" })));
    custom.cards[2]!.positions = ["Midfielder", "Defender"];
    expect(enteredScore(custom, week(lineup), "selected").value).toBeCloseTo(100);
  });
});

describe("actual plan score", () => {
  it("preserves a real zero and published replay totals", () => {
    expect(lineupActual(line({ actual: { total: 0 } as Lineup["actual"] }), {})).toEqual({ value: 0, complete: true });
    expect(lineupActual(line(), {})).toEqual({ value: null, complete: false });
  });
  it("does not substitute for an unscored player and marks partial scores as still scoring", () => {
    const lineup = line({ starters: [card("a", { captain: true }), card("b")], subs: [card("c", { slot: "OUT" })] });
    expect(lineupActual(lineup, { b: { score: 40, played: true }, c: { score: 50, played: true } })).toEqual({ value: 40, complete: false });
    expect(lineupActual(lineup, { a: { score: 0, played: false }, b: { score: 40, played: true }, c: { score: 50, played: true } })).toEqual({ value: 90, complete: true });
  });
});
