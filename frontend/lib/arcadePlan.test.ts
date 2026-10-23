import { describe, expect, it } from "vitest";
import { outlookOf, parseBonuses, parsePackOdds, parsePast, parseProjections, type ArcadeCard, type ArcadeGame } from "./arcade";
import { bestLineup, bigReward, chanceOf, climb, cutLosses, decisiveRate, rankDecisive, streakTarget, lifeAdvice, likelyRange, liveLineup, newPlayers, planDay, predicted, rankPacks, simulate, type Lineup, type Outlook } from "./arcadePlan";

const GAME: ArcadeGame = { id: "Game:1", kickoff: "2026-10-24T14:00:00Z", status: "scheduled", competition: { slug: "laliga-es", name: "LaLiga" }, home: { slug: "home", name: "Home", crest: null }, away: { slug: "away", name: "Away", crest: null } };
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
  it("gives five teammates in one game a better chance at a high bar than the same cards from five teams (their scores move together)", () => {
    const past = [20, 30, 40, 50, 60, 70, 80, 90];
    const stack = [0, 1, 2, 3, 4].map((i) => ({ outlook: outlook(`p${i}`, ["Forward"], 55, 1, past), captain: false }));
    const spread = stack.map((p, i) => ({ ...p, outlook: { ...p.outlook, card: { ...p.outlook.card, teamSlug: `club${i}` }, game: { ...GAME, id: `Game:${i}` } } }));
    const high = (picks: typeof stack) => chanceOf(simulate(picks, 0, 20_000), 350);
    expect(high(stack)).toBeGreaterThan(high(spread) + 0.01);
    // The middle stays where it was: linking teammates widens the spread, it does not move the expected total.
    const middle = (picks: typeof stack) => chanceOf(simulate(picks, 0, 20_000), 275);
    expect(Math.abs(middle(stack) - middle(spread))).toBeLessThan(0.03);
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
  it("scores a LaLiga, Premier League or Bundesliga card with Sofix's xScore for the same game, else Sorare's projection", () => {
    const sofix = { a: { kickoff: GAME.kickoff, p: 0.9, source: "sofix" as const, sources: {}, mu: 62 } };
    expect(outlookOf(card("a", ["Forward"]), GAME, extras, null, sofix)).toMatchObject({ score: 62, scoreSource: "sofix" });
    const otherGame = { a: { ...sofix.a, kickoff: "2026-10-28T20:00:00Z" } };
    expect(outlookOf(card("a", ["Forward"]), GAME, extras, null, otherGame)).toMatchObject({ score: 55, scoreSource: "sorare" });
  });
});

it("keeps the exact fixture model when another competition names the same player", () => {
  const first = { kickoff: GAME.kickoff, p: 0.2, source: "sofix" as const, sources: {}, decisive: 0.6 };
  const other = { ...first, kickoff: "2026-11-01T12:00:00Z", decisive: 0.1 };
  const index = { a: other, [`a:${Date.parse(GAME.kickoff)}`]: first };
  expect(outlookOf(card("a", ["Forward"]), GAME, null, null, index)).toMatchObject({ decisive: 0.6, start: 0.2 });
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

  it("plans past a step whose lives are all waiting, and climbs across days from where the day before leaves it", () => {
    const days: [string, Outlook[]][] = [
      ["2026-10-24", squad(at("G1", "2026-10-24T12:00:00Z"), "a", 80)],
      ["2026-10-25", squad(at("G2", "2026-10-25T12:00:00Z"), "b", 80)],
    ];
    // Step 2's lives are all waiting; one settles Saturday evening, so Saturday's noon game is too early and Sunday plays step 3.
    const after = climb(days, steps, { step: 3, lives: 4, notBefore: Date.parse("2026-10-24T20:00:00Z"), held: [] }, 0.5);
    expect(after.days.map((d) => [d.day, d.step, d.play])).toEqual([["2026-10-25", 3, 1]]);
    const fromOne = climb(days, steps, { step: 1, lives: 4, notBefore: null, held: [] }, 0.5);
    expect(fromOne.days.map((d) => [d.step, d.play])).toEqual([[1, 1], [2, 1]]);
    expect(fromOne.odds[2]).toBeGreaterThan(0.9);
    expect(fromOne.odds[3] ?? 0).toBe(0);
  });

  it("shows the other outcome of a played leg: the next step if it clears, a retry with the lives left if it misses", () => {
    const days: [string, Outlook[]][] = [
      ["2026-10-24", squad(at("G1", "2026-10-24T12:00:00Z"), "a", 80)],
      ["2026-10-25", squad(at("G2", "2026-10-25T12:00:00Z"), "b", 80)],
    ];
    const path = climb(days, steps, { step: 2, lives: 3, notBefore: null, held: [] }, 0.5);
    const first = path.days[0]!;
    expect(first.play).toBeGreaterThan(0);
    expect(path.after(first, true).map((d) => [d.day, d.step, d.lives])).toEqual([["2026-10-25", 3, 4]]);
    expect(path.after(first, false).map((d) => [d.day, d.step, d.lives])).toEqual([["2026-10-25", first.lives - first.play > 0 ? 2 : 1, first.lives - first.play > 0 ? first.lives - first.play : 4]]);
  });

  it("builds a lineup across days when no single day fills one, so Thursday's European games and Friday's league games are not skipped", () => {
    const thu = at("UEL", "2026-10-22T19:00:00Z");
    const fri = at("FRI", "2026-10-23T19:00:00Z");
    const pick = (game: ArcadeGame, p: string, positions: string[], score: number): Outlook => ({ ...outlook(p, positions, score, 1), card: { ...card(p, positions), slug: `${p}-card` }, game });
    const days: [string, Outlook[]][] = [
      ["2026-10-22", [pick(thu, "k", ["Goalkeeper"], 80), pick(thu, "d", ["Defender"], 80)]],
      ["2026-10-23", [pick(fri, "m", ["Midfielder"], 80), pick(fri, "f", ["Forward"], 80), pick(fri, "x", ["Midfielder"], 80)]],
      ["2026-10-24", squad(at("SAT", "2026-10-24T14:00:00Z"), "s", 80)],
      ["2026-10-25", squad(at("SUN", "2026-10-25T14:00:00Z"), "u", 80)],
    ];
    const path = climb(days, steps.map((s) => ({ ...s, lives: 1 })), { step: 1, lives: 1, notBefore: null, held: [] }, 0.5);
    expect(path.days.map((d) => [d.day, d.to, d.step, d.play])).toEqual([["2026-10-22", "2026-10-23", 1, 1], ["2026-10-24", "2026-10-24", 2, 1], ["2026-10-25", "2026-10-25", 3, 1]]);
    expect(path.odds[3]).toBeGreaterThan(0.9); // one step a day from Thursday: step 3 by Sunday
    // Every step on the way has its own lineup, not only the step you are on.
    expect(path.days.map((d) => d.lineups.length)).toEqual([1, 1, 1]);
    expect(path.days[0]!.lineups[0]!.picks.map((p) => p.outlook.game.id).sort()).toEqual(["FRI", "FRI", "FRI", "UEL", "UEL"]);
  });

  it("holds lives on a weak day for a stronger one, and holds a running lineup's cards until it settles", () => {
    const days: [string, Outlook[]][] = [["2026-10-24", squad(at("G1", "2026-10-24T12:00:00Z"), "a", 30)], ["2026-10-25", squad(at("G2", "2026-10-25T12:00:00Z"), "b", 80)]];
    const path = climb(days, steps, { step: 3, lives: 1, notBefore: null, held: [] }, 0.5);
    expect(path.days.map((d) => [d.step, d.play])).toEqual([[3, 0], [3, 1]]);
    expect(path.odds[3]).toBeGreaterThan(0.9);
    const held = [{ card: "a0-card", until: Date.parse("2026-10-24T13:00:00Z") }];
    expect(climb(days.slice(0, 1), steps, { step: 1, lives: 4, notBefore: null, held }, 0.5).days[0]!.play).toBe(0); // no goalkeeper left
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

describe("the best pack", () => {
  it("counts the players you do not have yet, each once even when two slots can draw him", () => {
    const slot = { mine: 0.5, a: 0.25, b: 0.25 };
    expect(newPlayers([slot], new Set(["mine"]))).toBeCloseTo(0.5);
    expect(newPlayers([slot, slot], new Set(["mine"]))).toBeCloseTo(2 * (1 - 0.75 * 0.75));
  });
  it("puts the packs you can afford first, then the most new players; a pack with no odds read is left out", () => {
    const packs = [
      { slug: "gold", title: "Gold", league: null, price: 50, currency: "COMMON_GEM", cards: 5 },
      { slug: "silver", title: "Silver", league: null, price: 10, currency: "COMMON_GEM", cards: 5 },
      { slug: "bronze", title: "Bronze", league: null, price: 1000, currency: "COMMON_ESSENCE", cards: 5 },
      { slug: "none", title: "None", league: null, price: 1, currency: "COMMON_GEM", cards: 1 },
    ];
    const odds: Record<string, Record<string, number>[]> = { gold: [{ x: 1 }, { y: 1 }], silver: [{ x: 0.5, mine: 0.5 }], bronze: [{ x: 1 }] };
    const ranked = rankPacks(packs, odds, new Set(["mine"]), { gems: 20, essence: 1500 });
    expect(ranked.map((p) => [p.slug, p.affordable])).toEqual([["bronze", true], ["silver", true], ["gold", false]]);
  });
  it("reads Sorare's odds two slots a question, adding a player's tiers up", () => {
    const answer = (slots: number[]) => ({ currentUser: { setBoard: { myCurrentStep: { cardPacks: [{ slug: "p", cardsCount: 3, ...Object.fromEntries(slots.map((i) => [`s${i}`, [
      { playerOdds: [{ probabilityBasisPoint: 2500, player: { slug: "a" } }] }, { playerOdds: [{ probabilityBasisPoint: 7500, player: { slug: "b" } }] },
    ]])) }] } } } });
    expect(parsePackOdds([answer([0, 1]), answer([2])])).toEqual({ p: [{ a: 0.25, b: 0.75 }, { a: 0.25, b: 0.75 }, { a: 0.25, b: 0.75 }] });
  });
});

describe("a lineup while it plays", () => {
  const NOW = Date.parse("2026-10-24T18:00:00Z");
  const played = "2026-10-24T14:00:00Z", playing = "2026-10-24T17:30:00Z", later = "2026-10-24T20:00:00Z";
  const known = (slug: string | null) => (slug ? outlook(slug, ["Forward"], 50, 1, [40, 50, 60]) : null);
  const card = (slug: string, score: number | null, kickoff: string, bonus = 1) => ({ slug, name: slug, score, kickoff, bonus });

  it("counts played and live cards with Sorare's multiplier, and the rest at their best past score for the ceiling", () => {
    const v = liveLineup([card("a", 50, played, 1.5), card("b", 20, playing), card("c", null, later)], 200, known, NOW);
    expect(v.cards.map((c) => c.state)).toEqual(["played", "live", "to play"]);
    expect(v.now).toBe(95);
    expect(v.ceiling).toBe(95 + 40 + 60);
    expect(v.dead).toBe(true);
    expect(v.chance).toBe(0);
  });
  it("is alive while the ceiling reaches the target, with the chance its cards still to play bring", () => {
    const v = liveLineup([card("a", 50, played), card("c", null, later)], 100, known, NOW);
    expect(v.dead).toBe(false);
    expect(v.chance).toBeCloseTo(2 / 3, 1); // he needs 50 of 40 / 50 / 60
  });
  it("never calls a lineup dead when a card still to play has no past games", () => {
    expect(liveLineup([card("a", 10, played), card("x", null, later)], 400, () => null, NOW).dead).toBe(false);
  });
  it("suggests cutting losses only when cancelling is allowed and the other lineup gains more than this one has left", () => {
    expect(cutLosses({ chance: 0.1 }, 0.2, true)).toBe(true);
    expect(cutLosses({ chance: 0.3 }, 0.2, true)).toBe(false);
    expect(cutLosses({ chance: 0 }, 0.2, false)).toBe(false);
  });
});

describe("missions", () => {
  it("rates a player on his own played games, never under 3, and ranks by historical rate independent of start %", () => {
    const g = (mins: number, ...stats: string[]) => ({ mins, stats });
    expect(decisiveRate([g(90, "goals"), g(90), g(0, "goals"), g(80, "goal_assist")], [])).toBeCloseTo(2 / 3);
    expect(decisiveRate([g(90, "goals"), g(90)], [])).toBeNull();
    expect(decisiveRate([g(90, "won_tackle"), g(90), g(90, "goals")], ["won_tackle"])).toBeCloseTo(1 / 3);
    const a = outlook("a", ["Forward"], 50, 0.5), b = outlook("b", ["Forward"], 50, 1), c = outlook("c", ["Forward"], 50, 1);
    expect(rankDecisive([{ outlook: a, rate: 0.6 }, { outlook: b, rate: 0.4 }, { outlook: c, rate: null }]).map((p) => [p.outlook.card.player, p.chance])).toEqual([["a", 0.6], ["b", 0.4], ["c", null]]);
  });

  it("reads a streak's target from Sorare's words", () => {
    expect(streakTarget("Score 400+ in the LALIGA EA SPORTS Common competition")).toBe(400);
    expect(streakTarget("Score 1,200+ points")).toBe(1200);
    expect(streakTarget("Win a game")).toBeNull();
  });
});
