import { describe, expect, it, vi } from "vitest";
vi.mock("./missionLog", async original => ({ ...await original<typeof import("./missionLog")>(), loadMissionLog: async () => [] }));
import { nextDay } from "./missionLog";
import type { PlayingPlayer } from "./play";
import type { Sheet } from "./playerSheet";
import type { MissionRow, MissionsModel } from "./missions";
import { missionsToday } from "./missionsToday";

const row = (title: string, over: Partial<MissionRow> = {}): MissionRow => ({ id: title, title, description: "Pick a player", mode: "DECISIVE", picks: 3, made: 0, period: "DAILY", state: "READY", ...over });
const NOW = new Date("2026-10-06T15:00:00Z");

describe("today's missions for a rarity", () => {
  it("Recap restores loaded picks after kickoff and a pool refresh, without borrowing another day or rarity", async () => {
    const task = row("Decisive Picker", { id: "source-task", picks: 1 });
    const p: PlayingPlayer = { player: "saved-player", name: "Saved Player", pos: "MID", avatar: "", pic: "", crest: null, rarity: "limited", club: null, inSeason: true, cards: 1, p: 1, x: 50, average: 50, games: [{ id: "selected-game", kickoff: "2026-10-06T14:00:00Z", competition: "laliga-es", opponent: "Betis", opponentCrest: null, venue: "H" }] };
    const sheet: Sheet = { pos: "MID", team: "x", starts: 30, seasonStarts: 30, season: {}, l10: {}, last: [], decAll: 0.8, cs: 0, pens: 0 };
    const saved = nextDay(undefined, [task], [p], { "saved-player": sheet }, "limited", new Date("2026-10-06T09:00:00Z"));
    const source: MissionsModel = { limited: { missions: [task], seen_at: "2026-10-06T09:00:00Z" } };
    const logs = [{ days: { "2026-10-06": { limited: saved } } }];
    const today = await missionsToday(null, source, "limited", NOW, null, logs);
    expect(today.plans[0]!.picks).toMatchObject([{ slug: "saved-player", game: "selected-game", chance: 0.8 }]);
    expect((await missionsToday(null, source, "rare", NOW, null, logs)).plans).toEqual([]);
    expect((await missionsToday(null, source, "limited", new Date("2026-10-07T15:00:00Z"), null, logs)).plans).toEqual([]);
  });
  it("uses the list loaded since this morning's reset, and says it is today's", async () => {
    const missions: MissionsModel = { limited: { missions: [row("Decisive Picker")], seen_at: "2026-10-06T14:00:00Z" } };
    const today = await missionsToday(null, missions, undefined, NOW);
    expect(today).toMatchObject({ rarity: "limited", status: "today", seen: ["limited"], seenAt: "2026-10-06T14:00:00Z" });
    expect(today.plans.map((p) => p.mission.title)).toEqual(["Decisive Picker"]);
    expect(today.day).toBe("2026-10-06");
  });

  it("never shows an older list as today's: no mission at all, and when the last list was loaded", async () => {
    // What Sofix held on 6 Oct: Sunday's lists, the Limited one without names, the Rare one with three missions.
    const missions: MissionsModel = {
      limited: { missions: [row(""), row("")], seen_at: "2026-10-04T19:07:48Z" },
      rare: { missions: [row("Assist - All Matches"), row("Decisive Picker"), row("Interception - All Matches")], seen_at: "2026-10-04T19:05:52Z" },
    };
    const today = await missionsToday(null, missions, undefined, NOW);
    expect(today).toMatchObject({ rarity: "limited", status: "stale", seen: [], plans: [], seenAt: "2026-10-04T19:07:48Z" });
    expect((await missionsToday(null, missions, "rare", NOW)).status).toBe("stale");
    expect((await missionsToday(null, null, undefined, NOW)).status).toBe("never");
  });

  it("never borrows another rarity's missions: each has its own on Sorare", async () => {
    const missions: MissionsModel = { rare: { missions: [row("Assist - All Matches")], seen_at: "2026-10-06T14:00:00Z" } };
    const today = await missionsToday(null, missions, "limited", NOW);
    expect(today.status).toBe("never");
    expect(today.seen).toEqual(["rare"]);
  });

  it("keeps a day with no mission as today's, with nothing to pick", async () => {
    const missions: MissionsModel = { rare: { missions: [], seen_at: "2026-10-06T14:00:00Z", verified: true } };
    const today = await missionsToday(null, missions, "rare", NOW);
    expect(today).toMatchObject({ status: "today", plans: [], seen: [] });
  });
});
