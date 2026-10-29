import { describe, expect, it } from "vitest";
import type { ArcadeGame } from "./arcade";
import { climbWindows, moments, quickChance, quickLineup, windowsOf } from "./arcadeClimb";
import type { Outlook } from "./arcadePlan";

const game = (id: string, kickoff: string): ArcadeGame => ({ id, kickoff, status: "scheduled", competition: { slug: "laliga-es", name: "LaLiga" }, home: { slug: `${id}-h`, name: "H", crest: null }, away: { slug: `${id}-a`, name: "A", crest: null } });
const POS = [["Goalkeeper"], ["Defender"], ["Midfielder"], ["Forward"], ["Midfielder"], ["Defender"]];
/** Six cards of one club in one game, each scoring `score` if he plays, with a full record around it. */
const squad = (g: ArcadeGame, prefix: string, score: number, start: number | null = 1): Outlook[] => POS.map((positions, i) => ({
  card: { slug: `${prefix}${i}-card`, player: `${prefix}${i}`, name: `${prefix}${i}`, team: "H", teamSlug: `${g.id}-h`, teamPicture: null, league: null, positions, picture: null, edition: null, bonus: 1 },
  game: g, score, scoreSource: "sorare", start, startSource: start === null ? null : "sorare", past: [0.8, 0.9, 1, 1.1, 1.2].map((x) => x * score), bonus: 0, club: 0,
}));
const steps = [1, 2, 3, 4, 5].map((number) => ({ number, target: 250 + number * 40, lives: 4, big: false }));
const NOW = Date.parse("2026-10-31T08:00:00Z");
const from = (step: number, lives = 4, best?: number) => ({ step, lives, notBefore: null, held: [], best });

describe("the window planner", () => {
  it("groups games kicking off within 75 minutes into one window", () => {
    const list = [...squad(game("A", "2026-10-31T13:00:00Z"), "a", 60), ...squad(game("B", "2026-10-31T14:00:00Z"), "b", 60), ...squad(game("C", "2026-10-31T17:30:00Z"), "c", 60)];
    expect(windowsOf(list, NOW).map((w) => w.list.length)).toEqual([12, 6]);
  });

  it("climbs several steps in one day by chaining windows: each lineup settles before the next one starts", () => {
    const list = [
      ...squad(game("A", "2026-10-31T11:00:00Z"), "a", 75), ...squad(game("B", "2026-10-31T14:30:00Z"), "b", 75),
      ...squad(game("C", "2026-10-31T17:30:00Z"), "c", 75), ...squad(game("D", "2026-10-31T20:00:00Z"), "d", 75),
    ];
    const plan = climbWindows(list, steps, from(1), 0.5, NOW);
    expect(plan.path.map((m) => [m.step, new Date(m.at).toISOString().slice(11, 16)])).toEqual([[1, "11:00"], [2, "14:30"], [3, "17:30"], [4, "20:00"]]);
    expect(plan.verdict.kind).toBe("play");
    expect(plan.odds[3]).toBeGreaterThan(0.5);
  });

  it("waits for a clearly better window soon, and says which", () => {
    const list = [...squad(game("A", "2026-10-31T11:00:00Z"), "a", 55), ...squad(game("B", "2026-11-01T17:30:00Z"), "b", 85)];
    const plan = climbWindows(list, steps, from(3, 1, 2), 0.5, NOW);
    expect(plan.verdict.kind).toBe("wait");
    expect(plan.verdict.waitFor?.at).toBe(Date.parse("2026-11-01T17:30:00Z"));
    expect(plan.verdict.waitFor!.chance).toBeGreaterThan(plan.verdict.chanceNow!);
    expect(plan.verdict.wait).toBeGreaterThan(plan.verdict.now);
  });

  it("plays now when a later window is only a little better: a skipped window is a try lost", () => {
    const list = [
      ...squad(game("A", "2026-10-31T11:00:00Z"), "a", 74), ...squad(game("B", "2026-10-31T14:30:00Z"), "b", 76),
      ...squad(game("C", "2026-10-31T17:30:00Z"), "c", 74), ...squad(game("D", "2026-10-31T20:00:00Z"), "d", 74),
    ];
    const plan = climbWindows(list, steps, from(2, 4, 1), 0.5, NOW);
    expect(plan.verdict.kind).toBe("play");
    expect(plan.path[0]!.at).toBe(Date.parse("2026-10-31T11:00:00Z"));
  });

  it("spends a hard step's last life at once when the steps below are quick: back with 4 fresh lives sooner beats one held try", () => {
    const easyBelow = [200, 220, 240, 260, 425].map((target, i) => ({ number: i + 1, target, lives: 4, big: false }));
    const days = ["2026-10-31", "2026-11-01", "2026-11-02", "2026-11-03"].flatMap((d, i) => [
      ...squad(game(`M${i}`, `${d}T11:00:00Z`), `m${i}`, 75), ...squad(game(`A${i}`, `${d}T14:30:00Z`), `a${i}`, 75), ...squad(game(`E${i}`, `${d}T18:00:00Z`), `e${i}`, 75),
    ]);
    const plan = climbWindows(days, easyBelow, from(5, 1, 4), 0.5, NOW);
    expect(plan.path[0]).toMatchObject({ step: 5, play: 1 });
    expect(plan.path[0]!.clear).toBeLessThan(0.5);
    expect(plan.verdict.kind).toBe("spend");
    expect(plan.odds[5]).toBeGreaterThan(plan.path[0]!.clear); // more than the one try the held life would give
  });
  it("holds a hard step's lives for a strong day coming, rather than throw them at weak ones", () => {
    const days = [
      ...squad(game("W1", "2026-10-31T11:00:00Z"), "w1", 55), ...squad(game("W2", "2026-10-31T18:00:00Z"), "w2", 55),
      ...squad(game("S1", "2026-11-02T18:00:00Z"), "s1", 95),
    ];
    const plan = climbWindows(days, steps, from(5, 1, 4), 0.5, NOW);
    expect(plan.verdict.kind).toBe("wait");
    expect(plan.verdict.waitFor?.at).toBe(Date.parse("2026-11-02T18:00:00Z"));
  });

  it("never captains a card with no start % while another has one", () => {
    const g = game("A", "2026-10-31T11:00:00Z");
    const list = squad(g, "a", 60);
    list[3] = { ...list[3]!, score: 90, start: null, startSource: null };
    const q = quickLineup(list, 0.5)!;
    expect(q.picks.find((p) => p.captain)!.outlook.start).not.toBeNull();
  });

  it("gives a card with under 3 played games a spread, so a thin record is not counted as a sure score", () => {
    const o = { ...squad(game("A", "2026-10-31T11:00:00Z"), "a", 60)[0]!, past: [60] };
    expect(moments(o, false, 0)[1]).toBeGreaterThan(0);
    const sure = quickChance({ mean: 300, sd: 0 }, 300);
    expect(sure).toBe(1);
  });

  it("keeps a card in a running lineup out of every window before that lineup settles", () => {
    const g = game("A", "2026-10-31T11:00:00Z");
    const plan = climbWindows(squad(g, "a", 70), steps, { ...from(1), held: [{ card: "a0-card", until: Date.parse("2026-10-31T13:00:00Z") }] }, 0.5, NOW);
    expect(plan.path).toEqual([]); // the only goalkeeper is busy
  });
});
