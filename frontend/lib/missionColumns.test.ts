import { expect, it } from "vitest";
import { lastGames, perGame, relatedStats, roleHits } from "./missionColumns";
import { rewardStub } from "./missionPresentation";
import type { MissionForm } from "./playerSheet";

const window = { n: 10, means: { goals: 0.34, clean_sheet_60: 0.25, mins_played: 71.4, goal_assist: 0 }, samples: {} };
const form: MissionForm = { before: "2026-10-13T08:00:00Z", season: "2026/27", dnp: 0, missing: 0,
  windows: { l5: window, l10: window, season: window, starts: window, subs: window },
  recent: [
    { date: "2026-10-10", started: false, values: { interception_won: 3 } },
    { date: "2026-10-06", started: true, values: { interception_won: 1 } },
    { date: "2026-10-03", started: true, values: { interception_won: null } },
    { date: "2026-09-29", started: true, values: { interception_won: 2 } },
  ] };

it("judges each recent appearance against the target, oldest first, skipping games with no number", () => {
  const games = lastGames(form, { kind: "interception", atLeast: 2, label: "2+ interceptions" });
  expect(games.map((g) => [g.date, g.hit])).toEqual([["2026-09-29", true], ["2026-10-06", false], ["2026-10-10", true]]);
  expect(roleHits(games, true)).toBe("1/2");
  expect(roleHits(games, false)).toBe("1/1");
  expect(lastGames(form, { kind: "unsupported", label: "?" })).toEqual([]);
  expect(lastGames(undefined, { kind: "decisive", label: "d" })).toEqual([]);
  expect(roleHits([], true)).toBe("–");
});

it("picks the stats that sit beside the counted one and prints them per game", () => {
  const [goals, , cleanSheet] = relatedStats({ kind: "decisive", label: "d" });
  expect(perGame(form, goals)).toBe("0.3");
  expect(perGame(form, cleanSheet)).toBe("25%");
  expect(perGame(form, ["mins_played", "Minutes"])).toBe("71");
  expect(perGame(form, ["goal_assist", "Assists"])).toBe("0");
  expect(perGame(form, ["saves", "Saves"])).toBe("–");
  expect(perGame(undefined, goals)).toBe("–");
  expect(relatedStats({ kind: "interception", atLeast: 2, label: "" }).map(([key]) => key)).toEqual(["won_tackle", "poss_won", "duel_won"]);
});

it("splits a reward into the number and the unit for a ticket", () => {
  expect(rewardStub("200 XP")).toEqual({ num: "200", unit: "XP" });
  expect(rewardStub("50 Essence · 350 Essence")).toEqual({ num: "50 · 350", unit: "Essence" });
  expect(rewardStub("200 XP · 50 Essence")).toEqual({ num: "200 · 50", unit: "XP · Essence" });
  expect(rewardStub("Rare clue")).toEqual({ num: "Rare clue", unit: "" });
  expect(rewardStub(null)).toBeNull();
});
