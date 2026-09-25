import { describe, expect, it } from "vitest";
import {
  collectionSummary,
  duplicateCounts,
  gain,
  improvers,
  ownedPlayers,
  priceLabel,
  searchMarket,
  shelves,
  squadBar,
  stackCounts,
  stackKey,
  verdict,
} from "./cards";
import type { CollectionCard, MarketPlayer } from "./play";

const card = (over: Partial<CollectionCard> = {}): CollectionCard => ({
  slug: "player-2026-limited-1",
  player: "player",
  name: "Player",
  pos: "MID",
  rarity: "limited",
  inSeason: true,
  level: 0,
  average: 50,
  club: "Celta de Vigo",
  pic: "https://assets.sorare.com/card/x/picture.png",
  ...over,
});

const priced = (over: Partial<MarketPlayer> = {}): MarketPlayer => ({
  slug: "someone",
  name: "Someone",
  pos: "FWD",
  club: "Barcelona",
  crest: null,
  average: 60,
  projection: 55,
  eur: 42.5,
  pic: "https://assets.sorare.com/card/y/picture.png",
  ...over,
});

describe("collectionSummary", () => {
  const collection = [
    card({ slug: "a1", player: "a", pos: "GK", rarity: "limited", average: 60, inSeason: true, club: "X" }),
    card({ slug: "b1", player: "b", pos: "DEF", rarity: "rare", average: 40, inSeason: false, club: "Y" }),
    card({ slug: "b2", player: "b", pos: "DEF", rarity: "limited", average: 50, inSeason: true, club: "Y" }),
    card({ slug: "c1", player: "c", pos: "DEF", rarity: "limited", average: 30, inSeason: true, club: "Z" }),
  ];

  it("counts cards, distinct players and duplicates", () => {
    const summary = collectionSummary(collection);
    expect(summary.cards).toBe(4);
    expect(summary.players).toBe(3);
    expect(summary.duplicates).toBe(1);
    expect(summary.clubs).toBe(3);
  });

  it("splits rarity, in-season and the average", () => {
    const summary = collectionSummary(collection);
    expect(summary.rare).toBe(1);
    expect(summary.limited).toBe(3);
    expect(summary.inSeason).toBe(3);
    expect(summary.average).toBe(45);
  });

  it("finds the position shape and its busiest slot", () => {
    const summary = collectionSummary(collection);
    expect(summary.byPosition).toEqual([
      { pos: "GK", count: 1 },
      { pos: "DEF", count: 3 },
      { pos: "MID", count: 0 },
      { pos: "FWD", count: 0 },
    ]);
    expect(summary.maxPosition).toBe(3);
  });

  it("is safe on an empty collection", () => {
    expect(collectionSummary([]).average).toBe(0);
    expect(collectionSummary([]).maxPosition).toBe(1);
  });
});

describe("duplicateCounts", () => {
  it("counts cards per player", () => {
    const counts = duplicateCounts([card({ player: "a" }), card({ player: "a" }), card({ player: "b" })]);
    expect(counts.get("a")).toBe(2);
    expect(counts.get("b")).toBe(1);
  });
});

describe("stackCounts", () => {
  it("counts identical cards but treats a different rarity or season as its own card", () => {
    const collection = [
      card({ slug: "m-in", player: "mandi", rarity: "limited", inSeason: true }),
      card({ slug: "m-out", player: "mandi", rarity: "limited", inSeason: false }),
      card({ slug: "b1", player: "bartra", rarity: "rare", inSeason: false }),
      card({ slug: "b2", player: "bartra", rarity: "rare", inSeason: false }),
      card({ slug: "i1", player: "isco", rarity: "limited", inSeason: false }),
      card({ slug: "i2", player: "isco", rarity: "limited", inSeason: false }),
      card({ slug: "i3", player: "isco", rarity: "limited", inSeason: false }),
    ];
    const counts = stackCounts(collection);
    // the two Mandis differ by season, so each stands alone
    expect(counts.get(stackKey(collection[0]!))).toBe(1);
    expect(counts.get(stackKey(collection[1]!))).toBe(1);
    // two identical rare Bartras stack to 2
    expect(counts.get(stackKey(collection[2]!))).toBe(2);
    // three identical Iscos stack to 3
    expect(counts.get(stackKey(collection[4]!))).toBe(3);
  });
});

describe("shelves", () => {
  const collection = [
    card({ slug: "gk", player: "gk", pos: "GK", average: 55 }),
    card({ slug: "d-hi", player: "dh", pos: "DEF", average: 60 }),
    card({ slug: "d-lo", player: "dl", pos: "DEF", average: 40, rarity: "rare" }),
  ];

  it("groups by position, sorts by average and drops empty shelves", () => {
    const grouped = shelves(collection, { pos: "all", rarity: "all" });
    expect(grouped.map((shelf) => shelf.pos)).toEqual(["GK", "DEF"]);
    expect(grouped[1]!.cards.map((c) => c.slug)).toEqual(["d-hi", "d-lo"]);
  });

  it("filters by position", () => {
    const grouped = shelves(collection, { pos: "DEF", rarity: "all" });
    expect(grouped).toHaveLength(1);
    expect(grouped[0]!.cards).toHaveLength(2);
  });

  it("filters by rarity", () => {
    const grouped = shelves(collection, { pos: "all", rarity: "rare" });
    expect(grouped.map((shelf) => shelf.pos)).toEqual(["DEF"]);
    expect(grouped[0]!.cards.map((c) => c.slug)).toEqual(["d-lo"]);
  });

  it("filters by season", () => {
    const seasoned = [
      card({ slug: "in1", player: "in1", pos: "MID", inSeason: true }),
      card({ slug: "out1", player: "out1", pos: "MID", inSeason: false }),
    ];
    expect(shelves(seasoned, { pos: "all", rarity: "all", season: "in" })[0]!.cards.map((c) => c.slug)).toEqual([
      "in1",
    ]);
    expect(shelves(seasoned, { pos: "all", rarity: "all", season: "out" })[0]!.cards.map((c) => c.slug)).toEqual(
      ["out1"],
    );
    expect(shelves(seasoned, { pos: "all", rarity: "all", season: "all" })[0]!.cards).toHaveLength(2);
  });
});

describe("squadBar", () => {
  it("is the fifth-best card in a position, or the weakest when fewer than five", () => {
    const collection = [90, 80, 70, 60, 50, 40].map((average, i) =>
      card({ slug: `d${i}`, player: `d${i}`, pos: "DEF", average }),
    );
    collection.push(card({ slug: "fw", player: "fw", pos: "FWD", average: 33 }));
    const bar = squadBar(collection);
    expect(bar.DEF).toBe(50); // fifth-best of the six defenders
    expect(bar.FWD).toBe(33); // only one forward
    expect(bar.GK).toBe(0); // none held
  });
});

describe("gain, verdict and improvers", () => {
  const collection = [
    card({ slug: "f1", player: "f1", pos: "FWD", average: 55 }),
    card({ slug: "f2", player: "f2", pos: "FWD", average: 51 }),
  ];
  const bar = squadBar(collection); // FWD bar = 51 (weakest of two)
  const owned = ownedPlayers(collection);

  it("measures the upgrade over the bar", () => {
    expect(gain(priced({ pos: "FWD", average: 60 }), bar)).toBe(9);
    expect(gain(priced({ pos: "FWD", average: 45 }), bar)).toBe(-6);
  });

  it("marks an upgrade, a flat/worse card and an owned one", () => {
    expect(verdict(priced({ slug: "new", pos: "FWD", average: 60 }), bar, owned)).toEqual({
      kind: "up",
      value: "+9",
      note: "on your FWD",
    });
    expect(verdict(priced({ slug: "meh", pos: "FWD", average: 45 }), bar, owned).kind).toBe("flat");
    expect(verdict(priced({ slug: "f1", pos: "FWD", average: 99 }), bar, owned).kind).toBe("own");
  });

  it("counts only unowned players above the bar as improvers", () => {
    const market = [
      priced({ slug: "up", pos: "FWD", average: 70 }),
      priced({ slug: "f1", pos: "FWD", average: 99 }), // owned, ignored
      priced({ slug: "low", pos: "FWD", average: 40 }), // below bar
    ];
    expect(improvers(market, bar, owned).map((p) => p.slug)).toEqual(["up"]);
  });
});

describe("searchMarket", () => {
  const collection = [card({ slug: "own1", player: "kept", pos: "MID", average: 50 })];
  const bar = squadBar(collection);
  const owned = ownedPlayers(collection);
  const market = [
    priced({ slug: "kept", name: "Kept", pos: "MID", average: 80 }), // owned
    priced({ slug: "big", name: "Big Upgrade", pos: "MID", average: 70 }),
    priced({ slug: "small", name: "Small", pos: "MID", average: 55 }),
    priced({ slug: "fwd", name: "Striker", pos: "FWD", club: "Villarreal", average: 90 }),
  ];

  it("sorts improvers first and owned last", () => {
    const rows = searchMarket(market, bar, owned, { pos: "all", query: "" });
    expect(rows.map((p) => p.slug)).toEqual(["fwd", "big", "small", "kept"]);
  });

  it("filters by position", () => {
    const rows = searchMarket(market, bar, owned, { pos: "FWD", query: "" });
    expect(rows.map((p) => p.slug)).toEqual(["fwd"]);
  });

  it("matches a name or a club, case-insensitively", () => {
    expect(searchMarket(market, bar, owned, { pos: "all", query: "big" }).map((p) => p.slug)).toEqual(["big"]);
    expect(searchMarket(market, bar, owned, { pos: "all", query: "villarreal" }).map((p) => p.slug)).toEqual([
      "fwd",
    ]);
  });
});

describe("priceLabel", () => {
  it("shows cents below 100 and whole euros with a separator above", () => {
    expect(priceLabel(43.97)).toBe("\u20ac43.97");
    expect(priceLabel(214.01)).toBe("\u20ac214");
    expect(priceLabel(1360)).toBe("\u20ac1,360");
  });
});
