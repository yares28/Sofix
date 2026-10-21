import { describe, expect, it } from "vitest";
import { outlookOf, parseBonuses, parsePast, parseProjections, type ArcadeCard, type ArcadeGame } from "./arcade";
import { bestLineup, bigReward, chanceOf, lifeAdvice, likelyRange, planDay, predicted, simulate, type Lineup, type Outlook } from "./arcadePlan";

const GAME: ArcadeGame = { id: "Game:1", kickoff: "2026-10-24T14:00:00Z", status: "scheduled", competition: { slug: "laliga-es", name: "LaLiga" }, home: { slug: "home", name: "Home" }, away: { slug: "away", name: "Away" } };
const card = (player: string, positions: string[], bonus: number | null = 1): ArcadeCard => ({
  slug: `${player}-card`, player, name: player, team: "Home", teamSlug: "home", teamPicture: null, league: null, positions, picture: null, edition: null, bonus,
});
const outlook = (player: string, positions: string[], score: number | null, start: number | null, past: number[] = [], bonus = 0): Outlook => ({
  card: card(player, positions), game: GAME, score, scoreSource: score === null ? null : "sorare", start, startSource: start === null ? null : "sorare", past, bonus, club: 0,
});

describe("a card's predicted score", () => {
  it("is Sorare's projection × start % × 1 + edition + club (+ captain), as Sorare adds its bonuses", () => {
    const o = outlook("a", ["Forward"], 60, 0.5, [], 0.09);
    expect(predicted(o)).toBeCloseTo(60 * 0.5 * 1.09);
    expect(predicted(o, true, 0.5)).toBeCloseTo(60 * 0.5 * 1.59);
  });
  it("counts a card with no start % as starting, and gives none without a projection or a past game", () => {
    expect(predicted(outlook("a", ["Forward"], 50, null))).toBe(50);
    expect(predicted(outlook("a", ["Forward"], null, 0.9))).toBeNull();
  });
  it("has a likely range from his own played games only when he has 3 or more", () => {
    expect(likelyRange(outlook("a", ["Forward"], 50, 1, [40, 60]))).toBeNull();
    const [lo, hi] = likelyRange(outlook("a", ["Forward"], 50, 1, [10, 20, 30, 40, 50, 60, 70, 80, 90, 100]))!;
    expect(lo).toBeCloseTo(28);
    expect(hi).toBeCloseTo(82);
  });
});

describe("the chance a lineup reaches a target", () => {
  it("is certain or impossible when every card always starts and always scores the same", () => {
    const picks = [60, 60, 60, 60, 60].map((s, i) => ({ outlook: outlook(`p${i}`, ["Forward"], s, 1), captain: i === 0 }));
    const totals = simulate(picks, 0.5);
    expect(chanceOf(totals, 330)).toBe(1);
    expect(chanceOf(totals, 331)).toBe(0);
  });
  it("drops with a card's start %, and is the same every time (fixed seed)", () => {
    const picks = [60, 60, 60, 60, 60].map((s, i) => ({ outlook: outlook(`p${i}`, ["Forward"], s, i === 0 ? 0.5 : 1), captain: false }));
    const chance = chanceOf(simulate(picks, 0), 300);
    expect(chance).toBeGreaterThan(0.45);
    expect(chance).toBeLessThan(0.55);
    expect(chanceOf(simulate(picks, 0), 300)).toBe(chance);
  });
});

describe("the best lineup", () => {
  const pool = [
    outlook("gk", ["Goalkeeper"], 50, 1),
    outlook("d1", ["Defender"], 45, 1), outlook("d2", ["Defender"], 40, 1),
    outlook("m1", ["Midfielder"], 55, 1), outlook("m2", ["Midfielder"], 70, 0.2),
    outlook("f1", ["Forward"], 60, 1), outlook("f2", ["Forward"], 50, 1),
  ];
  it("fills GK, DEF, MID, FWD and an extra outfield card, each player once, with one captain", () => {
    const lineup = bestLineup(pool, 260, 0.5)!;
    expect(lineup.picks.map((p) => p.slot)).toEqual(["GK", "DEF", "MID", "FWD", "EXTRA"]);
    expect(new Set(lineup.picks.map((p) => p.outlook.card.player)).size).toBe(5);
    expect(lineup.picks.filter((p) => p.captain)).toHaveLength(1);
  });
  it("takes the sure starter over the bigger name who rarely starts when that reaches the target", () => {
    const lineup = bestLineup(pool, 260, 0.5)!;
    expect(lineup.picks.map((p) => p.outlook.card.player)).not.toContain("m2");
    expect(chanceOf(lineup.totals, 260)).toBe(1);
  });
  it("is null when no goalkeeper plays", () => {
    expect(bestLineup(pool.slice(1), 260, 0.5)).toBeNull();
  });
});

describe("Sorare's step-3 answers", () => {
  it("reads the club bonus of each card asked, in basis points", () => {
    const answer = { currentUser: { setBoard: { b0: [{ key: "collection", bonusBasisPoints: 300 }], b1: [] } } };
    expect(parseBonuses(answer, ["x", "y", "z"])).toEqual({ x: 0.03, y: 0 });
  });
  it("keeps only the games a player played", () => {
    const answer = { players: [{ slug: "p", playerGameScores: [{ score: 53, anyPlayerGameStats: { minsPlayed: 90 } }, { score: 0, anyPlayerGameStats: { minsPlayed: 0 } }, null] }] };
    expect(parsePast(answer)).toEqual({ p: [53] });
  });
  it("reads a game's projections, and none for a player Sorare has not projected", () => {
    const answer = { anyGame: { id: "Game:1", playerGameScores: [{ projection: { score: 48 }, anyPlayer: { slug: "a" } }, { projection: null, anyPlayer: { slug: "b" } }] } };
    expect(parseProjections(answer)).toEqual({ a: 48 });
  });
});

describe("a card's outlook", () => {
  const extras = { club: { home: 0.04 }, past: { a: [40, 60] }, projections: { "Game:1": { a: 55 } }, unread: [] };
  it("takes Sorare's projection, else his played average, and adds edition and club bonus", () => {
    const o = outlookOf({ ...card("a", ["Forward"], 1.05) }, GAME, extras, null, {});
    expect(o.score).toBe(55);
    expect(o.bonus).toBeCloseTo(0.09);
    expect(outlookOf(card("a", ["Forward"]), { ...GAME, id: "Game:2" }, extras, null, {}).score).toBe(50);
  });
  it("uses Lineups' LaLiga start % for the same game, else Sorare's saved one, else none", () => {
    const laliga = { a: { kickoff: GAME.kickoff, p: 0.8, source: "futbolfantasy" as const, sources: {} } };
    expect(outlookOf(card("a", ["Forward"]), GAME, extras, { "Game:1": { a: [6000, 0] } }, laliga)).toMatchObject({ start: 0.8, startSource: "futbolfantasy" });
    expect(outlookOf(card("a", ["Forward"]), GAME, extras, { "Game:1": { a: [6000, 0] } }, {})).toMatchObject({ start: 0.6, startSource: "sorare" });
    expect(outlookOf(card("a", ["Forward"]), GAME, extras, null, {})).toMatchObject({ start: null, startSource: null });
  });
});

describe("Pick a day", () => {
  const at = (id: string, kickoff: string): ArcadeGame => ({ ...GAME, id, kickoff });
  const squad = (game: ArcadeGame, prefix: string, score: number): Outlook[] =>
    ([["Goalkeeper"], ["Defender"], ["Midfielder"], ["Forward"], ["Midfielder"]] as string[][]).map((positions, i) => ({ ...outlook(`${prefix}${i}`, positions, score, 1), card: { ...card(`${prefix}${i}`, positions), slug: `${prefix}${i}-card` }, game }));
  const steps = [1, 2, 3].map((number) => ({ number, target: 250 + number * 50, lives: 4, big: false }));

  it("puts no card in two lineups, in the order they settle, and aims a lineup that starts after an earlier likely clear at the next step", () => {
    const plan = planDay([...squad(at("G2", "2026-10-24T18:00:00Z"), "b", 60), ...squad(at("G1", "2026-10-24T12:00:00Z"), "a", 70)], steps, 2, 0.5);
    expect(plan).toHaveLength(2);
    expect(plan.map((p) => p.lineup.first)).toEqual(["2026-10-24T12:00:00Z", "2026-10-24T18:00:00Z"]);
    const cards = plan.flatMap((p) => p.lineup.picks.map((x) => x.outlook.card.slug));
    expect(new Set(cards).size).toBe(cards.length);
    expect(plan.map((p) => p.step)).toEqual([2, 3]);
    expect(plan[1]).toMatchObject({ lostIf: null, after: null });
  });
  it("keeps a lineup that locks before the earlier one settles on the same step, lost if that one clears", () => {
    const plan = planDay([...squad(at("G1", "2026-10-24T12:00:00Z"), "a", 70), ...squad(at("G2", "2026-10-24T12:30:00Z"), "b", 60)], steps, 2, 0.5);
    expect(plan.map((p) => p.step)).toEqual([2, 2]);
    expect(plan[1]).toMatchObject({ lostIf: 0, after: 0 });
  });
  it("never plans more lineups than the lives left, and skips cards already in a lineup on Sorare", () => {
    const pool = [...squad(at("G1", "2026-10-24T12:00:00Z"), "a", 70), ...squad(at("G2", "2026-10-24T18:00:00Z"), "b", 60)];
    expect(planDay(pool, steps.map((s) => ({ ...s, lives: 1 })), 2, 0.5)).toHaveLength(1);
    expect(planDay(pool, steps, 2, 0.5, new Set(["a0-card"])).flatMap((p) => p.lineup.picks.map((x) => x.outlook.card.slug))).not.toContain("a0-card");
  });
});

describe("when to spend a life", () => {
  const lineupWith = (chance: number, known: boolean): Lineup => ({
    picks: [0, 1, 2, 3, 4].map((i) => ({ slot: "GK", outlook: outlook(`x${i}`, ["Goalkeeper"], 50, known ? 1 : null), captain: false })),
    expected: 0, totals: Array.from({ length: 100 }, (_, i) => (i < 100 - chance * 100 ? 0 : 500)), first: "", last: "",
  });
  const step = (number: number, lives = 4, big = false) => ({ number, target: 300, lives, big });
  it("always plays step 1", () => {
    expect(lifeAdvice({ chance: 0.2, step: step(1), days: 6, stepsLeft: 6 }, [{ day: "Sat", lineup: lineupWith(0.9, true) }]).play).toBe(true);
  });
  it("holds from step 2 when a later day is better, unless the days left are fewer than the steps to climb", () => {
    const later = [{ day: "Sat", lineup: lineupWith(0.8, true) }];
    expect(lifeAdvice({ chance: 0.5, step: step(2), days: 6, stepsLeft: 5 }, later)).toMatchObject({ play: false, better: { day: "Sat", chance: 0.8 } });
    expect(lifeAdvice({ chance: 0.5, step: step(2), days: 3, stepsLeft: 5 }, later).play).toBe(true);
    expect(lifeAdvice({ chance: 0.9, step: step(2), days: 6, stepsLeft: 5 }, later).play).toBe(true);
  });
  it("does not compare a later day whose lineup has no start % yet", () => {
    const advice = lifeAdvice({ chance: 0.5, step: step(3), days: 6, stepsLeft: 4 }, [{ day: "Sat", lineup: lineupWith(0.9, false) }]);
    expect(advice.play).toBe(true);
    expect(advice.why).toContain("no start % yet");
  });
  it("knows a big reward: 30 gems or money", () => {
    expect(bigReward(["30 gems"])).toBe(true);
    expect(bigReward(["€100", "1,000 Limited essence"])).toBe(true);
    expect(bigReward(["10 gems"])).toBe(false);
  });
});
