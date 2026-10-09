import { expect, it } from "vitest";
import { cardReturns, seasonWeeks, seasonSummary, type SavedWeek } from "./myWeeks";

const week = (slug: string, start = "2026-09-01T00:00:00Z"): SavedWeek => ({ slug, number: 1, start, end: start, savedAt: start,
  lineups: [{ id: "l", name: null, competition: "LaLiga", board: "b", draft: false, confirmable: false,
    cards: [{ slug: "card", player: "player", name: "Player", rarity: "limited", picture: null, score: 70, captain: true }],
    result: { score: 300, rank: 5, essence: 250, cash: 2.5, card: false } }] });
it("counts each card's participating lineups without pretending their reward was earned by one card alone", () => {
  const first = week("a");
  first.lineups[0]!.cards.push(first.lineups[0]!.cards[0]!);
  expect(cardReturns([first, week("b")]).card).toEqual({ lineups: 2, weeks: 2, essence: 500, cash: 5 });
});
it("keeps the season separate from older stored weeks", () => {
  expect(seasonWeeks([week("old", "2025-09-01T00:00:00Z"), week("now")], new Date("2026-10-09T00:00:00Z")).map((w) => w.slug)).toEqual(["now"]);
});
it("counts entered GWs, retains unrewarded participation and hides zero-reward rows", () => {
  const empty = { ...week("empty"), lineups: [] };
  const zero = week("zero"); zero.lineups[0]!.result = { score: 50, rank: 200, essence: 0, cash: 0, card: false };
  const draft = week("draft"); draft.lineups[0]!.draft = true;
  expect(seasonSummary([week("won"), zero, empty, draft])).toMatchObject({ played: 2, essence: 250, cash: 2.5 });
  expect(seasonSummary([week("won"), zero, empty, draft]).rewarded.map((w) => w.slug)).toEqual(["won"]);
});
