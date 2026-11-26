import { describe, expect, it } from "vitest";
import { inEleven, sheetStatus, versionOf, watching, type Sheets } from "./proSheets";
import type { ProPlanned, ProStarter } from "./proWeek";

// Kickoff 18:45 Madrid (17:45 UTC): the clock looks from 16:30 UTC, the teams are due about 16:45 UTC.
const START = "2026-11-26T17:45:00+00:00";
const at = (hhmm: string) => Date.parse(`2026-11-26T${hhmm}:00Z`);
const GAME = "Game:1";

const starter = (player: string, late: string | null = null): ProStarter => ({
  slug: `${player}-card`, player, name: player, pos: "MID", pic: null, inSeason: true, mult: 1, start: 0.8, x: 50, club: "Celta", crest: null,
  fixture: { id: late ? "Game:2" : GAME, opponent: "Lyon", opponentCrest: null, venue: "H", kickoff: late ?? START, bucket: null },
  l5: [], slot: "MID", captain: false, late, subs: [],
});
const lineup = (late = false): ProPlanned => ({
  start: START, span: late ? "3h" : "batch", reach: [0.3], x: 300,
  starters: ["a", "b", "c", "d", late ? null : "e"].map((p) => (p ? starter(p) : starter("z", "2026-11-26T20:00:00+00:00"))),
});
const out = (starters: string[]): Sheets => ({ [GAME]: { at: "2026-11-26T16:46:00Z", sides: 1, teams: { celta: { starters, bench: [] } } } });

describe("the Pro teamsheet pill", () => {
  it("before the window it says when the teams are due, and asks nothing", () => {
    expect(sheetStatus(lineup(), {}, at("15:00"), null)).toEqual({ label: "Teams ~17:45", tone: "soon", check: false });
    expect(watching([lineup()], {}, at("16:29"))).toBe(false);
    expect(watching([lineup()], {}, at("16:30"))).toBe(true);
  });

  it("inside the window it says when the clock last looked, and warns after two looks missed", () => {
    expect(sheetStatus(lineup(), {}, at("16:40"), "2026-11-26T16:35:00Z")).toEqual({ label: "Checked 17:35", tone: "wait", check: true });
    expect(sheetStatus(lineup(), {}, at("16:50"), "2026-11-26T16:35:00Z")).toEqual({ label: "Not checked since 17:35", tone: "warn", check: true });
    expect(sheetStatus(lineup(), {}, at("16:40"), null).label).toBe("Not checked yet");
  });

  it("teams out once every starter not entered blind is in his eleven; the window then closes", () => {
    const sheets = out(["a", "b", "c", "d", "e"]);
    expect(sheetStatus(lineup(), sheets, at("16:50"), null)).toEqual({ label: "Teams out 17:46", tone: "out", check: false });
    expect(watching([lineup()], sheets, at("16:50"))).toBe(false);
    // a player entered before his own teamsheet does not hold the lineup's teams back
    expect(sheetStatus(lineup(true), out(["a", "b", "c", "d"]), at("16:50"), null).tone).toBe("out");
  });

  it("some elevens out: how many of the five start, still watching", () => {
    const sheets: Sheets = { [GAME]: { at: "2026-11-26T16:46:00Z", sides: 1, teams: { celta: { starters: ["a", "b"], bench: [] } } } };
    expect(sheetStatus(lineup(), sheets, at("16:50"), null)).toEqual({ label: "2 of 5 in the XI", tone: "wait", check: true });
  });

  it("a failed re-plan in the window says so, so Check now is the next step", () => {
    const run = { status: "completed", conclusion: "failure", at: "2026-11-26T16:46:00Z" };
    expect(sheetStatus(lineup(), {}, at("16:50"), "2026-11-26T16:45:00Z", run)).toEqual({ label: "Rebuild failed", tone: "warn", check: true });
    const yesterday = { ...run, at: "2026-11-25T16:46:00Z" };
    expect(sheetStatus(lineup(), {}, at("16:50"), "2026-11-26T16:45:00Z", yesterday).label).toBe("Checked 17:45");
  });

  it("XI only for a player Sorare lists in his game's eleven", () => {
    expect(inEleven(starter("a"), out(["a"]))).toBe(true);
    expect(inEleven(starter("b"), out(["a"]))).toBe(false);
    expect(inEleven({ player: "a", fixture: null }, out(["a"]))).toBe(false);
  });

  it("the version moves with a refresh and with a re-plan", () => {
    expect(versionOf({ builtAt: "b", sheetsAt: null })).not.toBe(versionOf({ builtAt: "b", sheetsAt: "s" }));
  });
});
