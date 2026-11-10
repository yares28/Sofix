import { describe, expect, it } from "vitest";
import type { ArcadeGame } from "./arcade";
import { climbWindows, comparePrizes, holdSplit, kickOf, moments, quickChance, quickLineup, windowsOf, type Move } from "./arcadeClimb";
import { bestLineup, chanceOf, type Outlook } from "./arcadePlan";

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
  it("uses all four step-one lives when misses reset for free before the next opportunity, even for a tiny extra chance", () => {
    const list = [0, 1, 2, 3].flatMap((i) => squad(game(`A${i}`, "2026-10-31T11:00:00Z"), `a${i}`, 46));
    const plan = climbWindows(list, [{ number: 1, target: 300, lives: 4, big: false }], from(1), 0.5, NOW);
    expect(plan.path[0]?.play).toBe(4);
    expect(plan.verdict.chanceNow).toBe(plan.path[0]?.clear);
  });

  it("does not spend four lives across later kickoffs when one lineup can advance before those games", () => {
    const list = [...squad(game("A", "2026-10-31T11:00:00Z"), "a", 80),
      ...[0, 1, 2].flatMap((i) => squad(game(`B${i}`, "2026-10-31T14:30:00Z"), `b${i}`, 80))];
    const plan = climbWindows(list, steps, from(1), 0.5, NOW);
    expect(plan.path[0]).toMatchObject({ play: 1, from: 0, to: 0 });
    expect(plan.path[1]?.step).toBe(2);
  });

  it("uses the builder's exact cards, captain and simulated probability throughout the climb", () => {
    const g = game("A", "2026-10-31T11:00:00Z");
    const list = squad(g, "a", 60, 0.83);
    list[1] = { ...list[1]!, score: 70, past: [5, 20, 50, 90, 110] };
    list[5] = { ...list[5]!, score: 68, past: [60, 65, 68, 70, 75] };
    const plan = climbWindows(list, steps, from(1), 0.5, NOW);
    const move = plan.path[0]!;
    const expected = bestLineup(move.list, steps[0]!.target, 0.5)!;
    expect(move.lineups[0]!.picks).toEqual(expected.picks);
    expect(move.clear).toBe(chanceOf(expected.totals, steps[0]!.target));
    expect(bestLineup([...move.list].reverse(), steps[0]!.target, 0.5)?.picks).toEqual(expected.picks);
  });

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

  it("never spends a life on a long shot when the next lineup is far likelier and the gain is within the model's noise", () => {
    // His board on 9 Nov 2026: step 4 of 6 with 2 lives; it said play an 11% lineup on Friday night, before a 31% one on Saturday.
    const board = [260, 300, 360, 400, 440, 480].map((target, i) => ({ number: i + 1, target, lives: 4, big: i >= 3, cash: [0, 0, 0, 0, 100, 1000][i] }));
    const wide = (list: Outlook[]) => list.map((o) => ({ ...o, past: [0.6, 0.8, 1, 1.2, 1.4].map((x) => x * o.score!) }));
    const days = ["2026-11-13", "2026-11-14", "2026-11-15", "2026-11-16"].flatMap((d, i) => wide([
      ...squad(game(`W${i}`, `${d}T19:30:00Z`), `w${i}`, 62), ...squad(game(`S${i}`, `${d}T12:30:00Z`), `s${i}`, 72), ...squad(game(`M${i}`, `${d}T16:00:00Z`), `m${i}`, 66),
    ]));
    const plan = climbWindows(days, board, { step: 4, lives: 2, notBefore: null, held: [], best: 3 }, 0.5, Date.parse("2026-11-13T18:00:00Z"));
    const first = plan.path[0]!;
    expect(first).toMatchObject({ step: 4, lives: 2 });
    expect(first.clear).toBeGreaterThan(0.4);
    expect(first.lineups[0]!.picks.every((p) => p.outlook.game.id.startsWith("S"))).toBe(true); // Saturday's strong games, not Friday's
    expect(plan.verdict.chanceNow!).toBeGreaterThan(0.4);
  }, 30_000);

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

describe("the Surest chain", () => {
  // Owner, 10 Nov 2026: "the closest best lineups I can actually play for that step ... sacrificing speed".
  it("plays the nearest window whose lineup beats the fastest chain's by 15 points, step by step", () => {
    const list = [
      ...squad(game("A", "2026-10-31T11:00:00Z"), "a", 60), ...squad(game("B", "2026-10-31T14:30:00Z"), "b", 62),
      ...squad(game("C", "2026-11-01T17:30:00Z"), "c", 90), ...squad(game("D", "2026-11-02T17:30:00Z"), "d", 95),
    ];
    const plan = climbWindows(list, steps, from(2, 4, 1), 0.5, NOW);
    expect(plan.path[0]!.at).toBe(Date.parse("2026-10-31T11:00:00Z")); // fastest plays at once
    const [first, second] = plan.surest;
    expect(first).toMatchObject({ step: 2, at: Date.parse("2026-11-01T17:30:00Z"), same: false }); // C, not the later D
    expect(first!.gain).toBeGreaterThanOrEqual(0.15);
    expect(first!.clear - first!.gain!).toBeCloseTo(plan.path[0]!.clear, 5);
    expect(second).toMatchObject({ step: 3, at: Date.parse("2026-11-02T17:30:00Z") });
    expect(second!.from).toBeGreaterThan(first!.from);
  }, 30_000);

  it("plays the fastest chain's own move, marked, when no window beats it by 15 points", () => {
    // His board, 10 Nov 2026: 42% on Fri 20 Nov, and the best window left was Sat 28 Nov at 45%: a week's wait for 3 points.
    const list = [...squad(game("A", "2026-10-31T11:00:00Z"), "a", 74), ...squad(game("B", "2026-11-01T17:30:00Z"), "b", 76)];
    const plan = climbWindows(list, steps, from(2, 4, 1), 0.5, NOW);
    const first = plan.surest[0]!;
    expect(first).toMatchObject({ same: true, gain: 0, at: plan.path[0]!.at, clear: plan.path[0]!.clear, play: plan.path[0]!.play });
    expect(first.lineups).toEqual(plan.path[0]!.lineups);
  });

  it("never uses a card before its running lineup settles", () => {
    const list = [...squad(game("A", "2026-10-31T11:00:00Z"), "a", 95), ...squad(game("B", "2026-11-01T17:30:00Z"), "b", 60)];
    const held = squad(game("A", "2026-10-31T11:00:00Z"), "a", 95).map((o) => ({ card: o.card.slug, until: Date.parse("2026-10-31T13:00:00Z") }));
    const plan = climbWindows(list, steps, { ...from(2, 4, 1), held }, 0.5, NOW);
    expect(plan.surest[0]!.at).toBe(Date.parse("2026-11-01T17:30:00Z"));
  });

  it("starts again from step 1 after the top step, and its outcomes follow the Surest rule", () => {
    const easy = [1, 2].map((number) => ({ number, target: 200, lives: 4, big: false }));
    const hours = ["08", "11", "14", "17", "20"];
    const list = hours.map((h) => squad(game(`G${h}`, `2026-10-31T${h}:00:00Z`), `g${h}`, 80)).flat();
    const plan = climbWindows(list, easy, from(1), 0.5, NOW);
    expect(plan.surest.slice(0, 3).map((m) => m.step)).toEqual([1, 2, 1]);
    const missed = plan.after(plan.surest[0]!, false, true);
    expect(missed[0]).toMatchObject({ step: 1 });
    expect(missed[0]!.gain).toBeDefined();
  });
});

describe("a move's time", () => {
  // 9 Nov 2026: the Play bar said 20:30 (the window's first game) while "Enter before" said 20:45 (the lineup's first card).
  it("is its lineups' first kick-off, the time you must enter by, else the window's", () => {
    const lineup = (first: string) => ({ first, last: first }) as unknown as Move["lineups"][number];
    const move = { at: Date.parse("2026-11-20T19:30:00Z"), lineups: [lineup("2026-11-20T19:45:00Z"), lineup("2026-11-20T20:00:00Z")] } as Move;
    expect(kickOf(move)).toBe(Date.parse("2026-11-20T19:45:00Z"));
    expect(kickOf({ ...move, lineups: [] })).toBe(move.at);
  });
});

describe("the Play | Hold bar", () => {
  // 9 Nov 2026: "40% play and 31% hold is very misleading": one bar, Play and Hold sharing 100% by the prize that decides.
  const verdict = (now: number[], wait: number[]) => ({ now: [0, ...now], wait: [0, ...wait] });
  it("splits by the biggest prize where the two differ, the one the advice decides on", () => {
    const split = holdSplit(verdict([1, 1, 0.6, 0.30, 0.10, 0.03], [1, 1, 0.5, 0.25, 0.08, 0.01]));
    expect(split).toMatchObject({ step: 6, play: 0.75, hold: 0.25, playChance: 0.03, holdChance: 0.01 });
  });
  it("skips prizes within half a point and goes down to the next", () => {
    expect(holdSplit(verdict([1, 0.6, 0.3, 0.012], [1, 0.4, 0.3, 0.010]))).toMatchObject({ step: 2, play: 0.6, hold: 0.4 });
  });
  it("is an even split marked as a tie when no prize differs, and nothing when neither can win anything", () => {
    expect(holdSplit(verdict([1, 0.5, 0.2], [1, 0.5, 0.198]))).toMatchObject({ tie: true, play: 0.5, hold: 0.5 });
    expect(holdSplit(verdict([0, 0, 0], [0, 0, 0]))).toBeNull();
  });
  it("gives Play everything when holding wins nothing", () => {
    expect(holdSplit(verdict([0.4, 0.1], [0, 0]))).toMatchObject({ step: 2, play: 1, hold: 0 });
  });
});
