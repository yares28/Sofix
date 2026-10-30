import { describe, expect, it } from "vitest";
import type { ArcadeGame } from "./arcade";
import type { Outlook } from "./arcadePlan";
import { clubsToBuildAround } from "./arcadeTeams";

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
