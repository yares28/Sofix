import { describe, expect, it, vi } from "vitest";
import type { Arcade, ArcadeCard, ArcadeExtras, ArcadeGame, ArcadeRead } from "./arcade";
import { alertsOf, buildDock, changeLine, sheetOf, watchDue, type ArcadeDockModel, type DockElevens, type DockInput, type DockLineup } from "./arcadeDock";
import { work } from "./arcadeDock.worker";
import { GRACE_MS, PLAN_MS, runEngine, stopped, type EngineDeps, type EngineReport } from "./arcadeEngine";
import type { ArcadeElevens } from "./arcadeElevens";

// The dock's Arcade engine against every failure plans/dock-v2.md lists: each ends in words, and a failed run never replaces the plan.

const NOW = Date.parse("2026-11-14T15:00:00Z");
const KICK = "2026-11-14T17:30:00Z";
const POS = [["Goalkeeper"], ["Defender"], ["Midfielder"], ["Forward"], ["Midfielder"], ["Defender"], ["Forward"]];
const game = (id: string, kickoff = KICK): ArcadeGame => ({ id: `Game:${id}`, kickoff, status: "scheduled", competition: { slug: "laliga-es", name: "LaLiga" }, home: { slug: `${id}-h`, name: `${id} H`, crest: null }, away: { slug: `${id}-a`, name: `${id} A`, crest: null } });
const card = (club: string, i: number): ArcadeCard => ({ slug: `${club}${i}-card`, player: `${club}${i}`, name: `Player ${club}${i}`, team: club, teamSlug: club, teamPicture: null, league: null, nation: null, positions: POS[i % POS.length]!, picture: `https://x/${club}${i}.png`, edition: null, bonus: 1 });
const G1 = game("g1");
const cards = [...[0, 1, 2, 3, 4, 5, 6].map((i) => card("g1-h", i)), ...[0, 1, 2, 3, 4, 5].map((i) => card("g1-a", i))];

const arcade = (over: Partial<Arcade> = {}): Arcade => ({
  owner: "me", set: { slug: "set", name: "Autumn", start: null, end: "2026-11-20T00:00:00Z", leagues: [] }, gems: 0, essence: 0,
  board: { id: "b", config: "c", title: null, end: null, current: 1, restartable: null, steps: [1, 2, 3].map((number) => ({
    id: `00000000-0000-0000-0000-00000000000${number}`, number, level: number - 1, title: null, target: 200 + number * 50, originalTarget: null, state: number === 1 ? "PLAYABLE" : "LOCKED",
    rewards: ["10 gems"], lineups: { max: 4, remaining: 4, locked: 0, pending: 0 }, captain: 0.5, collection: null, packs: [], entered: [],
  })) },
  games: [G1], cards, otherSetCards: 0, cardsCut: false, missions: [], ...over,
});
const extras: ArcadeExtras = { club: {}, past: Object.fromEntries(cards.map((c) => [c.player, [50, 55, 60]])), projections: { [G1.id]: Object.fromEntries(cards.map((c) => [c.player, 55])) }, unread: [] };
const noElevens: ArcadeElevens = { state: "ok", chances: {}, games: [], unread: [], checked: 1, at: NOW };

function deps(over: Partial<EngineDeps> = {}) {
  const reports: EngineReport[] = [];
  const d: EngineDeps = {
    readArcade: async (): Promise<ArcadeRead> => ({ state: "ok", arcade: arcade(), unread: [] }),
    readExtras: async () => extras,
    appData: async () => ({ laliga: {}, chances: {} }),
    readBench: async () => null,
    readElevens: async () => noElevens,
    plan: async (input) => work({ kind: "plan", input }),
    rough: async (input) => work({ kind: "rough", input }),
    aim: async () => null,
    report: (r) => reports.push(r),
    now: () => NOW,
    ...over,
  };
  return { d, reports, model: () => reports.findLast((r) => r.model)?.model ?? null };
}

describe("the dock's Arcade engine", () => {
  it("plans the next lineup and the best ones to clear the step, each card saying whose start % it shows", async () => {
    const { d, model, reports } = deps();
    const run = await runEngine(d, null);
    expect(run.state).toBe("done");
    expect(reports.map((r) => r.run.stage)).toEqual(expect.arrayContaining(["board", "forecasts", "lineups", "plan"]));
    const m = model()!;
    expect(m.state).toBe("ready");
    expect(m.next?.cards).toHaveLength(5);
    expect(m.best.length).toBeGreaterThan(0);
    expect(m.step).toMatchObject({ number: 1, target: 250, lives: 4 });
    expect(Object.keys(m.next!.alternatives)).toHaveLength(5);
    // the best list to clear the step is never worse than the lineup the climb plays next
    expect(m.best[0]!.p).toBeGreaterThanOrEqual(m.next!.p);
    expect(m.best.map((l) => l.p)).toEqual([...m.best.map((l) => l.p)].sort((a, b) => b - a));
  }, 60_000);

  it("names the step that failed when Sorare refuses the card read, and reports no plan", async () => {
    const { d, model } = deps({ readArcade: async () => ({ state: "failed", detail: "cards: 429" }) });
    const run = await runEngine(d, null);
    expect(run.error?.text).toBe("Couldn't read your cards from Sorare (429).");
    expect(model()).toBeNull();
  });

  it.each([["no-tab", "Open sorare.com"], ["signed-out", "Sign in to Sorare"], ["unreadable", "shape Sofix doesn't know"]] as const)("says %s in words", async (state, words) => {
    const { d } = deps({ readArcade: async () => ({ state }) });
    expect((await runEngine(d, null)).error?.text).toContain(words);
  });

  it("ends a read that never answers instead of hanging", async () => {
    vi.useFakeTimers();
    const { d } = deps({ readArcade: () => new Promise(() => undefined) });
    const running = runEngine(d, null);
    await vi.advanceTimersByTimeAsync(121_000);
    expect((await running).error?.text).toBe("Sorare did not answer.");
    vi.useRealTimers();
  });

  it("plans on Sorare's numbers when Sofix is unreachable, and says so", async () => {
    const { d, model } = deps({ appData: async () => null });
    const run = await runEngine(d, null);
    expect(run.notes).toContain("Sofix unreachable: Sorare's numbers only");
    expect(model()?.sofix).toBe(false);
  }, 60_000);

  it("falls back to a rough lineup for the step when the climb runs out of time", async () => {
    const { d, model } = deps({ plan: () => Promise.reject(new Error("took too long")) });
    const run = await runEngine(d, null);
    expect(run.state).toBe("done");
    expect(model()?.state).toBe("rough");
    expect(model()?.next?.cards).toHaveLength(5);
  }, 60_000);

  it("fails in words when neither the climb nor the rough lineup answers (the engine was stopped)", async () => {
    const { d, model } = deps({ plan: () => Promise.reject(new Error("x")), rough: () => Promise.reject(new Error("x")) });
    expect((await runEngine(d, null)).error?.text).toBe("Calculation stopped before a lineup was found.");
    expect(model()).toBeNull();
  });

  it("calls a run stopped only once it is past its stage's deadline", () => {
    expect(stopped({ state: "working", deadline: NOW }, NOW + GRACE_MS)).toBe(false);
    expect(stopped({ state: "working", deadline: NOW }, NOW + GRACE_MS + 1)).toBe(true);
    expect(stopped({ state: "done", deadline: NOW }, NOW + PLAN_MS)).toBe(false);
  });

  it("fails rather than scoring cards on nothing when projections cannot be read", async () => {
    const { d } = deps({ readExtras: async () => null });
    expect((await runEngine(d, null)).error?.text).toBe("Couldn't read projections and past scores from Sorare.");
  });

  it("keeps planning when the lineups read breaks, and lists the games it could not read", async () => {
    const { d, model } = deps({ readElevens: () => Promise.reject(new Error("boom")) });
    await runEngine(d, null);
    expect(model()?.lineupsOut.unread).toEqual(["g1 H–g1 A"]);
  }, 60_000);

  it("says no set is running instead of failing", async () => {
    const { d, model } = deps({ readArcade: async () => ({ state: "no-set" }) });
    await runEngine(d, null);
    expect(model()?.state).toBe("no-set");
  });
});

const elevens = (over: Partial<DockElevens> = {}): DockElevens => ({ games: [], unread: [], checked: [], bench: {}, chances: {}, at: NOW, limited: false, outdated: false, ...over });

describe("the dock's model", () => {
  const outlook = (player: string) => ({ card: { ...cards[0]!, player }, game: G1, score: 50, scoreSource: "sorare" as const, start: 0, startSource: "sorare" as const, confirmed: true, past: [], bonus: 0, club: 0 });

  it("tells benched from not in the squad, and both from an unannounced side", () => {
    const e = elevens({ chances: { [G1.id]: { a: [10000, 1], b: [0, 1], c: [0, 1] } }, bench: { [G1.id]: ["b"] } });
    expect(sheetOf(outlook("a"), e)).toBe("starter");
    expect(sheetOf(outlook("b"), e)).toBe("bench");
    expect(sheetOf(outlook("c"), e)).toBe("out");
    expect(sheetOf(outlook("d"), e)).toBeNull();
  });

  it("says why the next lineup changed: who the lineups left out, who came in, and the chance", () => {
    const lineup = (players: string[], p: number): DockLineup => ({ key: players.join(), first: KICK, last: KICK, p, x: 300, target: 250, step: 1, play: 1, alternatives: {},
      cards: players.map((player) => ({ slug: `${player}-c`, player, name: `Ana ${player}`, pic: null, slot: "MID", captain: false, points: 50, start: 1, source: "sorare", sheet: null, kickoff: KICK, club: null })) });
    expect(changeLine(lineup(["mayoral", "b"], 0.41), lineup(["unal", "b"], 0.47), (p) => (p === "mayoral" ? "bench" : null))).toBe("Lineups out: mayoral benched → unal in · 41% → 47%");
    expect(changeLine(lineup(["x", "b"], 0.41), lineup(["y", "b"], 0.41))).toBe("Plan changed: x → y in");
    expect(changeLine(lineup(["x"], 0.41), lineup(["x"], 0.42))).toBeNull();
    expect(changeLine(lineup(["x"], 0.41), lineup(["x"], 0.47))).toBe("Chance 41% → 47%");
  });

  it("flags an entered lineup still to kick off whose card the announced eleven leaves out", () => {
    const steps = arcade().board!.steps.map((s) => s.number === 1 ? { ...s, entered: [{ id: "l", state: "x", score: null, cancelled: false, live: false, updatable: true, forfeitable: false, draft: false,
      cards: [{ slug: "c", player: "b", name: "Bench Man", captain: false, score: null, locked: false, kickoff: KICK, bonus: 1, game: G1.id }] }] } : s);
    const e = elevens({ chances: { [G1.id]: { b: [0, 1] } }, bench: { [G1.id]: ["b"] } });
    expect(alertsOf(steps, e, NOW)).toEqual([{ step: 1, names: ["Bench Man"], kickoff: KICK }]);
    expect(alertsOf(steps, e, Date.parse(KICK) + 1)).toEqual([]);
  });

  it("watches for elevens from 75 minutes before a kick-off, every five minutes", () => {
    const m = { kickoffs: [Date.parse(KICK)] };
    expect(watchDue(m, 0, Date.parse(KICK) - 76 * 60_000)).toBe(false);
    expect(watchDue(m, 0, Date.parse(KICK) - 70 * 60_000)).toBe(true);
    expect(watchDue(m, Date.parse(KICK) - 70 * 60_000, Date.parse(KICK) - 68 * 60_000)).toBe(false);
    expect(watchDue(m, 0, Date.parse(KICK) + 1)).toBe(false);
  });

  it("keeps the last change line while the next lineup stays the same", () => {
    const input = { outlooks: [], steps: [], boardSteps: [], start: { step: 1, lives: 4, notBefore: null, held: [] }, current: 1, aim: null, captainBonus: 0, now: NOW, set: { name: "A", end: null }, games: [], status: {}, elevens: elevens(), sofix: true } as Omit<DockInput, "prev">;
    const prev = { change: { text: "Plan changed", at: 1 }, next: null } as unknown as ArcadeDockModel;
    expect(buildDock({ ...input, prev }, null).change).toEqual({ text: "Plan changed", at: 1 });
  });
});
