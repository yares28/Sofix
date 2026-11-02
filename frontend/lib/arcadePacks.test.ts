import { describe, expect, it } from "vitest";
import type { ArcadeGame } from "./arcade";
import { completePackOdds, ICON, missionGoal, openBundle, openMany, packRow, packsToFinish, parseTierOdds, spendGems, STAR_OR_BETTER, TIER_GOALS, type Goal, type SlotOdds } from "./arcadePacks";
import type { Outlook } from "./arcadePlan";
import { clubsToBuildAround, signalOf } from "./arcadeTeams";

// One slot: 2% Icon (player "i"), 8% Star ("s"), the rest Impact ("x" of Lens, "y" of Lille).
const slot: SlotOdds = { tiers: { GOAT: 0.02, STAR: 0.08, IMPACT: 0.9 }, players: {
  i: { p: 0.02, tier: "GOAT", team: "psg" }, s: { p: 0.08, tier: "STAR", team: "psg" }, x: { p: 0.45, tier: "IMPACT", team: "lens" }, y: { p: 0.45, tier: "IMPACT", team: "lille" },
} };
const gold = { slug: "gold", title: "Gold", league: "ligue-1-fr", price: 50, currency: "COMMON_GEM" };
const silver = { slug: "silver", title: "Silver", league: "ligue-1-fr", price: 10, currency: "COMMON_GEM" };
const icon: Goal = { label: "Icon", need: 1, distinct: false, tiers: ICON, owned: new Set() };

describe("pack maths", () => {
  it("compares two Gold against a Platinum and four Silver at the same total cost", () => {
    const row = (slug: string, price: number, chance: number) => packRow({ ...gold, slug, price }, [{ ...slot, tiers: { GOAT: chance } }], icon);
    const a = openBundle([{ row: row("gold", 50, 0.2), count: 2 }]);
    const b = openBundle([{ row: row("platinum", 60, 0.1), count: 1 }, { row: row("silver", 10, 0.05), count: 4 }]);
    expect(a.costs).toEqual({ COMMON_GEM: 100 });
    expect(b.costs).toEqual(a.costs);
    expect(a).toMatchObject({ packs: 2, cards: 2, certain: false });
    expect(b).toMatchObject({ packs: 5, cards: 5, certain: false });
    expect(a.atLeastOne).toBeCloseTo(0.36);
    expect(b.atLeastOne).toBeCloseTo(1 - 0.9 * 0.95 ** 4);
    expect(a.expected).toBeCloseTo(0.4);
    expect(b.expected).toBeCloseTo(0.3);
  });

  it("counts a new player once across different pack types and never converts currencies", () => {
    const fresh: Goal = { ...icon, distinct: true, owned: new Set(["x"]) };
    const odds = (p: number): SlotOdds => ({ tiers: { GOAT: p, IMPACT: 1 - p }, players: { i: { p, tier: "GOAT", team: null }, x: { p: 1 - p, tier: "IMPACT", team: null } } });
    const result = openBundle([{ row: packRow(gold, [odds(0.5)], fresh), count: 2 }, { row: packRow({ ...silver, currency: "COMMON_ESSENCE", price: 1000 }, [odds(0.25)], fresh), count: 4 }]);
    expect(result.costs).toEqual({ COMMON_GEM: 100, COMMON_ESSENCE: 4000 });
    expect(result.expected).toBeCloseTo(1 - 0.5 ** 2 * 0.75 ** 4);
    expect(result.expected).toBeLessThan(1);
    expect(result.none).toBeCloseTo(0.5 ** 2 * 0.75 ** 4);
  });

  it("keeps a tiny miss probability distinct from a guarantee in mixed options", () => {
    const result = openBundle([{ row: packRow(gold, [slot], icon), count: 10_000 }]);
    expect(result.atLeastOne).toBe(1);
    expect(result.certain).toBe(false);
    expect(result.none).toBeGreaterThan(0);
    expect(openBundle([])).toMatchObject({ packs: 0, cards: 0, expected: 0, atLeastOne: 0, certain: false, costs: {} });
    expect(() => openBundle([{ row: packRow(gold, [slot], icon), count: -1 }])).toThrow();
  });
  it("distinguishes numerical rounding to one from a guaranteed outcome", () => {
    const many = openMany([slot], icon, 10_000);
    expect(many.atLeastOne).toBe(1);
    expect(many.certain).toBe(false);
    const guaranteed = openMany([{ tiers: { GOAT: 1 }, players: { i: { p: 1, tier: "GOAT", team: null } } }], icon, 10);
    expect(guaranteed.certain).toBe(true);
  });
  it("preserves published tier shares when player-level weights do not sum to those shares", () => {
    // The live source returned complete tier totals but player totals between 95.9% and 105.4% on 2 November.
    const answer = { currentUser: { setBoard: { myCurrentStep: { cardPacks: [{ slug: "gold", s0: [
      { gameplayTier: "GOAT", probabilityBasisPoint: 200, playerOdds: [{ probabilityBasisPoint: 190, player: { slug: "i" } }] },
      { gameplayTier: "STAR", probabilityBasisPoint: 800, playerOdds: [{ probabilityBasisPoint: 900, player: { slug: "s" } }] },
      { gameplayTier: "IMPACT", probabilityBasisPoint: 9000, playerOdds: [{ probabilityBasisPoint: 5000, player: { slug: "x" } }, { probabilityBasisPoint: 4600, player: { slug: "y" } }] },
    ] }] } } } };
    const parsed = parseTierOdds([answer]).gold!;
    expect(parsed[0]!.tiers).toEqual(slot.tiers);
    expect(parsed[0]!.players.i!.p).toBeCloseTo(0.02);
    expect(parsed[0]!.players.s!.p).toBeCloseTo(0.08);
    expect(parsed[0]!.players.x!.p).toBeCloseTo(0.9 * 5000 / 9600);
    expect(completePackOdds(parsed, 1)).toBe(true);
    expect(openMany(parsed, { label: "New players", need: 1, distinct: true, owned: new Set() }, 1).atLeastOne).toBeCloseTo(1);
  });
  it("finds the best affordable integer combination rather than spending greedily", () => {
    const a = packRow({ ...gold, price: 6 }, [{ ...slot, tiers: { GOAT: 0.7 } }], icon);
    const b = packRow({ ...silver, price: 5 }, [{ ...slot, tiers: { GOAT: 0.6 } }], icon);
    const result = spendGems([a, b], 10);
    expect(result.buys.map(b => [b.slug, b.count])).toEqual([["silver", 2]]);
    expect(result.atLeastOne).toBeCloseTo(0.84);
    expect(spendGems([a, b], 0).buys).toEqual([]);
    expect(spendGems([a, b], 10, "COMMON_ESSENCE").buys).toEqual([]);
  });

  it("counts the same new player once across all packs in a budget", () => {
    const fresh: Goal = { label: "New players", need: 1, distinct: true, owned: new Set() };
    const only = { tiers: { GOAT: 1 }, players: { i: { p: 1, tier: "GOAT", team: null } } };
    const result = spendGems([packRow(silver, [only], fresh)], 40);
    expect(result.buys[0]?.count).toBe(4);
    expect(result.expected).toBe(1);
    expect(result.atLeastOne).toBe(1);
  });

  it("shows exact tiers separately from Icon or Star, for the chosen number of packs", () => {
    const withPlus = { ...slot, tiers: { GOAT: 0.02, STAR_PLUS: 0.03, STAR: 0.05, IMPACT: 0.9 } };
    const odds = (key: string, n: number) => openMany([withPlus, withPlus], { ...icon, tiers: TIER_GOALS.find(t => t.key === key)!.tiers }, n);
    expect(odds("icon", 10).atLeastOne).toBeCloseTo(1 - 0.98 ** 20);
    expect(odds("star-or-icon", 10).atLeastOne).toBeCloseTo(1 - 0.9 ** 20);
    expect(odds("star", 10).expected).toBeCloseTo(1);
    expect(odds("star-plus", 10).expected).toBeCloseTo(0.6);
    expect(odds("reserve", 10)).toEqual({ atLeastOne: 0, certain: false, expected: 0 });
  });

  it("rejects missing slots and incomplete tier totals instead of treating them as zero", () => {
    const answer = { currentUser: { setBoard: { myCurrentStep: { cardPacks: [{ slug: "gold", s1: [{ gameplayTier: "GOAT", probabilityBasisPoint: 10000, playerOdds: [] }] }] } } } };
    const odds = parseTierOdds([answer]);
    expect(completePackOdds(odds.gold, 2)).toBe(false);
    expect(completePackOdds([slot], 2)).toBe(false);
    expect(completePackOdds([{ ...slot, tiers: { GOAT: 0.02 } }], 1)).toBe(false);
    expect(completePackOdds([slot], 1)).toBe(true);
    expect(completePackOdds([slot], 0)).toBe(false);
  });
  it("reads Sorare's tier odds per slot, each tier's share and each player's chance", () => {
    const answer = { currentUser: { setBoard: { myCurrentStep: { cardPacks: [{ slug: "gold", s0: [
      { gameplayTier: "GOAT", probabilityBasisPoint: 200, playerOdds: [{ probabilityBasisPoint: 200, player: { slug: "i" }, team: { slug: "psg" } }] },
      { gameplayTier: "IMPACT", probabilityBasisPoint: 9800, playerOdds: [{ probabilityBasisPoint: 9800, player: { slug: "x" }, team: { slug: "lens" } }] },
    ] }] } } } };
    expect(parseTierOdds([answer]).gold![0]).toEqual({ tiers: { GOAT: 0.02, IMPACT: 0.98 }, players: { i: { p: 0.02, tier: "GOAT", team: "psg" }, x: { p: 0.98, tier: "IMPACT", team: "lens" } } });
  });

  it("gives a pack's chance of at least one Icon as 1 − Π(1 − slot share), and its average as the sum", () => {
    const row = packRow(gold, [slot, slot, slot, slot, slot], icon);
    expect(row.atLeastOne).toBeCloseTo(1 - 0.98 ** 5);
    expect(row.expected).toBeCloseTo(0.1);
    expect(row.perHit).toBeCloseTo(500);
    expect(packRow(gold, [slot], { ...icon, tiers: STAR_OR_BETTER }).atLeastOne).toBeCloseTo(0.1);
  });

  it("compares combinations including packs bought with the remainder", () => {
    const cheap = packRow(silver, [{ ...slot, tiers: { GOAT: 0.006 } }], icon); // 0.6% for 10 gems beats 9.6% for 50 only if 5 of them give more
    const dear = packRow(gold, [slot, slot, slot, slot, slot], icon);
    const plan = spendGems([cheap, dear], 120);
    expect(plan.buys.map((b) => [b.slug, b.count])).toEqual([["gold", 2], ["silver", 2]]);
    expect(plan.spent).toBe(120);
    expect(plan.atLeastOne).toBeCloseTo(1 - (1 - dear.atLeastOne) ** 2 * (1 - cheap.atLeastOne) ** 2);
  });

  it("counts a club mission's new players once each, and none you own", () => {
    const lille: Goal = { label: "Lille", need: 1, distinct: true, teams: new Set(["lille"]), owned: new Set() };
    expect(packRow(gold, [slot, slot], lille).expected).toBeCloseTo(1 - 0.55 ** 2);
    expect(packRow(gold, [slot, slot], { ...lille, owned: new Set(["y"]) }).expected).toBe(0);
  });

  it("a club or league mission never counts a duplicate, or a special edition of a player you own", () => {
    const m = { title: "Ligue 1 collector", target: 3, progress: 1, players: [], teams: [], leagues: ["ligue-1-fr"] };
    const owned = new Set(["x", "y"]); // his Lens and Lille cards (any edition)
    const byPack = missionGoal(m, "ligue-1-fr", owned, new Map());
    expect(byPack).toMatchObject({ need: 2, distinct: true });
    expect(packRow(gold, [slot], byPack).expected).toBeCloseTo(0.1); // only the Icon and the Star are new
    const byClub = missionGoal({ ...m, leagues: [], teams: [{ slug: "lens" }] }, null, owned, new Map());
    expect(packRow(gold, [slot], byClub).expected).toBe(0);
  });

  it("gives the odds of opening many packs: 50 Bronze for 50k essence, 10 Gold for 500 gems", () => {
    expect(openMany([slot], icon, 10).atLeastOne).toBeCloseTo(1 - 0.98 ** 10);
    expect(openMany([slot], icon, 10).expected).toBeCloseTo(0.2);
    const fresh: Goal = { label: "new", need: 1, distinct: true, owned: new Set(["x", "y", "s"]) }; // only the Icon "i" is new
    expect(openMany([slot], fresh, 50).expected).toBeCloseTo(1 - 0.98 ** 50); // drawn twice, he still counts once
    expect(openMany([slot], icon, 0)).toEqual({ atLeastOne: 0, certain: false, expected: 0 });
  });

  it("works out how many packs a mission needs, the same every time", () => {
    const psg: Goal = { label: "PSG", need: 2, distinct: true, teams: new Set(["psg"]), owned: new Set() };
    const a = packsToFinish([slot, slot, slot, slot, slot], psg, 20);
    expect(a).toEqual(packsToFinish([slot, slot, slot, slot, slot], psg, 20));
    expect(a.half).not.toBeNull();
    expect(a.nine!).toBeGreaterThanOrEqual(a.half!);
    expect(packsToFinish([slot], { ...psg, need: 0 }, 1)).toEqual({ withinBudget: 1, half: 0, nine: 0 });
  });
});

describe("teams to build around", () => {
  const g: ArcadeGame = { id: "G", kickoff: "2026-10-31T15:00:00Z", status: "scheduled", competition: { slug: "ligue-1-fr", name: "Ligue 1" }, home: { slug: "lille", name: "Lille", crest: null }, away: { slug: "lens", name: "Lens", crest: null } };
  const o = (player: string, team: string, score: number, start: number | null): Outlook => ({
    card: { slug: `${player}-c`, player, name: player, team, teamSlug: team, teamPicture: null, league: null, positions: ["Midfielder"], picture: null, edition: null, bonus: 1 },
    game: g, score, scoreSource: "sorare", start, startSource: start === null ? null : "sofix", past: [], bonus: 0, club: 0,
  });
  it("reads a start from Sofix's number first, else Sorare's status; an injury is out", () => {
    expect(signalOf(o("a", "lille", 60, 0.8), undefined)).toBe("sofix");
    expect(signalOf(o("a", "lille", 60, 0.4), { tier: null, playing: "STARTER", injured: false, back: null })).toBe("doubt");
    expect(signalOf(o("a", "lille", 60, null), { tier: null, playing: "REGULAR", injured: false, back: null })).toBe("sorare");
    expect(signalOf(o("a", "lille", 60, 0.9), { tier: null, playing: "STARTER", injured: true, back: null })).toBe("out");
  });
  it("ranks clubs by what up to three likely starters add, including a single owned starter", () => {
    const list = [o("a", "lille", 60, 0.9), o("b", "lille", 50, null), o("c", "lille", 90, 0.2), o("d", "lens", 80, 0.9)];
    const picks = clubsToBuildAround(new Map([["G", list]]), [g], { b: { tier: null, playing: "STARTER", injured: false, back: null } }, 0, Infinity);
    expect(picks.map((p) => [p.club, p.value, p.likely])).toEqual([["lille", 104, 2], ["lens", 72, 1]]);
    expect(picks[0]!.cards.map((c) => c.outlook.card.player)).toEqual(["a", "b", "c"]);
  });
});
