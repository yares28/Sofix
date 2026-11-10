import { describe, expect, it } from "vitest";
import type { ArcadeGame } from "./arcade";
import type { Outlook } from "./arcadePlan";
import { clubsToBuildAround, firstDays, type ClubPick } from "./arcadeTeams";
import { xdTitle } from "./arcadePlan";

const game: ArcadeGame = { id: "barcelona-game", kickoff: "2026-10-31T17:00:00Z", status: "scheduled", competition: { slug: "laliga", name: "LaLiga" }, home: { slug: "barcelona", name: "Barcelona", crest: null }, away: { slug: "other", name: "Other", crest: null } };
const raphinha: Outlook = { card: { slug: "raphinha-card", player: "raphinha", name: "Raphinha", team: "Barcelona", teamSlug: "barcelona", teamPicture: null, league: null, positions: ["Forward"], picture: null, edition: null, bonus: 1 }, game, score: 75, scoreSource: "sorare", start: 0.9, startSource: "sorare", past: [60, 70, 80], bonus: 0, club: 0 };
const status = { raphinha: { tier: "GOAT", playing: "STARTER", injured: false, back: null } };
const picks = (list: Outlook[], from = 0, to = Infinity, injured = false) => clubsToBuildAround(new Map([[game.id, list]]), [game], { raphinha: { ...status.raphinha, injured } }, from, to);

describe("clubs with one owned likely starter", () => {
  it("includes Barcelona with Raphinha alone, counting his best edition once", () => {
    const result = picks([raphinha, { ...raphinha, card: { ...raphinha.card, slug: "holo" }, bonus: 0.05 }]);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ club: "barcelona", likely: 1, value: 75 * 0.9 * 1.05 });
    expect(result[0]?.cards).toHaveLength(1);
  });
  it("keeps source fallback for missing chances but excludes known zero, injured and out-of-horizon players", () => {
    expect(picks([{ ...raphinha, start: null, startSource: null }])).toHaveLength(1);
    expect(picks([{ ...raphinha, start: 0 }])).toEqual([]);
    expect(picks([raphinha], 0, Infinity, true)).toEqual([]);
    expect(picks([raphinha], Date.parse(game.kickoff) + 1)).toEqual([]);
    expect(picks([raphinha], 0, Date.parse(game.kickoff) - 1)).toEqual([]);
  });
});

describe("the days Teams to build around shows", () => {
  // 9 Nov 2026: it looked four days ahead, so an international break left it empty and it vanished.
  const on = (day: string) => ({ day }) as ClubPick;
  it("is the next days that have games, however far, four at most", () => {
    const list = ["2026-11-20", "2026-11-12", "2026-11-21", "2026-11-28", "2026-11-22", "2026-11-12"].map(on);
    expect(firstDays(list, 4).map((p) => p.day)).toEqual(["2026-11-20", "2026-11-12", "2026-11-21", "2026-11-22", "2026-11-12"]);
    expect(firstDays([], 4)).toEqual([]);
  });
});

describe("a card's xD when Sofix has none for the game", () => {
  it("stays \"xD —\" and says on hover where the card's number comes from", () => {
    expect(xdTitle({ ...raphinha, xd: null, scoreSource: "sorare" })).toBe("No Sofix xD for this game: its number is Sorare's projection");
    expect(xdTitle({ ...raphinha, xd: null, scoreSource: "form" })).toBe("No Sofix xD or Sorare projection for this game yet: its number is his recent form");
    expect(xdTitle({ ...raphinha, xd: 0.4, scoreSource: "sofix" })).toBeNull();
    expect(xdTitle(undefined)).toBeNull();
  });
});
