import { createRequire } from "node:module";
import { expect, it } from "vitest";
import { needBadge, pointsNeeded, type NeedCard } from "./pointsNeeded";

// The overlay on sorare.com draws the same pill from extension/core.js: both must say the same thing for the same lineup.
const core = createRequire(import.meta.url)("../../extension/core.js") as { pointsNeeded: typeof pointsNeeded; needBadge: typeof needBadge };
const plain = (multiplier: number | null = 1, extra: Partial<NeedCard> = {}): NeedCard => ({ multiplier, state: "to play", raw: null, ...extra });
const cases: [string, number | null, NeedCard[]][] = [
  ["the owner's examples", 400, [plain(1.1), plain(1.5), plain(1.6), plain(), plain()]],
  ["live and finished", 400, [plain(1.5, { state: "finished", raw: 60 }), plain(1, { state: "live", raw: 20 }), plain(), plain(1.05), plain()]],
  ["the ceiling", 550, [plain(1, { state: "live", raw: 90 }), plain(1.5), plain(1.5), plain(1.5), plain(1.5)]],
  ["unreachable", 600, [plain(1, { state: "finished", raw: 10 }), plain(), plain(), plain(), plain()]],
  ["reached", 300, Array.from({ length: 5 }, () => plain(1, { state: "live", raw: 61 }))],
  ["unknown bonus", 400, [plain(null, { unknown: "club bonus not read" }), plain(), plain(), plain(), plain()]],
  ["missing score", 400, [plain(1, { state: "live", raw: null }), plain(), plain(), plain(), plain()]],
  ["four cards", 400, [plain(), plain(), plain(), plain()]],
  ["no target", null, [plain(), plain(), plain(), plain(), plain()]],
];
it.each(cases)("the overlay's copy agrees with Sofix's: %s", (_name, target, cards) => {
  const mine = pointsNeeded(target, cards), theirs = core.pointsNeeded(target, cards);
  expect(theirs).toEqual(mine);
  cards.forEach((_, i) => expect(core.needBadge(theirs, i, target, i === 1)).toEqual(needBadge(mine, i, target, i === 1)));
});
