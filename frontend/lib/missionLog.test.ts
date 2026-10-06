import { describe, expect, it } from "vitest";
import { dayMissions, DAILY_PICKER, nextDay } from "./missionLog";
import type { MissionRow } from "./missions";
import type { PlayingPlayer } from "./play";
import type { Sheet } from "./playerSheet";

const row = (title: string, description: string, over: Partial<MissionRow> = {}): MissionRow => ({ id: title, title, description, mode: "DECISIVE", picks: 3, made: 0, period: "DAILY", state: "READY", ...over });
const INTERCEPTION = row("Interception - All Matches", "Pick a player who makes 2+ interceptions in any match");
const sheet = (rate: number): Sheet => ({
  pos: "DEF", team: "x", starts: 30, seasonStarts: 30, season: { interception_won: [rate, 3] }, l10: {},
  last: Array.from({ length: 10 }, () => [50, "BET", 0, "H", 1, 0, 0] as Sheet["last"][number]), decAll: rate / 10, cs: 0, pens: 0,
});
const player = (slug: string, kickoff: string): PlayingPlayer => ({
  player: slug, name: slug.toUpperCase(), pos: "DEF", avatar: "", pic: `https://assets.sorare.com/${slug}.png`, crest: null, rarity: "limited", club: "x", inSeason: true,
  cards: 1, p: 0.9, x: 50, average: 50, games: [{ id: `Game:${slug}`, kickoff, competition: "laliga-es", opponent: "Betis", opponentCrest: null, venue: "H" }],
});
// Four of your players on Tuesday 6 Oct (Madrid): a, b and c at 14:00 UTC, d at 19:00 UTC; a is the likeliest, d the least.
const players = [player("a", "2026-10-06T14:00:00Z"), player("b", "2026-10-06T14:00:00Z"), player("c", "2026-10-06T14:00:00Z"), player("d", "2026-10-06T19:00:00Z")];
const sheets = { a: sheet(4), b: sheet(3), c: sheet(2), d: sheet(1) };
const MORNING = new Date("2026-10-06T09:00:00Z");

describe("the day's missions", () => {
  it("always holds the Decisive Picker, with the loaded ones beside it; a mission to beat an average is not logged", () => {
    expect(dayMissions(null).map((m) => m.title)).toEqual(["Decisive Picker"]);
    expect(dayMissions([INTERCEPTION, row("Over", "Beat it", { mode: "SCORE" })]).map((m) => m.title)).toEqual(["Interception - All Matches", "Decisive Picker"]);
    // The loaded Decisive Picker is the one kept (its own picks and rule), not a second one.
    expect(dayMissions([row("decisive picker", "Earn 200 XP", { picks: 2 })]).map((m) => [m.title, m.picks])).toEqual([["decisive picker", 2]]);
  });
});

describe("a day of the log", () => {
  it("writes every card with a game that day as a candidate with its chance, and Sofix's full choice of picks", () => {
    const day = nextDay(undefined, null, players, sheets, "limited", MORNING);
    expect(day.loaded).toBe(false);
    expect(day.missions.map((m) => m.key)).toEqual([DAILY_PICKER.title]);
    expect(day.cands.map((c) => c.s)).toEqual(["a", "b", "c", "d"]);
    expect(day.cands[0]).toMatchObject({ n: "A", g: "Game:a", k: "2026-10-06T14:00:00Z" });
    expect(day.missions[0]!.sofix).toEqual(["a", "b", "c"]); // three picks, likeliest first
  });

  it("logs a loaded day's missions too, each card in one mission only, ignoring the picks you already made", () => {
    const day = nextDay(undefined, [{ ...INTERCEPTION, made: 3, picks: 1 }], players, sheets, "limited", MORNING);
    expect(day.loaded).toBe(true);
    expect(day.missions.map((m) => [m.key, m.sofix.length])).toEqual([["Interception - All Matches", 1], ["Decisive Picker", 3]]);
    const all = day.missions.flatMap((m) => m.sofix);
    expect(new Set(all).size).toBe(all.length);
  });

  it("freezes what was said of a player from his kick-off, and fills only the slots left with players still to play", () => {
    const morning = nextDay(undefined, null, players, sheets, "limited", MORNING);
    // At 15:00 a, b and c have kicked off: their picks and chances stand. A new run can only choose among the later games.
    const better = { ...sheets, d: sheet(9) };
    const later = nextDay(morning, null, players, better, "limited", new Date("2026-10-06T15:00:00Z"));
    expect(later.missions[0]!.sofix).toEqual(["a", "b", "c"]);
    expect(later.cands.find((c) => c.s === "a")).toEqual(morning.cands.find((c) => c.s === "a"));
    expect(later.cands.find((c) => c.s === "d")!.c["Decisive Picker"]).toBeGreaterThan(morning.cands.find((c) => c.s === "d")!.c["Decisive Picker"]!);
  });

  it("drops a pick replaced before its game: only the last choice before kick-off counts", () => {
    const morning = nextDay(undefined, null, players, sheets, "limited", MORNING);
    const changed = nextDay(morning, null, players, { ...sheets, d: sheet(9) }, "limited", new Date("2026-10-06T10:00:00Z"));
    expect(changed.missions[0]!.sofix).toEqual(["d", "a", "b"]);
  });

  it("keeps a list loaded earlier in the day when a later run has none, and your picks with Sorare's verdict", () => {
    const yours = [{ player: "a", game: "Game:a", rarity: "limited", status: "READY" }];
    const morning = nextDay(undefined, [{ ...INTERCEPTION, appearances: yours }], players, sheets, "limited", MORNING);
    const later = nextDay(morning, null, players, sheets, "limited", new Date("2026-10-06T10:00:00Z"));
    expect(later.loaded).toBe(true);
    expect(later.missions.map((m) => m.key)).toEqual(["Interception - All Matches", "Decisive Picker"]);
    expect(later.missions[0]!.yours).toEqual(yours);
  });
});
