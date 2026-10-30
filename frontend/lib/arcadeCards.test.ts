import * as React from "react";
import { createRequire } from "node:module";
import { afterAll, describe, expect, it, vi } from "vitest";
import ArcadeCards from "../components/arcade/ArcadeCards";
import { FdrContext } from "../components/arcade/Fdr";
import type { ArcadeCard, ArcadeGame } from "./arcade";
import { dayLabel, matchesPick, passesCut, tierChoice, type CardFilters, type CardPick } from "./arcadeCards";
import type { Outlook } from "./arcadePlan";

const { renderToStaticMarkup } = createRequire(import.meta.url)("react-dom/server") as { renderToStaticMarkup(node: React.ReactNode): string };
vi.stubGlobal("React", React);
afterAll(() => vi.unstubAllGlobals());
const card: ArcadeCard = { slug: "card", player: "player", name: "A player", team: "Club", teamSlug: "club", teamPicture: null, league: null, positions: ["Forward"], picture: null, edition: "Holo", bonus: 1.1 };
const game: ArcadeGame = { id: "game", kickoff: "2026-10-25T12:00:00Z", status: "scheduled", competition: { slug: "laliga-es", name: "LaLiga" }, home: { slug: "club", name: "Club", crest: null }, away: { slug: "away", name: "Away", crest: null } };
const outlook: Outlook = { card, game, score: 60, decisive: .65, xd: .02, scoreSource: "sofix", start: 0, startSource: "futbolfantasy", startUrl: "https://www.futbolfantasy.com/partidos/22493", past: [], bonus: .1, club: 0 };
const side = { code: "CLB", name: "Club", difficulty: 0, bucket: 1 as const, label: "Very favourite", cleanSheet: null, xgFor: null, xgAgainst: null };
const draw = (o: Outlook = outlook) => renderToStaticMarkup(React.createElement(FdrContext.Provider, { value: new Map([[game.id, { league: "PD" as const, kickoff: game.kickoff, home: side, away: { ...side, code: "AWY" } }]]) }, React.createElement(ArcadeCards, {
  cards: [card], games: [game], outlooks: new Map([[game.id, [o]]]),
  status: { player: { tier: "GOAT", playing: "STARTER", injured: false, back: null } },
  form: { player: { l5: 62, l10: 55, l40: null } },
})));

it("renders published xD as a decimal without recomputing it, while xScore retains the existing formula", () => {
  const zero = draw();
  const full = draw({ ...outlook, start: 1 });
  expect(zero).toContain('class="arc-card-xd"');
  expect(zero).toContain('>xD 0.02</span>');
  expect(full).toContain('>xD 0.02</span>');
  expect(zero).not.toContain('<small>xScore</small>');
  expect(zero).toContain('aria-label="xScore 0"');
  expect(full).toContain('aria-label="xScore 66"');
  expect(zero).toContain('background:#c0433f;color:#ffffff');
  expect(full).toContain('background:#46c05a;color:#0c2f16');
  expect(zero).toContain('<small>FDR</small><b>0</b>');
});

it("shows genuine zero separately from missing evidence and keeps source identity in accessible details", () => {
  const zero = draw({ ...outlook, xd: 0 });
  const missing = draw({ ...outlook, xd: null, start: null, score: null, scoreSource: null });
  expect(zero).toContain('>xD 0.00</span>');
  expect(zero).toContain('Futbol Fantasy start chance');
  expect(zero).toContain('href="https://www.futbolfantasy.com/partidos/22493"');
  expect(missing).toContain('>xD —</span>');
  expect(missing).toContain('aria-label="Start chance —"');
  expect(missing).toContain('aria-label="xScore unavailable"');
});

it("offers tier, form, the next game's day and xScore beside the existing menus", () => {
  const html = draw();
  for (const label of ["Tier", "L5", "L10", "L40", "Day", "xScore"]) expect(html).toContain(`aria-label="${label}"`);
  for (const tier of ["Icon", "Star+", "Star", "Impact", "Roster", "Reserve"]) expect(html).toContain(`>${tier}</option>`);
  expect(html).toContain(">L5 ≥40</option>");
  expect(html).toContain(">L5 ≥60</option>");
  expect(html).toContain(">L5 unknown</option>");
  expect(html).toContain(">L40 ≥50</option>");
  expect(html).toContain(">No game</option>");
  expect(html).toContain(">xScore ≥40</option>");
  expect(html).toContain(">xScore unknown</option>");
});

const open: CardFilters = { tier: "", l5: "", l10: "", l40: "", day: "", score: "" };
const pick = (over: Partial<CardPick> = {}): CardPick => ({
  tier: "impact", l5: 62, l10: 55, l40: 41, day: "2026-10-31", score: 64, ...over,
});

describe("tier menu", () => {
  it("names Sorare's tiers, with Star+ on its own and any other plus on the tier it sits above", () => {
    expect(tierChoice("GOAT")).toBe("icon");
    expect(tierChoice("STAR_PLUS")).toBe("star+");
    expect(tierChoice("STAR")).toBe("star");
    expect(tierChoice("IMPACT")).toBe("impact");
    expect(tierChoice("IMPACT_PLUS")).toBe("impact");
    expect(tierChoice("ROSTER")).toBe("roster");
    expect(tierChoice("DNP")).toBe("reserve");
    expect(tierChoice(null)).toBeNull();
    expect(tierChoice("WHATEVER")).toBeNull();
  });
});

describe("a score cut", () => {
  it("keeps a rounded number at or above the cut, and treats a missing number as unknown rather than zero", () => {
    expect(passesCut(39.6, "40")).toBe(true);
    expect(passesCut(39.4, "40")).toBe(false);
    expect(passesCut(60, "60")).toBe(true);
    expect(passesCut(0, "40")).toBe(false);
    expect(passesCut(0, "unknown")).toBe(false);
    expect(passesCut(null, "unknown")).toBe(true);
    expect(passesCut(null, "40")).toBe(false);
    expect(passesCut(10, "")).toBe(true);
  });
});

describe("the day label", () => {
  it("is the Madrid weekday and date", () => {
    expect(dayLabel("2026-10-31")).toBe("Sat 31 Oct");
  });
});

describe("the six filters together", () => {
  it("keeps a card only when every chosen menu matches, and an unread board is not 'no game'", () => {
    expect(matchesPick(pick(), open)).toBe(true);
    expect(matchesPick(pick(), { ...open, tier: "icon" })).toBe(false);
    expect(matchesPick(pick({ tier: "icon" }), { ...open, tier: "icon", l5: "60", l40: "40", day: "2026-10-31", score: "60" })).toBe(true);
    expect(matchesPick(pick({ l10: null }), { ...open, l10: "unknown" })).toBe(true);
    expect(matchesPick(pick({ l10: null }), { ...open, l10: "50" })).toBe(false);
    expect(matchesPick(pick({ day: "none" }), { ...open, day: "none" })).toBe(true);
    expect(matchesPick(pick({ day: null }), { ...open, day: "none" })).toBe(false);
    expect(matchesPick(pick({ day: null }), { ...open, day: "2026-10-31" })).toBe(false);
    expect(matchesPick(pick({ score: null }), { ...open, score: "unknown" })).toBe(true);
  });
});
