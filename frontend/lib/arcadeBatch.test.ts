import { describe, expect, it } from "vitest";
import type { ArcadeGame } from "./arcade";
import { batchesOf, teamsInBatch } from "./arcadeBatch";
import type { Outlook } from "./arcadePlan";

const now = Date.parse("2026-11-01T12:00:00Z");
const game = (id: string, minutes: number): ArcadeGame => ({ id, kickoff: new Date(now + minutes * 60_000).toISOString(), status: "scheduled", competition: { slug: "laliga-es", name: "LaLiga" }, home: { slug: "home", name: "Home", crest: null }, away: { slug: "away", name: "Away", crest: null } });
const squad = (g: ArcadeGame, n = 5): Outlook[] => Array.from({ length: n }, (_, i) => ({ card: { slug: `card-${i}`, player: `player-${i}`, name: `Player ${i}`, positions: [["Goalkeeper", "Defender", "Midfielder", "Forward", "Midfielder"][i % 5]!], team: "Home", teamSlug: "home", teamPicture: null, picture: null, league: null, edition: null, bonus: 1 }, game: g, score: 60 - i / 10, scoreSource: "sorare", start: 1, startSource: "sorare", past: [40, 60, 80], bonus: 0, club: 0 }));

describe("Arcade batches", () => {
  it("covers every listed future game, even without cards, using the chain's inclusive 75-minute boundary", () => {
    const games = [game("expired", -1), game("a", 5), game("b", 80), game("c", 81), game("no-cards", 200)];
    const batches = batchesOf(games.reverse(), now);
    expect(batches.map((b) => b.games.map((g) => g.id))).toEqual([["a", "b"], ["c"], ["no-cards"]]);
  });
  it("uses the first kickoff's Madrid day without splitting an existing batch at midnight", () => {
    const games = [game("a", 11 * 60 - 30), game("b", 11 * 60 + 30)];
    expect(batchesOf(games, now)).toMatchObject([{ day: "2026-11-01", games: [{ id: "a" }, { id: "b" }] }]);
  });
  it("builds up to four complete disjoint teams and preserves exact game/captain identities", () => {
    const g = game("a", 5);
    const list = squad(g, 25);
    const teams = teamsInBatch(list, 300, 0.5, 4);
    expect(teams).toHaveLength(4);
    expect(new Set(teams.flatMap((l) => l.picks.map((p) => p.outlook.card.player))).size).toBe(20);
    expect(teams.every((l) => l.picks.length === 5 && l.picks.filter((p) => p.captain).length === 1 && l.picks.every((p) => p.outlook.game === g))).toBe(true);
    expect(teamsInBatch(list, 300, 0.5, 0)).toHaveLength(1);
    expect(teamsInBatch(list, 300, 0.5, 99)).toHaveLength(4);
  });
  it("returns only complete teams, excludes held cards until this batch and does not fill missing scores with zero", () => {
    const g = game("a", 5);
    const list = squad(g);
    expect(teamsInBatch(list, 300, 0.5, 4)).toHaveLength(1);
    expect(teamsInBatch(list, 300, 0.5, 1, new Set(["card-0"]))).toEqual([]);
    expect(teamsInBatch(list.map((o) => o.card.slug === "card-0" ? { ...o, score: null } : o), 300, 0.5, 1)).toEqual([]);
    expect(teamsInBatch(list.map((o) => o.card.slug === "card-0" ? { ...o, score: 0, start: null } : o), 300, 0.5, 1)).toHaveLength(1);
  });
  it("never reuses another edition of a player and retains a known zero start chance", () => {
    const list = squad(game("a", 5));
    const zero = { ...list[0]!, start: 0 };
    const copies = list.map(o => ({ ...o, card: { ...o.card, slug: `${o.card.slug}-copy` } }));
    const teams = teamsInBatch([zero, ...list.slice(1), ...copies.slice(1)], 300, 0.5, 4);
    expect(teams).toHaveLength(1);
    expect(teams[0]!.picks.find(p => p.slot === "GK")!.outlook.start).toBe(0);
  });
});
