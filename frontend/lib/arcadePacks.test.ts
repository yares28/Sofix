import { describe, expect, it } from "vitest";
import type { ArcadeGame } from "./arcade";
import { ICON, packRow, packsToFinish, parseTierOdds, spendGems, STAR_OR_BETTER, type Goal, type SlotOdds } from "./arcadePacks";
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

  it("spends gems on the pack with the most chance per gem, then the rest on the next", () => {
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
  it("ranks clubs by what their three best likely starters add, and needs two likely starters", () => {
    const list = [o("a", "lille", 60, 0.9), o("b", "lille", 50, null), o("c", "lille", 90, 0.2), o("d", "lens", 80, 0.9)];
    const picks = clubsToBuildAround(new Map([["G", list]]), [g], { b: { tier: null, playing: "STARTER", injured: false, back: null } }, 0, Infinity);
    expect(picks.map((p) => [p.club, p.value, p.likely])).toEqual([["lille", 104, 2]]);
    expect(picks[0]!.cards.map((c) => c.outlook.card.player)).toEqual(["a", "b", "c"]);
  });
});
