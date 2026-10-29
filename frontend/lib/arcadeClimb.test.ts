import { describe, expect, it } from "vitest";
import type { ArcadeGame } from "./arcade";
import { climbWindows, comparePrizes, moments, quickChance, quickLineup, windowsOf } from "./arcadeClimb";
import type { Outlook } from "./arcadePlan";

const game = (id: string, kickoff: string): ArcadeGame => ({ id, kickoff, status: "scheduled", competition: { slug: "laliga-es", name: "LaLiga" }, home: { slug: `${id}-h`, name: "H", crest: null }, away: { slug: `${id}-a`, name: "A", crest: null } });
const POS = [["Goalkeeper"], ["Defender"], ["Midfielder"], ["Forward"], ["Midfielder"], ["Defender"]];
/** Six cards of one club in one game, each scoring `score` if he plays, with a full record around it. */
const squad = (g: ArcadeGame, prefix: string, score: number, start: number | null = 1): Outlook[] => POS.map((positions, i) => ({
  card: { slug: `${prefix}${i}-card`, player: `${prefix}${i}`, name: `${prefix}${i}`, team: "H", teamSlug: `${g.id}-h`, teamPicture: null, league: null, positions, picture: null, edition: null, bonus: 1 },
  game: g, score, scoreSource: "sorare", start, startSource: start === null ? null : "sorare", past: [0.8, 0.9, 1, 1.1, 1.2].map((x) => x * score), bonus: 0, club: 0,
}));
/** Like his board: the last two steps pay cash (€100, then €1,000), the others essence or gems. */
const CASH = [0, 0, 0, 100, 1000];
const steps = [1, 2, 3, 4, 5].map((number) => ({ number, target: 250 + number * 40, lives: 4, big: false, cash: CASH[number - 1] }));
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
    const plan = climbWindows(list, steps, from(4, 1, 3), 0.5, NOW); // step 4 pays €100
    expect(plan.verdict.kind).toBe("wait");
    expect(plan.verdict.waitFor?.at).toBe(Date.parse("2026-11-01T17:30:00Z"));
    expect(plan.verdict.waitFor!.chance).toBeGreaterThan(plan.verdict.chanceNow!);
    expect(comparePrizes(plan.verdict.wait, plan.verdict.now, 0.005)).toBeGreaterThan(0);
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
    const easyBelow = [200, 220, 240, 260, 425].map((target, i) => ({ number: i + 1, target, lives: 4, big: false, cash: CASH[i] }));
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

  it("pays every clear again: reaching the top (€1,000) starts the climb from step 1, and the plan keeps climbing", () => {
    const easy = [1, 2, 3, 4, 5].map((number) => ({ number, target: 200, lives: 4, big: false, cash: CASH[number - 1] }));
    const hours = ["08", "11", "14", "17", "20"];
    const list = ["2026-10-31", "2026-11-01"].flatMap((d, i) => hours.map((h) => squad(game(`G${i}${h}`, `${d}T${h}:00:00Z`), `g${i}${h}`, 80)).flat());
    const plan = climbWindows(list, easy, from(1), 0.5, NOW);
    expect(plan.path.map((m) => m.step)).toEqual([1, 2, 3, 4, 5, 1, 2, 3, 4, 5]);
    expect(plan.odds[5]).toBeGreaterThan(0.9);
  });

  it("judges by the chance at the biggest prize, never an average: a small gain at the top beats a big one lower down", () => {
    expect(comparePrizes([0, 1, 0.9, 0.2], [0, 1, 0.5, 0.19], 0.005)).toBeGreaterThan(0); // top 20% v 19%
    expect(comparePrizes([0, 1, 0.9, 0.2], [0, 1, 0.5, 0.2], 0.005)).toBeGreaterThan(0); // top tied: step 2 decides
    expect(comparePrizes([0, 1, 0.5, 0.2], [0, 1, 0.5, 0.203], 0.005)).toBe(0); // within half a point everywhere: a tie
  });

  it("builds from the window's own kick-offs first, not from games hours later, when that is as good", () => {
    const list = [...squad(game("A", "2026-10-31T11:00:00Z"), "a", 80), ...squad(game("B", "2026-10-31T13:00:00Z"), "b", 82)];
    const easy = [1, 2].map((number) => ({ number, target: 200, lives: 4, big: false }));
    const plan = climbWindows(list, easy, from(1), 0.5, NOW);
    expect(plan.path[0]).toMatchObject({ from: 0, to: 0, play: 1 });
  });

  it("never plays a card unlikely to start while a likely starter can take his slot; a benched card (0%) drops out", () => {
    const g = game("A", "2026-10-31T11:00:00Z");
    const list = squad(g, "a", 60);
    list.push({ ...list[3]!, card: { ...list[3]!.card, slug: "star-card", player: "star" }, score: 120, start: 0.3 });
    expect(quickLineup(list, 0.5)!.picks.map((p) => p.outlook.card.player)).not.toContain("star");
    list[3] = { ...list[3]!, start: 0 }; // the only other forward is on the bench: the doubtful star is all that is left
    expect(quickLineup(list, 0.5)!.picks.map((p) => p.outlook.card.player)).toContain("star");
  });
});
