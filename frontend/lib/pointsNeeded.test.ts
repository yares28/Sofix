import { describe, expect, it } from "vitest";
import { needBadge, pointsNeeded, proMultiplier, roundUp, type NeedCard } from "./pointsNeeded";

const plain = (multiplier: number | null = 1, extra: Partial<NeedCard> = {}): NeedCard => ({ multiplier, state: "to play", raw: null, ...extra });
const five = (...cards: NeedCard[]) => [...cards, ...Array.from({ length: 5 - cards.length }, () => plain())];
const need = (r: ReturnType<typeof pointsNeeded>, i: number) => {
  const c = r.cards[i]!;
  if (c.kind !== "need") throw new Error(`card ${i} is ${c.kind}`);
  return c;
};

describe("points needed before the games", () => {
  it("five plain cards need 80 each for 400", () => {
    const r = pointsNeeded(400, five());
    expect(r.state).toBe("open");
    r.cards.forEach((_, i) => expect(need(r, i).raw).toBe(80));
  });

  it("the owner's examples: +10% card, +50% captain, +10% card captain", () => {
    const r = pointsNeeded(400, five(plain(1.1), plain(1.5), plain(1.6)));
    expect(roundUp(need(r, 0).raw)).toBe(72.8);
    expect(roundUp(need(r, 1).raw)).toBe(53.4);
    expect(roundUp(need(r, 2).raw)).toBe(50);
    expect(need(r, 3).raw).toBe(80); // the others keep their own requirement
    expect(need(r, 0).share).toBe(80);
  });

  it("bonuses are added, never multiplied, and reward boosts never count", () => {
    expect(proMultiplier({ mult: 1.1, captain: true, captainBonus: 0.5 })).toBeCloseTo(1.6);
    // Pro's Rare Reward Bonus is a prize multiplier: proMultiplier has no input for it, and the card's mult never holds it.
    expect(proMultiplier({ mult: 1, captain: false, captainBonus: 0.5 })).toBe(1);
  });

  it("moving the captain moves the 50%", () => {
    const before = pointsNeeded(400, five(plain(1.5), plain(1)));
    const after = pointsNeeded(400, five(plain(1), plain(1.5)));
    expect(roundUp(need(before, 0).raw)).toBe(53.4);
    expect(need(after, 0).raw).toBe(80);
    expect(roundUp(need(after, 1).raw)).toBe(53.4);
  });

});

describe("points needed during the games", () => {
  it("finished cards keep their contribution; the rest share what is left", () => {
    // 400 target; a finished 60 at ×1.5 gives 90, so 310 is left for four cards: 77.5 each.
    const r = pointsNeeded(400, five(plain(1.5, { state: "finished", raw: 60 })));
    expect(r.current).toBe(90);
    expect(r.remaining).toBe(310);
    expect(r.cards[0]).toEqual({ kind: "settled", contribution: 90 });
    expect(need(r, 1).raw).toBe(77.5);
  });

  it("a live card shows the extra points needed from now, its score counted once", () => {
    // live 20 raw ×1 counts 20; 380 left over five cards: 76 more each, the live card included.
    const r = pointsNeeded(400, five(plain(1, { state: "live", raw: 20 })));
    expect(r.current).toBe(20);
    expect(need(r, 0)).toMatchObject({ raw: 76, live: true });
    expect(need(r, 1)).toMatchObject({ raw: 76, live: false });
  });

  it("a live score that falls raises the requirement", () => {
    const up = pointsNeeded(400, five(plain(1, { state: "live", raw: 30 })));
    const down = pointsNeeded(400, five(plain(1, { state: "live", raw: 22 })));
    expect(need(down, 1).raw).toBeGreaterThan(need(up, 1).raw);
  });

  it("a confirmed DNP is a finished zero and leaves the share-out", () => {
    const r = pointsNeeded(400, five(plain(1, { state: "finished", raw: 0 })));
    expect(r.cards[0]).toEqual({ kind: "settled", contribution: 0 });
    expect(need(r, 1).raw).toBe(100);
  });

  it("missing versus zero: an unknown live score makes the lineup unknown, a 0 does not", () => {
    const zero = pointsNeeded(400, five(plain(1, { state: "live", raw: 0 })));
    expect(zero.state).toBe("open");
    const missing = pointsNeeded(400, five(plain(1, { state: "live", raw: null })));
    expect(missing.state).toBe("unknown");
    expect(missing.cards.every((c) => c.kind === "unknown")).toBe(true);
  });

  it("an unknown multiplier stays unknown on that card only, before the games", () => {
    const r = pointsNeeded(400, five(plain(null, { unknown: "Club bonus not read" })));
    expect(r.cards[0]).toEqual({ kind: "unknown", reason: "Club bonus not read" });
    expect(need(r, 1).raw).toBe(80);
  });

  it("the target reached on provisional scores is reached, not cleared", () => {
    const r = pointsNeeded(300, five(...Array.from({ length: 5 }, () => plain(1, { state: "live", raw: 61 }))));
    expect(r.state).toBe("reached");
    expect(needBadge(r, 0, 300).detail).toMatch(/provisional/i);
  });
});

describe("the 100-point ceiling", () => {
  it("a card that cannot take its share takes its maximum and the others share the rest", () => {
    // 510 target, one live card at 95 raw: 415 left. He has 5 of room, the four plain cards 400: 405 < 415, out of reach.
    const r = pointsNeeded(510, five(plain(1, { state: "live", raw: 95 })));
    expect(r.state).toBe("unreachable");
    // With bonuses the room is there: four cards at ×1.2 give up to 120 each. He takes his 5, they share 410.
    const ok = pointsNeeded(510, five(plain(1, { state: "live", raw: 95 }), plain(1.2), plain(1.2), plain(1.2), plain(1.2)));
    expect(ok.state).toBe("open");
    expect(need(ok, 0).raw).toBeCloseTo(5);
    expect(need(ok, 1).raw).toBeCloseTo(410 / 4 / 1.2);
  });

  it("redistributes to cards with room", () => {
    // 460 left: card 0 has 10 raw of room, the four others share 450 → 112.5 bonus-adjusted each at ×1.5 = 75 raw.
    const r = pointsNeeded(550, [plain(1, { state: "live", raw: 90 }), plain(1.5), plain(1.5), plain(1.5), plain(1.5)]);
    expect(r.remaining).toBe(460);
    expect(need(r, 0).raw).toBe(10);
    expect(need(r, 1).raw).toBeCloseTo(75);
  });

  it("unreachable when every card at 100 cannot cover what is left", () => {
    const r = pointsNeeded(600, five(plain(1, { state: "finished", raw: 10 })));
    expect(r.state).toBe("unreachable");
    expect(needBadge(r, 1, 600).label).toBe("Unreachable");
  });
});

describe("unknown inputs and incomplete lineups", () => {
  it("no target is unknown", () => {
    const r = pointsNeeded(null, five());
    expect(r.state).toBe("unknown");
    expect(needBadge(r, 0, null)).toMatchObject({ label: "—" });
  });

  it("four cards are not a complete lineup", () => {
    const r = pointsNeeded(400, [plain(), plain(), plain(), plain()]);
    expect(r.state).toBe("incomplete");
    expect(r.cards.every((c) => c.kind === "unknown")).toBe(true);
  });
});

describe("the badge's words", () => {
  it("rounds up, drops .0 and explains", () => {
    const r = pointsNeeded(400, five(plain(1.1)));
    const b = needBadge(r, 0, 400);
    expect(b.label).toBe("72.8");
    expect(b.detail).toBe("Needs 72.8 raw points to contribute 80 toward the 400-point target. Score bonus: +10%.");
    expect(needBadge(pointsNeeded(400, five(plain(1.6))), 0, 400).label).toBe("50");
  });

  it("says additional raw points for a live card", () => {
    const r = pointsNeeded(400, five(plain(1, { state: "live", raw: 20 })));
    expect(needBadge(r, 0, 400).detail).toMatch(/^Needs 76 additional raw points/);
  });

  it("a finished card is settled with its contribution in the detail", () => {
    const r = pointsNeeded(400, five(plain(1.5, { state: "finished", raw: 60 })));
    expect(needBadge(r, 0, 400)).toMatchObject({ label: "✓", tone: "settled" });
    expect(needBadge(r, 0, 400).detail).toMatch(/contributed 90/);
  });
});

describe("a week's scores as card states", () => {
  it("absent is to play, unfinished is live, finished without playing is a DNP zero", async () => {
    const { scoreState } = await import("./pointsNeeded");
    expect(scoreState(undefined)).toEqual({ state: "to play", raw: null });
    expect(scoreState({ score: 34, played: true, complete: false })).toEqual({ state: "live", raw: 34 });
    expect(scoreState({ score: 61, played: true, complete: true })).toEqual({ state: "finished", raw: 61 });
    expect(scoreState({ score: 0, played: false, complete: true })).toEqual({ state: "finished", raw: 0 });
  });

  it("a Pro captain without the board's captain bonus is unknown, the others still count", async () => {
    const { proNeeds } = await import("./pointsNeeded");
    const cards = [{ mult: 1.1, captain: true }, ...Array.from({ length: 4 }, () => ({ mult: 1, captain: false }))];
    const unknown = proNeeds(400, undefined, cards, () => ({ state: "to play", raw: null }));
    expect(unknown[0]!.label).toBe("—");
    expect(unknown[1]!.label).toBe("80");
    expect(proNeeds(400, 0.5, cards, () => ({ state: "to play", raw: null }))[0]!.label).toBe("50");
  });
});

describe("the owner's example (2 Nov 2026)", () => {
  it("a lineup at 260 with one player left for 360: he needs 100, less with his bonus or the captaincy", () => {
    const done = [65, 65, 65, 65].map((raw) => ({ multiplier: 1, state: "finished" as const, raw }));
    expect(needBadge(pointsNeeded(360, [...done, { multiplier: 1, state: "to play", raw: null }]), 4, 360).label).toBe("100");
    expect(needBadge(pointsNeeded(360, [...done, { multiplier: 1.5, state: "to play", raw: null }]), 4, 360, true).label).toBe("66.7");
    expect(needBadge(pointsNeeded(360, [...done, { multiplier: 1.05, state: "to play", raw: null }]), 4, 360).label).toBe("95.3");
    // The four who have played show what they brought, not a number to reach.
    expect(needBadge(pointsNeeded(360, [...done, { multiplier: 1, state: "to play", raw: null }]), 0, 360).label).toBe("✓");
  });
});
