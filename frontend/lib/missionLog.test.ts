import { describe, expect, it } from "vitest";
import { dayMissions, DAILY_PICKER, missionHistory, nextDay, type LogCand, type MonthLog } from "./missionLog";
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
  it("assumes only the Decisive Picker when not loaded, otherwise retains exactly the source tasks", () => {
    expect(dayMissions(null).map((m) => m.title)).toEqual(["Decisive Picker"]);
    expect(dayMissions([INTERCEPTION, row("Over", "Beat it", { mode: "SCORE" })]).map((m) => m.title)).toEqual(["Interception - All Matches", "Over"]);
    // The loaded Decisive Picker is the one kept (its own picks and rule), not a second one.
    expect(dayMissions([row("decisive picker", "Earn 200 XP", { picks: 2 })]).map((m) => [m.title, m.picks])).toEqual([["decisive picker", 2]]);
  });
});

describe("a day of the log", () => {
  it("writes every card with a game that day as a candidate with its chance, and Sofix's full choice of picks", () => {
    const day = nextDay(undefined, null, players, sheets, "limited", MORNING);
    expect(day.loaded).toBe(false);
    expect(day.missions.map((m) => m.key)).toEqual([DAILY_PICKER.id]);
    expect(day.cands.map((c) => c.s)).toEqual(["a", "b", "c", "d"]);
    expect(day.cands[0]).toMatchObject({ n: "A", g: "Game:a", k: "2026-10-06T14:00:00Z" });
    expect(day.missions[0]!.sofix).toEqual(["a", "b", "c"]); // three picks, likeliest first
  });

  it("logs a loaded day's missions too, each card in one mission only, ignoring the picks you already made", () => {
    const day = nextDay(undefined, [{ ...INTERCEPTION, made: 3, picks: 1 }], players, sheets, "limited", MORNING);
    expect(day.loaded).toBe(true);
    expect(day.missions.map((m) => [m.key, m.sofix.length])).toEqual([["Interception - All Matches", 1]]);
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
    expect(later.cands.find((c) => c.s === "d")!.c[DAILY_PICKER.id]).toBeGreaterThan(morning.cands.find((c) => c.s === "d")!.c[DAILY_PICKER.id]!);
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
    expect(later.missions.map((m) => m.key)).toEqual(["Interception - All Matches"]);
    expect(later.missions[0]!.yours).toEqual(yours);
  });
});

describe("the missions history", () => {
  const cand = (s: string, did?: boolean): LogCand => ({ s, n: s.toUpperCase(), pic: "", pos: "MID", g: "G", k: "2026-10-05T19:00:00Z", c: { Picker: 0.3 }, ...(did === undefined ? {} : { r: { played: true, did: { Picker: did } } }) });
  const day = (sofix: string[], yours: { player: string; status: string }[], cands: LogCand[]) => ({
    limited: { loaded: true, cands, missions: [{ key: "Picker", description: "", mode: "DECISIVE" as const, rule: { kind: "decisive" as const, label: "" }, stats: [], picks: 3, sofix, yours: yours.map((y) => ({ ...y, game: null, rarity: "limited" })) }] },
  });
  const log: MonthLog = {
    days: {
      "2026-10-05": day(["a", "b"], [], [cand("a", true), cand("b", false), cand("c", true)]),
      "2026-10-06": day(["a"], [{ player: "z", status: "FAILURE" }], [cand("a")]),
    },
  };

  it("lists a day as soon as it is written, newest first: Sofix's picks waiting, yours with Sorare's verdict, no score until every game is checked", () => {
    const [today, before] = missionHistory([log], "limited", new Map([["z", { name: "Zed", pic: "z.png" }]]));
    expect(today).toMatchObject({ day: "2026-10-06", score: null, missed: [], sofix: [{ slug: "a", state: "waiting" }], yours: [{ name: "Zed", pic: "z.png", state: "didnt" }] });
    // checked: two did it, Sofix had one of them and left the other out; the best possible is the fewer of its 3 picks and the 2 achievers
    expect(before).toMatchObject({ day: "2026-10-05", score: { got: 1, best: 2 }, missed: [{ slug: "c", state: "did" }] });
    expect(before!.sofix.map((c) => c.state)).toEqual(["did", "didnt"]);
  });

  it("leaves out another rarity and a mission with no pick on either side", () => {
    expect(missionHistory([log], "rare", new Map())).toEqual([]);
  });

  it("names a pick of yours Sofix had no candidate for from another day of the log, else reads his slug out", () => {
    const [today] = missionHistory([{ days: { ...log.days, "2026-10-07": day(["a"], [{ player: "c", status: "READY" }, { player: "jan-oblak", status: "FAILURE" }], [cand("a")]) } }], "limited", new Map());
    expect(today!.yours.map((c) => c.name)).toEqual(["C", "Jan Oblak"]);
    expect(missionHistory([{ days: { "2026-10-07": day([], [], []) } }], "limited", new Map())).toMatchObject([{ day: "2026-10-07", score: null, sofix: [], yours: [] }]);
  });
});

it("keeps SCORE tasks and treats a verified empty collection as empty", () => {
  expect(dayMissions([row("Score 60", "Reach 60", { mode: "SCORE" })]).map((m) => m.title)).toEqual(["Score 60"]);
  expect(dayMissions([])).toEqual([]);
});

it("an explicit empty appearance list clears old imported choices", () => {
  const m = row("Picker", "A decisive action", { appearances: [{ player: "a", game: "Game:a", rarity: "limited", status: "READY" }] });
  const before = nextDay(undefined, [m], players, sheets, "limited", MORNING);
  expect(nextDay(before, [{ ...m, appearances: [] }], players, sheets, "limited", MORNING).missions[0]!.yours).toEqual([]);
});

it("distinguishes confirmed no picks from missing picks and missing forecasts from pending results", () => {
  const make = (loaded: MissionRow[] | null) => ({ days: { "2026-10-06": { limited: nextDay(undefined, loaded, [], {}, "limited", MORNING) } } });
  const confirmed = missionHistory([make([row("Picker", "Decisive", { appearances: [] })])], "limited", new Map())[0];
  expect(confirmed).toMatchObject({ yourPicks: "confirmed-empty", evidence: "not-recorded" });
  expect(missionHistory([make(null)], "limited", new Map())[0]).toMatchObject({ yourPicks: "unknown", evidence: "not-recorded" });
  const pending = nextDay(undefined, null, players, sheets, "limited", MORNING);
  expect(missionHistory([{ days: { "2026-10-06": { limited: pending } } }], "limited", new Map())[0]?.evidence).toBe("pending");
});

it("does not turn a legacy unknown pick list into a confirmed empty import during a later capture", () => {
  const before = nextDay(undefined, [row("Picker", "Decisive")], [], {}, "limited", MORNING);
  const later = nextDay(before, null, [], {}, "limited", new Date("2026-10-06T10:00:00Z"));
  expect(missionHistory([{ days: { "2026-10-06": { limited: later } } }], "limited", new Map())[0]?.yourPicks).toBe("unknown");
});
