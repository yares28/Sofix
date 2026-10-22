import { describe, expect, it } from "vitest";
import { bonusLabel, chanceOf, gamesOf, keptCards, newerChances, parseArcade, parseGames, rewardLabel, usableArcade, type Arcade } from "./arcade";

const main = {
  cardSet: { currentSet: { slug: "glitch", name: "HyperGlitch", startDate: "2026-09-08T08:30:00Z", endDate: "2026-10-27T16:00:00Z", availableCompetitions: [{ slug: "laliga-es", displayName: "LALIGA EA Sports" }] } },
  currentUser: {
    slug: "owner",
    gems: [{ currency: "COMMON_GEM", amount: 40, cap: null }],
    essence: [
      { rarity: "common", cardShardsCount: 999, maxCardShardsCount: 1, cardSet: { slug: "old" } },
      { rarity: "common", cardShardsCount: 3200, maxCardShardsCount: 1, cardSet: { slug: "glitch" } },
    ],
    setBoard: {
      __typename: "CareerBoard", id: "b1", title: "Your board", endDate: null, restartable: true,
      myCurrentStep: { id: "s2", level: 2 },
      steps: [
        { __typename: "CareerStep", id: "s2", level: 2, target: 300, originalTarget: null, state: "PLAYABLE", title: "Step 2",
          engineConfiguration: { captain: 0.5, collection: true }, maxLineupsCount: 4, remainingLineupsCount: 3, lockedLineupsCount: 1, pendingLineupsCount: 0,
          rewardConfigs: [{ __typename: "InGameCurrencyRewardConfig", amount: 10, currency: "COMMON_GEM" }],
          cardPacks: [{ slug: "p1", title: "Silver", price: 10, effectivePrice: 10, currency: "COMMON_GEM", cardsCount: 3, canPurchase: true, competition: { slug: "laliga-es" } }] },
        { __typename: "CareerStep", id: "s1", level: 1, target: 260, state: "CLAIMED",
          rewardConfigs: [{ __typename: "CardShardRewardConfig", rarity: "common", quantity: 5000 }, { __typename: "SomethingNewRewardConfig" }] },
      ],
    },
  },
};
const lineups = { currentUser: { setBoard: { id: "b1", steps: [{ id: "s2", level: 2, myLineups: [
  { __typename: "TaskLineup", id: "l1", draft: false, aasmState: "live", score: 120.5, cancelledAt: null, forfeitable: true, hasLiveGames: true, updatable: false,
    taskAppearances: [{ id: "a", index: 0, captain: true, positions: ["Goalkeeper"], score: 40, locked: true, bonus: 0, anyCard: { slug: "c1" }, player: { slug: "p", displayName: "P" }, game: { id: "g", date: "2026-10-21T19:00:00Z" } }] },
] }] } } };
const page = (slugs: [string, string][], hasNextPage = false) => ({ currentUser: { cards: {
  nodes: slugs.map(([slug, set]) => ({ slug, pictureUrl: null, cardEditionName: null, anyPositions: ["Forward"], cardSet: { slug: set }, skinEdition: { bonus: 1.1, skinName: "Holo", variantName: null }, anyPlayer: { slug: `${slug}-p`, displayName: slug.toUpperCase() }, anyTeam: { name: "Club", pictureUrl: null, domesticLeague: { slug: "laliga-es", displayName: "LALIGA EA Sports" } } })),
  pageInfo: { hasNextPage, endCursor: hasNextPage ? "x" : null },
} } });

describe("arcade read", () => {
  it("keeps only the current set's commons and that set's essence", () => {
    const arcade = parseArcade(main, lineups, null, [page([["b", "glitch"], ["a", "old"]]), page([["c", "glitch"], ["b", "glitch"]])]);
    expect(arcade?.cards.map((c) => c.slug)).toEqual(["b", "c"]);
    expect(arcade?.otherSetCards).toBe(1);
    expect(arcade?.cardsCut).toBe(false);
    expect(arcade?.essence).toBe(3200);
    expect(arcade?.gems).toBe(40);
    expect(arcade?.cards[0]).toMatchObject({ bonus: 1.1, edition: "Holo", league: { slug: "laliga-es", name: "LALIGA EA Sports" } });
    expect(bonusLabel(1.1)).toBe("+10%");
    expect(bonusLabel(1.05)).toBe("+5%");
    expect(bonusLabel(1)).toBeNull();
    expect(bonusLabel(null)).toBeNull();
  });

  it("orders steps, keeps Sorare's lineup counts and puts each lineup on its step", () => {
    const arcade = parseArcade(main, lineups, null, []);
    expect(arcade?.board?.steps.map((s) => [s.number, s.level])).toEqual([[1, 1], [2, 2]]);
    expect(arcade?.board?.current).toBe(2); // the step whose id Sorare names as current, counted from 1
    const two = arcade?.board?.steps[1];
    expect(two?.lineups).toEqual({ max: 4, remaining: 3, locked: 1, pending: 0 });
    expect(two?.captain).toBe(0.5);
    expect(two?.entered[0]).toMatchObject({ id: "l1", live: true, forfeitable: true, updatable: false });
    expect(two?.entered[0]?.cards[0]).toMatchObject({ slug: "c1", captain: true, locked: true });
    expect(arcade?.board?.steps[0]?.lineups).toBeNull();
  });

  it("says a reward in Sorare's terms and never invents one it does not know", () => {
    expect(parseArcade(main, null, null, [])?.board?.steps[0]?.rewards).toEqual(["5,000 essence", "SomethingNew"]);
    expect(rewardLabel({ __typename: "MonetaryRewardConfig", amount: { eurCents: 10000 } })).toBe("€100");
    expect(rewardLabel({ __typename: "CardShardRewardConfig", rarity: "limited", quantity: 1000 })).toBe("1,000 Limited essence");
    expect(rewardLabel({ __typename: "InGameCurrencyRewardConfig", amount: 30, currency: "COMMON_GEM" })).toBe("30 gems");
  });

  it("reads a streak's progress and a picker's picks, each only for its own kind", () => {
    const missions = { currentUser: { taskGroup: { myTasks: [
      { __typename: "ThresholdsStreakTask", id: "t1", title: "LALIGA EA SPORTS Common", description: "Score 400+", progress: 2, target: 5, expired: false, rewardConfigs: [{ __typename: "CardShardRewardConfig", rarity: "common", quantity: 2000 }] },
      { __typename: "DecisivePlayerPickerTask", id: "t2", title: "Pick", maxAppearancesCount: 3, taskAppearances: [{}] },
      { __typename: "SomethingElse" },
    ] } } };
    const read = parseArcade(main, null, missions, [])?.missions;
    expect(read).toHaveLength(2);
    expect(read?.[0]).toMatchObject({ progress: 2, target: 5, picks: null, rewards: ["2,000 essence"] });
    expect(read?.[1]).toMatchObject({ picks: 1, maxPicks: 3 });
  });

  it("says when the card read stopped early, and refuses a signed-out answer", () => {
    expect(parseArcade(main, null, null, [page([["a", "glitch"]], true)])?.cardsCut).toBe(true);
    expect(parseArcade({ ...main, currentUser: null }, null, null, [])).toBeNull();
  });
});

describe("arcade games and start %", () => {
  const game = (id: string, date: string, home: string, away: string) => ({ game: { id, date, statusTyped: "scheduled", competition: { slug: "c", displayName: "C" }, homeTeam: { slug: home, name: home }, awayTeam: { slug: away, name: away } } });
  const page = (nodes: unknown[]) => ({ currentUser: { setBoard: { pickableGames: { nodes, pageInfo: { hasNextPage: false, endCursor: null } } } } });

  it("keeps each game once, by kick-off, and ties a card to its club's games only", () => {
    const games = parseGames([page([game("g2", "2026-10-24T19:00:00Z", "rma", "fcb"), game("g1", "2026-10-22T19:00:00Z", "lil", "rma")]), page([game("g2", "2026-10-24T19:00:00Z", "rma", "fcb")])]);
    expect(games?.map((g) => g.id)).toEqual(["g1", "g2"]);
    expect(gamesOf({ teamSlug: "rma" }, games ?? []).map((g) => g.id)).toEqual(["g1", "g2"]);
    expect(gamesOf({ teamSlug: "fcb" }, games ?? []).map((g) => g.id)).toEqual(["g2"]);
    expect(gamesOf({ teamSlug: null }, games ?? [])).toEqual([]);
  });

  it("says when Sorare gave no games instead of an empty week", () => {
    expect(parseGames([null, { errors: [] }])).toBeNull();
    expect(parseGames([page([])])).toEqual([]);
  });

  it("reads a start % per game and player, keeps 0%, and has none where Sorare showed none", () => {
    const chances = { g1: { courtois: [9000, 1] as [number, number], lunin: [0, 2] as [number, number] } };
    expect(chanceOf(chances, "g1", "courtois")).toEqual({ percent: 90, seenAt: 1 });
    expect(chanceOf(chances, "g1", "lunin")).toEqual({ percent: 0, seenAt: 2 });
    expect(chanceOf(chances, "g2", "courtois")).toBeNull();
    expect(chanceOf(null, "g1", "courtois")).toBeNull();
  });
});

describe("cards kept between visits", () => {
  const page = (total: number | undefined, slugs: string[]) => ({ currentUser: { cards: { totalCount: total, pageInfo: { hasNextPage: false, endCursor: null },
    nodes: slugs.map((slug) => ({ slug, anyPositions: ["Forward"], anyPlayer: { slug, displayName: slug } })) } } });
  const kept = { user: "yares", total: 3, first: ["a", "b", "c"], pages: ["p1", "p2"] };

  it("reuses the kept pages only when Sorare's count and first page are unchanged, for the same account", () => {
    expect(keptCards(kept, "yares", page(3, ["a", "b", "c"]))).toEqual(["p1", "p2"]);
    expect(keptCards(kept, "yares", page(4, ["d", "a", "b", "c"]))).toBeNull(); // a pack opened
    expect(keptCards(kept, "yares", page(3, ["a", "c", "b"]))).toBeNull();
    expect(keptCards(kept, "other", page(3, ["a", "b", "c"]))).toBeNull();
    expect(keptCards(kept, "yares", page(undefined, ["a", "b", "c"]))).toBeNull(); // an extension that does not send the count
    expect(keptCards(null, "yares", page(3, ["a", "b", "c"]))).toBeNull();
  });

  it("shows the last read board on the next visit until its set ends", () => {
    const arcade = { set: { end: "2026-10-27T16:00:00Z" } } as unknown as Arcade;
    const kept = { at: Date.parse("2026-10-21T20:00:00Z"), arcade, unread: [] };
    expect(usableArcade(kept, Date.parse("2026-10-22T09:00:00Z"))).toBe(kept);
    expect(usableArcade(kept, Date.parse("2026-10-28T09:00:00Z"))).toBeNull();
    expect(usableArcade(null)).toBeNull();
  });

  it("keeps the newer start % of each player, saved or just read", () => {
    const saved = { g1: { a: [9000, 200] as [number, number], b: [1000, 100] as [number, number] } };
    const read = { g1: { a: [5000, 150] as [number, number], b: [7000, 150] as [number, number] }, g2: { c: [8000, 150] as [number, number] } };
    expect(newerChances(saved, read)).toEqual({ g1: { a: [9000, 200], b: [7000, 150] }, g2: { c: [8000, 150] } });
  });
});
