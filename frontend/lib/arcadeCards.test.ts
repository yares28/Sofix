import * as React from "react";
import { createRequire } from "node:module";
import { afterAll, expect, it, vi } from "vitest";
import ArcadeCards from "../components/arcade/ArcadeCards";
import { FdrContext } from "../components/arcade/Fdr";
import type { ArcadeCard, ArcadeGame } from "./arcade";
import type { Outlook } from "./arcadePlan";

const { renderToStaticMarkup } = createRequire(import.meta.url)("react-dom/server") as { renderToStaticMarkup(node: React.ReactNode): string };
vi.stubGlobal("React", React);
afterAll(() => vi.unstubAllGlobals());
const card: ArcadeCard = { slug: "card", player: "player", name: "A player", team: "Club", teamSlug: "club", teamPicture: null, league: null, positions: ["Forward"], picture: null, edition: "Holo", bonus: 1.1 };
const game: ArcadeGame = { id: "game", kickoff: "2026-10-25T12:00:00Z", status: "scheduled", competition: { slug: "laliga-es", name: "LaLiga" }, home: { slug: "club", name: "Club", crest: null }, away: { slug: "away", name: "Away", crest: null } };
const outlook: Outlook = { card, game, score: 60, decisive: .65, xd: .02, scoreSource: "sofix", start: 0, startSource: "futbolfantasy", startUrl: "https://www.futbolfantasy.com/partidos/22493", past: [], bonus: .1, club: 0 };
const side = { code: "CLB", name: "Club", difficulty: 0, bucket: 1 as const, label: "Very favourite", cleanSheet: null, xgFor: null, xgAgainst: null };
const draw = (o: Outlook = outlook) => renderToStaticMarkup(React.createElement(FdrContext.Provider, { value: new Map([[game.id, { league: "PD" as const, kickoff: game.kickoff, home: side, away: { ...side, code: "AWY" } }]]) }, React.createElement(ArcadeCards, { cards: [card], games: [game], outlooks: new Map([[game.id, [o]]]) })));

it("renders published xD as a decimal without recomputing it, while xScore retains the existing formula", () => {
  const zero = draw();
  const full = draw({ ...outlook, start: 1 });
  expect(zero).toContain('class="arc-card-xd"');
  expect(zero).toContain('>xD 0.02</span>');
  expect(full).toContain('>xD 0.02</span>');
  expect(zero).toContain('<small>xScore</small><b>0</b>');
  expect(full).toContain('<small>xScore</small><b>66</b>');
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
  expect(missing).toContain('<small>xScore</small><b>—</b>');
});
