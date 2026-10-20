import { describe, expect, it } from "vitest";
import type { CollectionCard } from "./play";
import { prices, signedEuro, sortPriced } from "./prices";

const card = (slug: string, paid: number | null | undefined, value: number | null | undefined): CollectionCard =>
  ({ slug, player: slug, name: slug, pos: "MID", rarity: "limited", inSeason: true, level: 0, average: 50, club: null, pic: "", paid, value }) as CollectionCard;

describe("prices", () => {
  it("counts profit only on bought cards, keeps crafted ones apart and never invents a value", () => {
    const p = prices([card("up", 10, 16.44), card("down", 19.09, 12.77), card("crafted", null, 5.57), card("unknown", 3, null), card("old", undefined, undefined)]);
    expect(p.bought.map((c) => c.slug)).toEqual(["up", "down"]);
    expect(p.paid).toBeCloseTo(29.09);
    expect(p.worth).toBeCloseTo(29.21);
    expect(p.profit).toBeCloseTo(0.12);
    expect([p.up, p.down, p.unvalued]).toEqual([1, 1, 2]);
    expect(p.free.map((c) => c.slug)).toEqual(["crafted"]);
    expect(sortPriced(p.bought, "loss")[0]!.slug).toBe("down");
    expect(sortPriced(p.bought, "gain")[0]!.ratio).toBeCloseTo(0.644);
  });
  it("signs euros with a real minus", () => {
    expect([signedEuro(6.4), signedEuro(-3.1), signedEuro(0.001)]).toEqual(["+€6.40", "−€3.10", "€0.00"]);
  });
});
