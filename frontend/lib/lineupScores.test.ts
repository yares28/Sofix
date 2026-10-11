import { describe, expect, it } from "vitest";
import type { GameweekLineup } from "./entered";
import type { GameweekPlan, Lineup, PlayCard } from "./play";
import { enteredScore, lineupActual } from "./lineupScores";

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
  it("never borrows card multipliers from another competition", () => {
    const selected = week(line());
    selected.plans[0]!.lineups.push(line({ board: "other", starters: [card("foreign", { mult: 2 })] }));
    const custom = entered([card("a"), card("foreign", { captain: true })]);
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
